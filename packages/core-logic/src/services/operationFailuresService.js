/**
 * Best-effort reporting of failed CRUD / feature operations.
 * Never throws to callers — failures must not break UX toast flows.
 */

const ALLOWED_SOURCES = new Set(['web', 'electron', 'mobile', 'edge']);

/**
 * @param {unknown} error
 * @returns {string}
 */
export function getErrorMessage(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error.message) return String(error.message);
  if (error.error?.message) return String(error.error.message);
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * @param {unknown} error
 * @returns {string|null}
 */
export function getErrorCode(error) {
  if (!error || typeof error !== 'object') return null;
  const code = error.code || error.error?.code || error.status || error.statusCode;
  return code != null ? String(code) : null;
}

/**
 * Sanitize context — drop obvious secrets and truncate large strings.
 * @param {Record<string, unknown>|null|undefined} context
 * @returns {Record<string, unknown>}
 */
function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return {};
  const out = {};
  const secretKey = /password|secret|token|authorization|api[_-]?key|service[_-]?role/i;
  for (const [key, value] of Object.entries(context)) {
    if (secretKey.test(key)) continue;
    if (typeof value === 'string' && value.length > 500) {
      out[key] = `${value.slice(0, 500)}…`;
    } else if (value != null && typeof value !== 'function') {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Persist an operation failure and optionally capture to Sentry via callback.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} supabase
 * @param {object} params
 * @param {unknown} params.error
 * @param {'web'|'electron'|'mobile'|'edge'} params.source
 * @param {string} params.feature - e.g. 'tasks'
 * @param {string} params.operation - e.g. 'create'
 * @param {string} [params.userId]
 * @param {string} [params.organizationId]
 * @param {string} [params.projectId]
 * @param {string} [params.entityType]
 * @param {string|number} [params.entityId]
 * @param {Record<string, unknown>} [params.context]
 * @param {(error: unknown, hint?: object) => string|null|undefined|void} [params.captureException]
 * @returns {Promise<{ id: string|null, sentryEventId: string|null }>}
 */
export async function reportOperationFailure(supabase, params = {}) {
  const {
    error,
    source = 'web',
    feature = 'unknown',
    operation = 'unknown',
    userId = null,
    organizationId = null,
    projectId = null,
    entityType = null,
    entityId = null,
    context = {},
    captureException,
  } = params;

  let sentryEventId = null;
  try {
    if (typeof captureException === 'function') {
      const eventId = captureException(error instanceof Error ? error : new Error(getErrorMessage(error)), {
        tags: {
          feature: String(feature),
          operation: String(operation),
          source: ALLOWED_SOURCES.has(source) ? source : 'web',
        },
        extra: sanitizeContext(context),
      });
      if (eventId) sentryEventId = String(eventId);
    }
  } catch (captureErr) {
    console.warn('[operationFailures] captureException failed:', captureErr);
  }

  if (!supabase) {
    return { id: null, sentryEventId };
  }

  try {
    const row = {
      source: ALLOWED_SOURCES.has(source) ? source : 'web',
      feature: String(feature).slice(0, 120),
      operation: String(operation).slice(0, 120),
      message: getErrorMessage(error).slice(0, 2000),
      error_code: getErrorCode(error),
      user_id: userId || null,
      organization_id: organizationId || null,
      project_id: projectId || null,
      entity_type: entityType ? String(entityType).slice(0, 80) : null,
      entity_id: entityId != null ? String(entityId).slice(0, 120) : null,
      sentry_event_id: sentryEventId,
      context: sanitizeContext(context),
    };

    const { data, error: insertError } = await supabase
      .from('operation_failures')
      .insert(row)
      .select('id')
      .maybeSingle();

    if (insertError) {
      console.warn('[operationFailures] insert failed:', insertError.message);
      return { id: null, sentryEventId };
    }

    return { id: data?.id || null, sentryEventId };
  } catch (insertErr) {
    console.warn('[operationFailures] insert threw:', insertErr);
    return { id: null, sentryEventId };
  }
}
