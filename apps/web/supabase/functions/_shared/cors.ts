const DEFAULT_ORIGINS = [
  'https://app.siteweave.org',
  'https://siteweave.org',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
]

function parseAllowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_CORS_ORIGINS') ?? ''
  const fromEnv = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  return [...new Set([...DEFAULT_ORIGINS, ...fromEnv])]
}

const ALLOWED_ORIGINS = parseAllowedOrigins()

export function resolveCorsOrigin(req: Request): string {
  const origin = req.headers.get('Origin') ?? ''
  if (!origin) return ALLOWED_ORIGINS[0]
  if (ALLOWED_ORIGINS.includes(origin)) return origin
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    return origin
  }
  return ALLOWED_ORIGINS[0]
}

export function corsHeadersFor(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveCorsOrigin(req),
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-cron-secret, x-platform-admin-secret',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Vary': 'Origin',
  }
}

/** @deprecated use corsHeadersFor(req) — kept for gradual migration */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret, x-platform-admin-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function corsPreflightResponse(req?: Request): Response {
  const headers = req ? corsHeadersFor(req) : corsHeaders
  return new Response('ok', { status: 200, headers })
}
