/**
 * Node tests for electron/updateAvailability.js
 * Run: node scripts/test-update-availability.mjs
 */
import { createRequire } from 'module';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const require = createRequire(import.meta.url);
const {
  UPDATE_STATES,
  mapUpdateCheckResult,
  mapUpdateCheckError,
  isOfflineError,
  buildInstallerUrl,
  writeExpectedUpdateVersion,
  clearExpectedUpdateVersion,
  verifyInstalledUpdate,
} = require('../electron/updateAvailability.js');

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

// Newer remote version
{
  const payload = mapUpdateCheckResult(
    { isUpdateAvailable: true, updateInfo: { version: '1.0.96', path: 'SiteWeave-Setup-1.0.96.exe' } },
    '1.0.95',
    { isPackaged: true, isDevServer: false }
  );
  assert(payload.state === UPDATE_STATES.UPDATE_AVAILABLE, 'newer remote → update-available');
  assert(payload.updateAvailable === true, 'newer remote sets updateAvailable');
  assert(payload.latestVersion === '1.0.96', 'newer remote latestVersion');
}

// Equal versions
{
  const payload = mapUpdateCheckResult(
    { isUpdateAvailable: false, updateInfo: { version: '1.0.95' } },
    '1.0.95',
    { isPackaged: true, isDevServer: false }
  );
  assert(payload.state === UPDATE_STATES.UP_TO_DATE, 'equal → up-to-date');
  assert(payload.updateAvailable === false, 'equal does not set updateAvailable');
}

// Installed newer than remote (local bump ahead of release)
{
  const payload = mapUpdateCheckResult(
    { isUpdateAvailable: false, updateInfo: { version: '1.0.95' } },
    '1.0.96',
    { isPackaged: true, isDevServer: false }
  );
  assert(payload.state === UPDATE_STATES.UP_TO_DATE, 'installed-newer → up-to-date (not update-available)');
  assert(payload.updateAvailable === false, 'installed-newer never claims update');
}

// Null result in packaged app is a bug, not "latest"
{
  const payload = mapUpdateCheckResult(null, '1.0.95', { isPackaged: true, isDevServer: false });
  assert(payload.state === UPDATE_STATES.UPDATER_UNAVAILABLE, 'null packaged → updater-unavailable');
  assert(payload.success === false, 'null packaged is not success');
}

// Dev unpackaged
{
  const payload = mapUpdateCheckResult(null, '1.0.95', { isPackaged: false, isDevServer: true });
  assert(payload.state === UPDATE_STATES.DEVELOPMENT_DISABLED, 'dev → development-disabled');
}

// Load error
{
  const payload = mapUpdateCheckResult(null, '1.0.95', {
    isPackaged: true,
    isDevServer: false,
    updaterLoadError: new Error('Cannot find module electron-updater'),
  });
  assert(payload.state === UPDATE_STATES.UPDATER_UNAVAILABLE, 'load error → updater-unavailable');
  assert(Boolean(payload.installerUrl), 'load error includes installerUrl');
}

// Offline classification
{
  assert(isOfflineError(new Error('getaddrinfo ENOTFOUND github.com')), 'ENOTFOUND is offline');
  const payload = mapUpdateCheckError(new Error('net::ERR_INTERNET_DISCONNECTED'), '1.0.95');
  assert(payload.state === UPDATE_STATES.OFFLINE, 'offline error maps to offline state');
  assert(payload.success === false, 'offline is not success/latest');
}

// Malformed / missing version metadata after a "successful" empty result object
{
  const payload = mapUpdateCheckResult({ isUpdateAvailable: false }, '1.0.95', {
    isPackaged: true,
    isDevServer: false,
  });
  assert(payload.state === UPDATE_STATES.ERROR, 'missing metadata → error');
}

// Installer URL
{
  assert(
    buildInstallerUrl('1.0.95') ===
      'https://github.com/SiteWeave/SiteWeave/releases/download/v1.0.95/SiteWeave-Setup-1.0.95.exe',
    'installer URL format'
  );
}

// Expected version after restart
{
  const dir = mkdtempSync(join(tmpdir(), 'siteweave-update-'));
  try {
    writeExpectedUpdateVersion(dir, '1.0.96');
    const mismatch = verifyInstalledUpdate(dir, '1.0.95');
    assert(mismatch?.state === UPDATE_STATES.INSTALL_FAILED, 'mismatch → install-failed');
    assert(mismatch?.matched === false, 'mismatch matched=false');

    const match = verifyInstalledUpdate(dir, '1.0.96');
    // marker still present from previous write; rewrite then verify match clears
    writeExpectedUpdateVersion(dir, '1.0.96');
    const ok = verifyInstalledUpdate(dir, '1.0.96');
    assert(ok?.matched === true, 'matching install clears as success');
    assert(!existsSync(join(dir, 'pending-update-version.json')), 'marker cleared after match');

    clearExpectedUpdateVersion(dir);
    assert(verifyInstalledUpdate(dir, '1.0.96') === null, 'no marker → null');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nAll updateAvailability tests passed');
