/**
 * App version for web UI — read from apps/web/package.json (inside Vite project root).
 * Keep in sync with the monorepo root package.json on release.
 */
import packageJson from '../../package.json';

export const APP_VERSION = packageJson.version;
export default packageJson;
