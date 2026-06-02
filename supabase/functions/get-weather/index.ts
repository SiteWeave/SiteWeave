/**
 * Proxies WeatherAPI.com — API key stays server-side; requires authenticated user JWT.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeadersFor, corsPreflightResponse } from '../_shared/cors.ts'
import { jsonResponse, requireUser } from '../_shared/auth.ts'
import { parseGetWeatherBody } from '../_shared/schemas/getWeather.ts'

const WEATHER_API_KEY = Deno.env.get('WEATHER_API_KEY') ?? Deno.env.get('VITE_WEATHER_API_KEY') ?? ''
const WEATHER_API_URL = 'https://api.weatherapi.com/v1'

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const authResult = await requireUser(req, corsHeaders)
  if (authResult instanceof Response) return authResult

  if (!WEATHER_API_KEY) {
    return jsonResponse({ error: 'Weather service not configured' }, 503, corsHeaders)
  }

  try {
    const raw = await req.json()
    const parsed = parseGetWeatherBody(raw)
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, 400, corsHeaders)
    }
    const { mode, query, days } = parsed.data

    let endpoint = 'current.json'
    let url = `${WEATHER_API_URL}/${endpoint}?key=${WEATHER_API_KEY}&q=${encodeURIComponent(query)}`

    if (mode === 'forecast' || mode === 'extended') {
      endpoint = 'forecast.json'
      const dayCount = mode === 'extended' ? Math.min(days ?? 14, 14) : Math.min(days ?? 7, 7)
      url = `${WEATHER_API_URL}/${endpoint}?key=${WEATHER_API_KEY}&q=${encodeURIComponent(query)}&days=${dayCount}`
    }

    const response = await fetch(url)
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return jsonResponse(
        {
          error: data?.error?.message || 'Weather API error',
          status: response.status,
        },
        response.status >= 400 && response.status < 500 ? response.status : 502,
        corsHeaders,
      )
    }

    return jsonResponse({ data }, 200, corsHeaders)
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      500,
      corsHeaders,
    )
  }
})
