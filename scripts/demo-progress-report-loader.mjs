/**
 * Loader hook: redirect i18n config imports to a tiny Node-safe mock.
 */
export async function resolve(specifier, context, nextResolve) {
  if (
    specifier === '../i18n/config' ||
    specifier.endsWith('/i18n/config') ||
    specifier.endsWith('/i18n/config.js')
  ) {
    return {
      shortCircuit: true,
      url: new URL('./demo-progress-report-i18n-mock.mjs', import.meta.url).href,
    };
  }
  return nextResolve(specifier, context);
}
