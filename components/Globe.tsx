'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export type GlobeMarker = {
  id: string
  lat: number
  lon: number
  label: string
  color: string
}

/**
 * Zoomable satellite globe.
 *
 * MapLibre's globe projection over NASA GIBS tiles.
 *
 * Why tiles: the previous hand-written three.js sphere could not zoom past its
 * single 5400px texture, and raising that texture was not an option — 8192px
 * takes GPU memory to ~214MB and fails outright on phones that cap textures at
 * 4096. Tiles fix it structurally: only what is on screen is fetched. That is
 * precisely why Apple and Google stream tiles instead of shipping one image.
 *
 * Why GIBS: it needs no API key and sends `Access-Control-Allow-Origin: *`, so
 * the browser can read it directly. Apple's MapKit needs a paid membership and
 * cannot feed a custom scene; Google Earth sends X-Frame-Options: SAMEORIGIN
 * and cannot be embedded at all. GIBS is public domain — and is the same source
 * zoom.earth runs on.
 */

const BASE_ZOOM = 1.3
const CLOSE_ZOOM = 4.2
/** Tilt lifted from the Google Earth link used as the reference (51.9t). */
const CLOSE_PITCH = 52

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
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRefs = useRef<Map<string, maplibregl.Marker>>(new Map())
  const selectRef = useRef(onSelect)
  const firstFly = useRef(true)
  selectRef.current = onSelect

  useEffect(() => {
    const el = mount.current
    if (!el || mapRef.current) return

    const map = new maplibregl.Map({
      container: el,
      attributionControl: false,
      style: {
        version: 8,
        projection: { type: 'globe' },
        sources: {
          // Base: the 2004 composite. Cloud-free and complete, so it fills any
          // hole the daily imagery leaves.
          bluemarble: {
            type: 'raster',
            tiles: [
              'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
            ],
            tileSize: 256,
            maxzoom: 8, // GIBS publishes this layer to level 8; beyond it 404s.
            attribution: 'NASA EOSDIS GIBS',
          },
          /*
           * High-detail imagery, for everything past orbit.
           *
           * GIBS stops at level 8 — fine from space, mush up close. Esri's
           * World Imagery carries on to ~19 (street level), needs no key, and
           * sends `Access-Control-Allow-Origin: *`.
           */
          detail: {
            type: 'raster',
            tiles: [
              'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution: 'Esri, Maxar, Earthstar Geographics',
          },
          /*
           * MODIS daily true-colour is deliberately NOT layered on top.
           *
           * The satellite images the globe in orbital swaths, so a single day
           * has no-data gaps between passes — and because GIBS serves these
           * tiles as JPEG, which has no alpha, those gaps arrive as solid
           * black and paint straight over the base instead of letting it show
           * through. The result was an Earth striped with black wedges.
           * Compositing daily imagery properly needs a source with real
           * transparency, not an opacity slider.
           */
        },
        layers: [
          { id: 'space', type: 'background', paint: { 'background-color': '#04050A' } },
          {
            // Blue Marble holds the wide view: its shaded relief and bathymetry
            // look better from orbit than a raw imagery mosaic.
            id: 'earth',
            type: 'raster',
            source: 'bluemarble',
            paint: {
              'raster-fade-duration': 300,
              // Small lift: the raw composite reads flat and dim on black.
              'raster-saturation': 0.12,
              'raster-contrast': 0.08,
              'raster-brightness-min': 0.02,
            },
          },
          {
            // Detail fades in as you descend, so the handover is a dissolve
            // rather than a visible swap.
            id: 'earth-detail',
            type: 'raster',
            source: 'detail',
            paint: {
              'raster-opacity': ['interpolate', ['linear'], ['zoom'], 2.5, 0, 5, 1],
              'raster-fade-duration': 300,
            },
          },
        ],
        // Space above, atmosphere at the limb — what the old shader drew by hand.
        sky: {
          'sky-color': '#0a1030',
          'sky-horizon-blend': 0.5,
          'horizon-color': '#5b8cff',
          'horizon-fog-blend': 0.6,
          'fog-color': '#04050A',
          'fog-ground-blend': 0.04,
          // Atmosphere fades out as you descend; from orbit it should be strong.
          'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.95, 5, 0.5, 9, 0],
        },
      },
      center: [78, 22],
      zoom: BASE_ZOOM,
      renderWorldCopies: false,
      // No idle spin — it holds still until the viewer moves it.
    })

    // No MapLibre controls: they anchor to the canvas, whose corners now sit
    // off-screen under this framing. Zoom is scroll/pinch; the NASA and Esri
    // credits their licences require are rendered by the page instead.
    map.on('style.load', () => map.setProjection({ type: 'globe' }))

    mapRef.current = map
    return () => {
      for (const m of markerRefs.current.values()) m.remove()
      markerRefs.current.clear()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // One pin, for the selected place only, and it blinks.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const [id, m] of markerRefs.current) {
      if (id !== selectedId) { m.remove(); markerRefs.current.delete(id) }
    }

    const target = markers.find((x) => x.id === selectedId)
    if (!target) return

    const existing = markerRefs.current.get(target.id)
    if (existing) { existing.setLngLat([target.lon, target.lat]); return }

    const el = document.createElement('div')
    el.className = 'globe-pin'
    el.style.setProperty('--pin', target.color)
    el.setAttribute('aria-label', target.label)
    const marker = new maplibregl.Marker({ element: el }).setLngLat([target.lon, target.lat]).addTo(map)
    markerRefs.current.set(target.id, marker)
  }, [markers, selectedId])

  // Fly to the selection, tilting in as it arrives.
  useEffect(() => {
    const map = mapRef.current
    const target = markers.find((x) => x.id === selectedId)
    if (!map || !target) return

    const go = () => {
      map.flyTo({
        center: [target.lon, target.lat],
        zoom: CLOSE_ZOOM,
        pitch: CLOSE_PITCH,
        duration: firstFly.current ? 2600 : 1400,
        essential: true, // still runs under prefers-reduced-motion, just as a jump
      })
      firstFly.current = false
    }

    if (map.loaded()) go()
    else map.once('load', go)
  }, [markers, selectedId])

  /*
   * Framing: the globe's centre is parked on the page's bottom-right corner, so
   * only its upper-left quadrant fills the view — the limb sweeps from the left
   * edge up to the top-right, exactly as in the reference.
   *
   * MapLibre always centres the globe in its own canvas, so the canvas is made
   * twice the page in each axis and pinned at top-left. Its centre then lands
   * on the wrapper's bottom-right corner, and the wrapper clips the rest. The
   * doubled canvas also renders the sphere at 2x, which is what fills the page.
   */
  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={mount} style={{ position: 'absolute', top: 0, left: 0, width: '200%', height: '200%' }} />
    </div>
  )
}
