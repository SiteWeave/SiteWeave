import { reportOperationFailure } from '@siteweave/core-logic'
import { supabase } from '../supabaseClient'
import { captureException, getClientSource } from './sentry'

/**
 * Format error for toast display and capture to Sentry.
 * @param {unknown} error
 * @param {string} [context]
 * @returns {string}
 */
export const handleApiError = (error, context = '') => {
  console.error(`API Error ${context}:`, error)

  let message = 'An unexpected error occurred'

  if (error?.message) {
    message = error.message
  } else if (error?.error?.message) {
    message = error.error.message
  } else if (typeof error === 'string') {
    message = error
  }

  if (context) {
    message = `${context}: ${message}`
  }

  captureException(error instanceof Error ? error : new Error(message), {
    tags: { api_context: context || 'unknown' },
  })

  return message
}

/**
 * Report a failed CRUD/feature operation to Sentry + operation_failures.
 * Fire-and-forget; never throws.
 *
 * @param {unknown} error
 * @param {object} meta
 * @param {string} meta.feature
 * @param {string} meta.operation
 * @param {string} [meta.userId]
 * @param {string} [meta.organizationId]
 * @param {string} [meta.projectId]
 * @param {string} [meta.entityType]
 * @param {string|number} [meta.entityId]
 * @param {Record<string, unknown>} [meta.context]
 */
export function reportFeatureFailure(error, meta = {}) {
  void reportOperationFailure(supabase, {
    error,
    source: getClientSource(),
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

export const retryRequest = async (requestFn, maxRetries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn()
    } catch (error) {
      if (attempt === maxRetries) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, delay * attempt))
    }
  }
}

export const isOnline = () => navigator.onLine
