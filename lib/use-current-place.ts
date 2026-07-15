'use client'

import { useEffect, useState } from 'react'

export type CurrentPlace = {
  lat: number
  lon: number
  city: string
  temperature: number | null
  humidity: number | null
  windspeed: number | null
  uv: number | null
}

type State = {
  place: CurrentPlace | null
  loading: boolean
  /** Set when the browser refuses or the lookup fails — callers must cope. */
  error: string | null
}

/** Module-level cache: geolocation + two network round-trips per mount is rude. */
let cached: CurrentPlace | null = null
let inflight: Promise<CurrentPlace | null> | null = null

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
      headers: { 'Accept-Language': 'en' },
    })
    const d = await r.json()
    const a = d.address ?? {}
    return a.city || a.town || a.village || a.county || a.state || 'Your location'
  } catch {
    return 'Your location'
  }
}

async function fetchWeather(lat: number, lon: number) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=relativehumidity_2m,uv_index&current_weather=true&timezone=auto&forecast_days=1`
    const r = await fetch(url)
    const d = await r.json()
    const hour = new Date().getHours()
    return {
      temperature: d.current_weather?.temperature ?? null,
      windspeed: d.current_weather?.windspeed ?? null,
      humidity: d.hourly?.relativehumidity_2m?.[hour] ?? null,
      uv: d.hourly?.uv_index?.[hour] ?? null,
    }
  } catch {
    return { temperature: null, windspeed: null, humidity: null, uv: null }
  }
}

function locate(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Geolocation is not supported by this browser'))
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 5 * 60 * 1000 })
  })
}

/**
 * The viewer's own location and its live weather.
 *
 * Feeds the globe's "you are here" marker so it opens on the viewer rather
 * than on an arbitrary sensor. Every failure path resolves to null instead of
 * throwing: geolocation is refused far more often than it is granted, and the
 * globe must still work for everyone who says no.
 */
export function useCurrentPlace(enabled = true): State {
  const [state, setState] = useState<State>({ place: cached, loading: enabled && !cached, error: null })

  useEffect(() => {
    if (!enabled || cached) return
    let alive = true

    inflight ??= (async () => {
      try {
        const pos = await locate()
        const { latitude: lat, longitude: lon } = pos.coords
        const [city, w] = await Promise.all([reverseGeocode(lat, lon), fetchWeather(lat, lon)])
        cached = { lat, lon, city, ...w }
        return cached
      } catch {
        return null
      } finally {
        inflight = null
      }
    })()

    inflight.then((p) => {
      if (!alive) return
      setState({ place: p, loading: false, error: p ? null : 'Location unavailable' })
    })

    return () => { alive = false }
  }, [enabled])

  return state
}
