import { reportOperationFailure } from '@siteweave/core-logic'
import { captureException } from './sentry'

/**
 * Fire-and-forget operation failure report for mobile.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {unknown} error
 * @param {object} meta
 */
export function reportFeatureFailure(supabase, error, meta = {}) {
  void reportOperationFailure(supabase, {
    error,
    source: 'mobile',
    feature: meta.feature || 'unknown',
    operation: meta.operation || 'unknown',
    userId: meta.userId || null,
    organizationId: meta.organizationId || null,
    projectId: meta.projectId || null,
    entityType: meta.entityType || null,
    entityId: meta.entityId ?? null,
    context: meta.context || {},
    captureException,
  })
}
