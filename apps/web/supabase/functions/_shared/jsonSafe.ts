// deno-lint-ignore-file no-explicit-any
/**
 * Deep-clone values into JSON-serializable shapes (bigint → string, Date → ISO, etc.).
 * Uses a recursion stack so true circular references become "[Circular]" instead of blowing the stack.
 */
const MAX_JSON_DEPTH = 80

export function deepSanitizeForJson(value: unknown, depth = 0, stack?: Set<object>): any {
  if (depth > MAX_JSON_DEPTH) return '[MaxDepth]'
  if (value === null) return null
  if (value === undefined) return undefined

  const t = typeof value
  if (t === 'bigint') return (value as bigint).toString()
  if (t === 'boolean' || t === 'number' || t === 'string') return value
  if (t === 'function' || t === 'symbol') return undefined

  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isNaN(ms) ? null : value.toISOString()
  }

  if (Array.isArray(value)) {
    const arr = value as unknown[]
    const st = stack ?? new Set<object>()
    if (st.has(arr as object)) return '[Circular]'
    st.add(arr as object)
    const out = arr.map((item) => {
      const v = deepSanitizeForJson(item, depth + 1, st)
      return v === undefined ? null : v
    })
    st.delete(arr as object)
    return out
  }

  if (t === 'object') {
    const obj = value as object
    const st = stack ?? new Set<object>()
    if (st.has(obj)) return '[Circular]'
    st.add(obj)
    const out: Record<string, any> = {}
    for (const k of Object.keys(obj)) {
      const v = deepSanitizeForJson((obj as Record<string, unknown>)[k], depth + 1, st)
      if (v !== undefined) out[k] = v
    }
    st.delete(obj)
    return out
  }

  return String(value)
}

export function jsonStringifySafe(value: unknown): string {
  return JSON.stringify(deepSanitizeForJson(value))
}
