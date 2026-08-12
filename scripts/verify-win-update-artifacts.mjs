/**
 * Validate Windows auto-update artifacts before publishing a release.
 * Expects release/latest.yml and matching installer + blockmap.
 *
 * Run: node scripts/verify-win-update-artifacts.mjs
 */
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const yaml = require('js-yaml');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const releaseDir = join(root, 'release');
const latestPath = join(releaseDir, 'latest.yml');
const exeName = `SiteWeave-Setup-${version}.exe`;
const exePath = join(releaseDir, exeName);
const blockmapPath = `${exePath}.blockmap`;

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!existsSync(latestPath)) fail(`Missing ${latestPath}`);
if (!existsSync(exePath)) fail(`Missing installer ${exePath}`);
if (!existsSync(blockmapPath)) fail(`Missing blockmap ${blockmapPath}`);

const doc = yaml.load(readFileSync(latestPath, 'utf8'));
if (!doc || typeof doc !== 'object') fail('latest.yml did not parse');

if (String(doc.version) !== String(version)) {
  fail(`latest.yml version ${doc.version} does not match package.json ${version}`);
}

if (String(doc.path) !== exeName) {
  fail(`latest.yml path ${doc.path} does not match expected ${exeName}`);
}

const files = Array.isArray(doc.files) ? doc.files : [];
const primary = files[0];
if (!primary || primary.url !== exeName) {
  fail(`latest.yml files[0].url must be ${exeName}`);
}
if (typeof primary.sha512 !== 'string' || primary.sha512.length < 40) {
  fail('latest.yml files[0].sha512 missing or too short');
}
if (typeof doc.sha512 !== 'string' || doc.sha512.length < 40) {
  fail('latest.yml top-level sha512 missing or too short');
}
if (doc.sha512 !== primary.sha512) {
  fail('latest.yml top-level sha512 does not match files[0].sha512');
}

const size = statSync(exePath).size;
if (typeof primary.size === 'number' && primary.size !== size) {
  fail(`latest.yml size ${primary.size} does not match installer bytes ${size}`);
}

// Packaged updater deps: electron-updater must resolve with its production graph in node_modules
const updaterPkg = join(root, 'node_modules', 'electron-updater', 'package.json');
if (!existsSync(updaterPkg)) fail('node_modules/electron-updater is missing');
const updaterDeps = JSON.parse(readFileSync(updaterPkg, 'utf8')).dependencies || {};
for (const dep of Object.keys(updaterDeps)) {
  const resolved = join(root, 'node_modules', dep);
  const nested = join(root, 'node_modules', 'electron-updater', 'node_modules', dep);
  if (!existsSync(resolved) && !existsSync(nested)) {
    fail(`electron-updater dependency missing from node_modules: ${dep}`);
  }
}

try {
  require('electron-updater');
} catch (err) {
  fail(`require('electron-updater') failed: ${err.message || err}`);
}

console.log('OK: Windows update artifacts and electron-updater graph validated');
console.log(`  version: ${version}`);
console.log(`  installer: ${exeName} (${size} bytes)`);
console.log(`  latest.yml sha512: ${String(doc.sha512).slice(0, 16)}…`);
