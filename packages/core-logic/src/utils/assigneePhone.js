/**
 * Normalize a free-text phone for assignee lookup (E.164).
 * @param {string} raw
 * @param {{ defaultRegion?: string }} [options]
 * @returns {{ e164: string | null, isValid: boolean }}
 */
export function normalizeAssigneePhone(raw, options = {}) {
    let trimmed = String(raw ?? '').trim();
    // Strip extension suffixes common in legacy contact records (ext 123, x456).
    trimmed = trimmed.replace(/\s*(?:ext(?:ension)?\.?|x)\s*#?\s*\d+\s*$/i, '').trim();
    if (!trimmed) {
        return { e164: null, isValid: false };
    }

    const digits = trimmed.replace(/[^\d+]/g, '');
    if (!digits) {
        return { e164: null, isValid: false };
    }

    // If phone already contains a + prefix, keep it and validate plausible E.164 length.
    if (digits.startsWith('+')) {
        const normalized = `+${digits.slice(1).replace(/\D/g, '')}`;
        const nationalLength = normalized.length - 1;
        if (nationalLength < 8 || nationalLength > 15) {
            return { e164: null, isValid: false };
        }
        return { e164: normalized, isValid: true };
    }

    // Fallback for national input: default to US country code, matching prior defaultRegion behavior.
    const defaultRegion = options.defaultRegion ?? 'US';
    const national = digits.replace(/\D/g, '');
    if (defaultRegion === 'US' && national.length === 10) {
        return { e164: `+1${national}`, isValid: true };
    }
    if (defaultRegion === 'US' && national.length === 11 && national.startsWith('1')) {
        return { e164: `+${national}`, isValid: true };
    }

    // As a generic fallback, accept plausible international-length numbers.
    if (national.length >= 8 && national.length <= 15) {
        return { e164: `+${national}`, isValid: true };
    }

    return { e164: null, isValid: false };
}
