import { z } from 'https://esm.sh/zod@3.23.8'

const bodySchema = z.object({
  mode: z.enum(['current', 'forecast', 'extended']),
  city: z.string().max(120).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  days: z.number().int().min(1).max(14).optional(),
})

export type GetWeatherBody = z.infer<typeof bodySchema>

export function parseGetWeatherBody(
  raw: unknown,
): { ok: true; data: { mode: GetWeatherBody['mode']; query: string; days?: number } } | { ok: false; error: string } {
  const result = bodySchema.safeParse(raw)
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'Invalid request' }
  }

  const { mode, city, latitude, longitude, days } = result.data
  let query: string
  if (latitude != null && longitude != null) {
    query = `${latitude},${longitude}`
  } else if (city?.trim()) {
    query = city.trim()
  } else {
    return { ok: false, error: 'Provide city or latitude/longitude' }
  }

  return { ok: true, data: { mode, query, days } }
}
