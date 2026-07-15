'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export type GlobeMarker = {
  id: string
  lat: number
  lon: number
  label: string
  color: string
}

const R = 1
/** Camera distances: FAR = whole globe in frame, NEAR = zoomed onto a place. */
const FAR = 3.75
const NEAR = 2.85
const MIN_DIST = 1.55
const MAX_DIST = 5.5

type Fly = {
  from: { x: number; y: number; dist: number }
  to: { x: number; y: number; dist: number }
  t0: number
  ms: number
}

/**
 * Equirectangular lat/lon -> a point on the sphere.
 * The texture's seam sits at lon 180, hence the +180 offset.
 */
function latLonToVec3(lat: number, lon: number, radius = R) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lon + 180) * Math.PI) / 180
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

/**
 * Globe rotation that brings a marker to face the camera (+Z).
 *
 * Yaw swings the point into the +Z plane; pitch then lifts it to the equator of
 * the view. Solved rather than tweened blindly, so a marker lands dead centre
 * regardless of where the globe happened to be.
 */
function rotationFacing(lat: number, lon: number) {
  const p = latLonToVec3(lat, lon)
  const yaw = -Math.atan2(p.x, p.z)
  const hyp = Math.sqrt(p.x * p.x + p.z * p.z)
  const pitch = Math.atan2(p.y, hyp)
  return { x: pitch, y: yaw }
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const shortestAngle = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function Globe({
  markers,
  selectedId,
  onSelect,
  className,
}: {
  markers: GlobeMarker[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  className?: string
}) {
  const mount = useRef<HTMLDivElement>(null)
  // Refs so the animation loop reads live values without being torn down and
  // rebuilt on every render (rebuilding a WebGL context per render is ruinous).
  const markersRef = useRef(markers)
  const selectRef = useRef(onSelect)
  const selIdRef = useRef(selectedId)
  const flyRef = useRef<Fly | null>(null)
  markersRef.current = markers
  selectRef.current = onSelect
  selIdRef.current = selectedId

  const globeRef = useRef<{ x: number; y: number } | null>(null)
  // Camera distance is the zoom. Starts wide, like Astronomy opening on the
  // whole Earth before it dives to your location.
  const camRef = useRef({ dist: FAR })
  const firstFly = useRef(true)

  // Fly to whichever marker is selected: swing it to face us, then dolly in.
  useEffect(() => {
    const m = markers.find((x) => x.id === selectedId)
    if (!m) return
    const g = (globeRef.current ??= { x: 0.18, y: -1.6 })
    const to = rotationFacing(m.lat, m.lon)
    flyRef.current = {
      from: { x: g.x, y: g.y, dist: camRef.current.dist },
      to: {
        x: g.x + shortestAngle(g.x, to.x),
        y: g.y + shortestAngle(g.y, to.y),
        dist: NEAR,
      },
      t0: performance.now(),
      // The opening move gets a longer, more cinematic run; later picks are snappier.
      ms: firstFly.current ? 2200 : 1250,
    }
    firstFly.current = false
  }, [selectedId, markers])

  useEffect(() => {
    const el = mount.current
    if (!el) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.z = camRef.current.dist

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    el.appendChild(renderer.domElement)
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;cursor:grab'

    // ---- Earth
    const loader = new THREE.TextureLoader()
    const maxAniso = renderer.capabilities.getMaxAnisotropy()
    const nightTex = loader.load('/textures/earth-night.jpg')
    const dayTex = loader.load('/textures/earth-day.jpg')
    const cloudTex = loader.load('/textures/earth-clouds.jpg')
    for (const t of [nightTex, dayTex, cloudTex]) {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = maxAniso
    }

    /**
     * Day/night terminator.
     *
     * Neither texture alone is realistic: Black Marble is all city lights and
     * no daylight, Blue Marble is all daylight and no lights. Mixing them by
     * the sun angle gives the real thing — a lit day side, a soft dusk band,
     * and cities emerging only after dark, which is what Astronomy shows.
     */
    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        uDay: { value: dayTex },
        uNight: { value: nightTex },
        // Sun sits behind and slightly over the viewer's shoulder, so whatever
        // face you are looking at is lit and the terminator falls near the
        // limb. A world-fixed sun would leave the selected place in darkness
        // half the time; Astronomy always shows you a lit Earth.
        uSun: { value: new THREE.Vector3(0.2, 0.14, 1).normalize() },
      },
      vertexShader: `
        varying vec2 vUv; varying vec3 vNormal;
        void main(){
          vUv = uv;
          // World-space normal: the sun must stay fixed while the globe turns.
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uDay; uniform sampler2D uNight; uniform vec3 uSun;
        varying vec2 vUv; varying vec3 vNormal;

        // ACES filmic curve. Straight gain clipped snow and cloud to flat white
        // and drove the deserts neon; this rolls the highlights off instead of
        // hitting the ceiling, which is what makes the reference look shot
        // rather than rendered.
        vec3 aces(vec3 x){
          const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
          return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }

        void main(){
          float sun = dot(normalize(vNormal), normalize(uSun));
          // Wide smoothstep = a dusk band rather than a hard day/night line.
          float t = smoothstep(-0.18, 0.32, sun);
          vec3 day = texture2D(uDay, vUv).rgb;
          vec3 night = texture2D(uNight, vUv).rgb;
          // Lights fade out as dawn arrives instead of vanishing abruptly.
          vec3 lights = night * (1.0 - t) * 1.1;

          vec3 lit = day * clamp(t, 0.02, 1.0) * 1.15;
          // Gentle saturation only — 1.35 turned Arabia fluorescent.
          float lum = dot(lit, vec3(0.2126, 0.7152, 0.0722));
          lit = mix(vec3(lum), lit, 1.12);

          gl_FragColor = vec4(aces(lit + lights), 1.0);
        }
      `,
    })

    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 128), earthMat)

    /**
     * Everything orbital lives in one group so it can be shifted together.
     *
     * The Earth is pushed down and right so its limb arcs across the top-left
     * and leaves black space there — that corner is where the readout sits, and
     * a centred globe would put land behind the text.
     */
    const root = new THREE.Group()
    root.position.set(0.30, -0.42, 0)
    // Tilt: the reference is shot from an inclined orbit, so its horizon runs
    // diagonally rather than level. Rotating the whole group keeps the
    // atmosphere and markers locked to the same slant.
    root.rotation.z = -0.3
    root.add(earth)
    scene.add(root)

    // ---- Stars: a little depth in the empty corner.
    const starGeo = new THREE.BufferGeometry()
    const starCount = 900
    const starPos = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      // Rejection-sample a shell so stars sit far behind the globe, never inside it.
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      v.multiplyScalar(14 + Math.random() * 10)
      starPos.set([v.x, v.y, v.z], i * 3)
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, sizeAttenuation: true, transparent: true, opacity: 0.75 }),
    )
    scene.add(stars)

    /**
     * Clouds, on their own shell just above the surface.
     *
     * The source is a white-on-black mask, so it is used as an alpha channel
     * rather than a colour map — drawn as white lit by the same sun, and faded
     * out on the night side so cloud does not glow in the dark.
     */
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.006, 96, 96),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uClouds: { value: cloudTex },
          uSun: { value: new THREE.Vector3(0.2, 0.14, 1).normalize() },
        },
        vertexShader: `
          varying vec2 vUv; varying vec3 vNormal;
          void main(){ vUv = uv; vNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
        `,
        fragmentShader: `
          uniform sampler2D uClouds; uniform vec3 uSun;
          varying vec2 vUv; varying vec3 vNormal;
          void main(){
            float a = texture2D(uClouds, vUv).r;
            float sun = dot(normalize(vNormal), normalize(uSun));
            float lit = smoothstep(-0.18, 0.32, sun);
            gl_FragColor = vec4(vec3(0.92) * (0.4 + lit * 0.6), a * lit * 0.44);
          }
        `,
      }),
    )
    earth.add(clouds)

    // ---- Atmosphere: fresnel rim, brightest at the limb, as seen from orbit.
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.055, 96, 96),
      new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uColor: { value: new THREE.Color('#4d7ee8') } },
        vertexShader: `
          varying vec3 vN; varying vec3 vP;
          void main(){ vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz;
            gl_Position = projectionMatrix * mv; }
        `,
        fragmentShader: `
          uniform vec3 uColor; varying vec3 vN; varying vec3 vP;
          void main(){
            float rim = 1.0 - abs(dot(normalize(vN), normalize(-vP)));
            // Steeper falloff and lower gain: the previous curve produced a
            // hard painted ring instead of a soft limb bleeding into space.
            // Two lobes: a tight brilliant line hugging the limb, plus a wide faint
            // bloom. One lobe alone reads either as a hard ring or as haze.
            float a = pow(rim, 14.0) * 1.7 + pow(rim, 3.2) * 0.14;
            gl_FragColor = vec4(uColor, a);
          }
        `,
      }),
    )
    root.add(atmosphere)

    /**
     * A single marker: the selected place, and nothing else.
     *
     * Scattering a dot on every monitored site turned the Earth into a map
     * legend. One small blinking point is the whole idea — you are here.
     */
    const markerGroup = new THREE.Group()
    earth.add(markerGroup)
    const dots: THREE.Mesh[] = []

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.0055, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    )
    markerGroup.add(dot)
    dots.push(dot)

    // Ring faces outward, so it reads as painted on the surface.
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.009, 0.014, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    markerGroup.add(halo)

    /** Moves the one marker to whichever place is selected. */
    const placeMarker = () => {
      const m = markersRef.current.find((x) => x.id === selIdRef.current) ?? markersRef.current[0]
      if (!m) { markerGroup.visible = false; return }
      markerGroup.visible = true
      const pos = latLonToVec3(m.lat, m.lon, R * 1.02)
      dot.position.copy(pos)
      dot.userData.id = m.id
      halo.position.copy(pos)
      halo.lookAt(pos.clone().multiplyScalar(2))
      const c = new THREE.Color(m.color)
      ;(dot.material as THREE.MeshBasicMaterial).color = c
      ;(halo.material as THREE.MeshBasicMaterial).color = c
    }
    placeMarker()

    // ---- Interaction
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let dragging = false
    let last = { x: 0, y: 0 }
    let moved = 0
    const vel = { x: 0, y: 0 }
    const rot = (globeRef.current ??= { x: 0.18, y: -1.6 })

    const onDown = (e: PointerEvent) => {
      dragging = true; moved = 0; last = { x: e.clientX, y: e.clientY }
      flyRef.current = null // a drag cancels an in-flight animation
      renderer.domElement.style.cursor = 'grabbing'
    }
    const onMove = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1
      ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1
      if (!dragging) return
      const dx = e.clientX - last.x, dy = e.clientY - last.y
      moved += Math.abs(dx) + Math.abs(dy)
      rot.y += dx * 0.005
      rot.x += dy * 0.005
      rot.x = Math.max(-1.2, Math.min(1.2, rot.x))
      vel.y = dx * 0.005; vel.x = dy * 0.005
      last = { x: e.clientX, y: e.clientY }
    }
    const onUp = () => { dragging = false; renderer.domElement.style.cursor = 'grab' }

    // Wheel / trackpad pinch = zoom. Lets the viewer pull back for the whole
    // globe after the opening dive, or push in past it.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      flyRef.current = null // manual zoom overrides an in-flight dive
      const k = Math.exp(e.deltaY * 0.0016)
      camRef.current.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, camRef.current.dist * k))
    }

    // Two-finger pinch on touch.
    const touches = new Map<number, { x: number; y: number }>()
    let pinchStart = 0
    let pinchDist0 = 0
    const pinchSpan = () => {
      const [a, b] = [...touches.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const onTouchDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touches.size === 2) { pinchStart = pinchSpan(); pinchDist0 = camRef.current.dist; dragging = false }
    }
    const onTouchMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touches.size === 2 && pinchStart > 0) {
        flyRef.current = null
        const ratio = pinchStart / Math.max(1, pinchSpan())
        camRef.current.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, pinchDist0 * ratio))
      }
    }
    const onTouchUp = (e: PointerEvent) => { touches.delete(e.pointerId); if (touches.size < 2) pinchStart = 0 }
    const onClick = (e: MouseEvent) => {
      if (moved > 6) return // that was a drag, not a click
      const r = renderer.domElement.getBoundingClientRect()
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1
      ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(dots, false)[0]
      if (hit) selectRef.current?.(hit.object.userData.id as string)
    }

    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerdown', onTouchDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointermove', onTouchMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointerup', onTouchUp)
    window.addEventListener('pointercancel', onTouchUp)
    renderer.domElement.addEventListener('click', onClick)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

    // ---- Resize
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    // Never animate off-screen: a hidden tab should not burn a GPU.
    let visible = true
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting }, { threshold: 0.01 })
    io.observe(el)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!visible) return

      const fly = flyRef.current
      if (fly) {
        const t = Math.min(1, (performance.now() - fly.t0) / fly.ms)
        const k = easeInOut(t)
        rot.x = fly.from.x + (fly.to.x - fly.from.x) * k
        rot.y = fly.from.y + (fly.to.y - fly.from.y) * k
        camRef.current.dist = fly.from.dist + (fly.to.dist - fly.from.dist) * k
        if (t >= 1) flyRef.current = null
      } else if (!dragging) {
        // Inertia only — it decays to a stop. The globe is STATIC at rest: no
        // idle spin, matching the Astronomy wallpaper, which holds still on
        // your location until you move it.
        vel.y *= 0.92; vel.x *= 0.92
        if (Math.abs(vel.y) < 0.00008) vel.y = 0
        if (Math.abs(vel.x) < 0.00008) vel.x = 0
        rot.y += vel.y
        rot.x += vel.x
      }

      earth.rotation.x = rot.x
      earth.rotation.y = rot.y
      camera.position.z += (camRef.current.dist - camera.position.z) * 0.16

      // The one marker follows the selection and blinks.
      placeMarker()
      const t = performance.now()
      const beat = Math.abs(Math.sin(t / 620))
      const haloMat = halo.material as THREE.MeshBasicMaterial
      haloMat.opacity = reduced ? 0.5 : 0.2 + beat * 0.55
      halo.scale.setScalar(reduced ? 1 : 1 + beat * 0.55)
      ;(dot.material as THREE.MeshBasicMaterial).opacity = 1
      dot.scale.setScalar(reduced ? 1 : 0.95 + beat * 0.15)

      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerdown', onTouchDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointermove', onTouchMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointerup', onTouchUp)
      window.removeEventListener('pointercancel', onTouchUp)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.domElement.removeEventListener('wheel', onWheel)
      // WebGL contexts are a finite resource — leaking one per mount will
      // eventually blank the canvas with "too many contexts".
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose?.()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose?.()
      })
      nightTex.dispose()
      dayTex.dispose()
      cloudTex.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mount} className={className} style={{ width: '100%', height: '100%', touchAction: 'pan-y' }} />
}
