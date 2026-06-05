export interface NormalizedPhoneResult {
  e164: string | null
  isValid: boolean
}

/**
 * Normalize a free-text phone number to E.164 when possible.
 * Mirrors the project client logic for consistent behavior.
 */
export function normalizeAssigneePhone(raw: string, defaultRegion = 'US'): NormalizedPhoneResult {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return { e164: null, isValid: false }

  const digits = trimmed.replace(/[^\d+]/g, '')
  if (!digits) return { e164: null, isValid: false }

  if (digits.startsWith('+')) {
    const normalized = `+${digits.slice(1).replace(/\D/g, '')}`
    const nationalLength = normalized.length - 1
    if (nationalLength < 8 || nationalLength > 15) return { e164: null, isValid: false }
    return { e164: normalized, isValid: true }
  }

  const national = digits.replace(/\D/g, '')
  if (defaultRegion === 'US' && national.length === 10) {
    return { e164: `+1${national}`, isValid: true }
  }
  if (defaultRegion === 'US' && national.length === 11 && national.startsWith('1')) {
    return { e164: `+${national}`, isValid: true }
  }

  if (national.length >= 8 && national.length <= 15) {
    return { e164: `+${national}`, isValid: true }
  }

  return { e164: null, isValid: false }
}
