/**
 * App version for web UI — always read from monorepo root (same as desktop Electron).
 */
import packageJson from '../../../../package.json';

export const APP_VERSION = packageJson.version;
export default packageJson;
