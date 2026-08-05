import { trackPageView, trackEvent } from './posthog'

export function markPerf(metricName, startTime) {
  const durationMs = Math.round(performance.now() - startTime)
  if (durationMs < 0) return
  if (import.meta.env.DEV) {
    console.info(`[web-telemetry] ${metricName}: ${durationMs}ms`)
  }
  trackEvent('perf_metric', { metric: metricName, duration_ms: durationMs })
}

export function trackRouteChange(pathname) {
  if (import.meta.env.DEV) {
    console.info(`[web-telemetry] route_change: ${pathname}`)
  }
  trackPageView(pathname)
}
