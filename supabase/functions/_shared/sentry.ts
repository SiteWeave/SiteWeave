/**
 * Lightweight Sentry capture for Deno edge functions via ingest API.
 * No-ops when SENTRY_DSN is unset.
 */

const SENTRY_DSN = (Deno.env.get('SENTRY_DSN') ?? '').trim()

type ParsedDsn = {
  publicKey: string
  host: string
  projectId: string
}

function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn)
    const publicKey = url.username
    const projectId = url.pathname.replace(/^\//, '').split('/')[0]
    if (!publicKey || !projectId) return null
    return { publicKey, host: url.host, projectId }
  } catch {
    return null
  }
}

/**
 * @returns event id (uuid) or null
 */
export async function captureEdgeException(
  error: unknown,
  options: {
    feature?: string
    operation?: string
    extra?: Record<string, unknown>
  } = {},
): Promise<string | null> {
  if (!SENTRY_DSN) return null
  const parsed = parseDsn(SENTRY_DSN)
  if (!parsed) return null

  const eventId = crypto.randomUUID().replace(/-/g, '')
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String((error as { message?: string })?.message || error || 'Unknown error')

  const stack = error instanceof Error ? error.stack : undefined
  const environment = Deno.env.get('SENTRY_ENVIRONMENT') || Deno.env.get('ENVIRONMENT') || 'production'

  const payload = {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: 'error',
    environment,
    server_name: 'supabase-edge',
    tags: {
      source: 'edge',
      feature: options.feature || 'edge',
      operation: options.operation || 'unknown',
    },
    extra: options.extra || {},
    exception: {
      values: [
        {
          type: error instanceof Error ? error.name : 'Error',
          value: message,
          stacktrace: stack
            ? {
                frames: String(stack)
                  .split('\n')
                  .slice(1, 20)
                  .map((line) => ({ filename: line.trim() })),
              }
            : undefined,
        },
      ],
    },
  }

  const ingestUrl = `https://${parsed.host}/api/${parsed.projectId}/store/`
  try {
    await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.publicKey}`,
      },
      body: JSON.stringify(payload),
    })
    return eventId
  } catch (err) {
    console.warn('[sentry] edge capture failed:', err)
    return null
  }
}

/**
 * Capture + insert operation_failures via service-role client.
 */
export async function reportEdgeOperationFailure(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: { from: (table: string) => any },
  params: {
    error: unknown
    feature: string
    operation: string
    userId?: string | null
    organizationId?: string | null
    projectId?: string | null
    entityType?: string | null
    entityId?: string | number | null
    context?: Record<string, unknown>
  },
): Promise<void> {
  const message =
    params.error instanceof Error
      ? params.error.message
      : typeof params.error === 'string'
        ? params.error
        : String((params.error as { message?: string })?.message || 'Unknown error')

  let sentryEventId: string | null = null
  try {
    sentryEventId = await captureEdgeException(params.error, {
      feature: params.feature,
      operation: params.operation,
      extra: params.context,
    })
  } catch {
    // ignore
  }

  try {
    await supabaseAdmin.from('operation_failures').insert({
      source: 'edge',
      feature: params.feature,
      operation: params.operation,
      message: message.slice(0, 2000),
      user_id: params.userId || null,
      organization_id: params.organizationId || null,
      project_id: params.projectId || null,
      entity_type: params.entityType || null,
      entity_id: params.entityId != null ? String(params.entityId) : null,
      sentry_event_id: sentryEventId,
      context: params.context || {},
    })
  } catch (err) {
    console.warn('[operation_failures] edge insert failed:', err)
  }
}
