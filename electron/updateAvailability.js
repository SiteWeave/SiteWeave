/**
 * Pure helpers for Electron auto-update check / install state.
 * Kept dependency-free so Node unit tests can load it without Electron.
 */

const GITHUB_OWNER = 'SiteWeave';
const GITHUB_REPO = 'SiteWeave';

const UPDATE_STATES = Object.freeze({
  UPDATE_AVAILABLE: 'update-available',
  UP_TO_DATE: 'up-to-date',
  OFFLINE: 'offline',
  ERROR: 'error',
  UPDATER_UNAVAILABLE: 'updater-unavailable',
  DEVELOPMENT_DISABLED: 'development-disabled',
  INSTALL_FAILED: 'install-failed',
});

function isOfflineError(err) {
  const msg = String((err && (err.message || err)) || '');
  return /ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETDOWN|network|offline|getaddrinfo|ERR_INTERNET_DISCONNECTED|net::ERR_/i.test(
    msg
  );
}

function isRetryableUpdateError(err) {
  const msg = String((err && (err.message || err)) || '');
  return /504|502|503|ETIMEDOUT|ECONNRESET|network|temporary|timeout/i.test(msg);
}

function isBenignConcurrentUpdateError(err) {
  const msg = String((err && (err.message || err)) || '');
  return /already downloading|cancelled|canceled|same version/i.test(msg);
}

/**
 * Map electron-updater checkForUpdates() result into a serializable IPC payload.
 * Never invents "up-to-date" from a null/missing result.
 */
function mapUpdateCheckResult(result, currentVersion, options = {}) {
  const {
    updaterLoadError = null,
    isPackaged = true,
    isDevServer = false,
  } = options;

  const installed = String(currentVersion || '');

  if (isDevServer || !isPackaged) {
    return {
      success: true,
      state: UPDATE_STATES.DEVELOPMENT_DISABLED,
      updateAvailable: false,
      currentVersion: installed,
      latestVersion: null,
      updateInfo: null,
      error: null,
      installerUrl: null,
    };
  }

  if (updaterLoadError) {
    return {
      success: false,
      state: UPDATE_STATES.UPDATER_UNAVAILABLE,
      updateAvailable: false,
      currentVersion: installed,
      latestVersion: null,
      updateInfo: null,
      error: String(updaterLoadError.message || updaterLoadError),
      installerUrl: buildLatestInstallerUrl(installed),
    };
  }

  if (result == null) {
    return {
      success: false,
      state: UPDATE_STATES.UPDATER_UNAVAILABLE,
      updateAvailable: false,
      currentVersion: installed,
      latestVersion: null,
      updateInfo: null,
      error: 'Updater returned no result in a packaged app (unexpected).',
      installerUrl: buildLatestInstallerUrl(installed),
    };
  }

  const info = result.updateInfo || result.versionInfo || null;
  const latestVersion = info?.version ? String(info.version) : null;
  const isUpdateAvailable = result.isUpdateAvailable === true;

  if (isUpdateAvailable && latestVersion) {
    return {
      success: true,
      state: UPDATE_STATES.UPDATE_AVAILABLE,
      updateAvailable: true,
      currentVersion: installed,
      latestVersion,
      updateInfo: {
        version: latestVersion,
        releaseDate: info.releaseDate || null,
        path: info.path || null,
      },
      error: null,
      installerUrl: buildInstallerUrl(latestVersion),
    };
  }

  if (latestVersion) {
    return {
      success: true,
      state: UPDATE_STATES.UP_TO_DATE,
      updateAvailable: false,
      currentVersion: installed,
      latestVersion,
      updateInfo: null,
      error: null,
      installerUrl: null,
    };
  }

  return {
    success: false,
    state: UPDATE_STATES.ERROR,
    updateAvailable: false,
    currentVersion: installed,
    latestVersion: null,
    updateInfo: null,
    error: 'Update check completed without version metadata.',
    installerUrl: buildLatestInstallerUrl(installed),
  };
}

function mapUpdateCheckError(err, currentVersion) {
  const installed = String(currentVersion || '');
  const message = String((err && (err.message || err)) || 'Update check failed');

  if (isOfflineError(err)) {
    return {
      success: false,
      state: UPDATE_STATES.OFFLINE,
      updateAvailable: false,
      currentVersion: installed,
      latestVersion: null,
      updateInfo: null,
      error: message,
      installerUrl: null,
    };
  }

  return {
    success: false,
    state: UPDATE_STATES.ERROR,
    updateAvailable: false,
    currentVersion: installed,
    latestVersion: null,
    updateInfo: null,
    error: message,
    installerUrl: buildLatestInstallerUrl(installed),
  };
}

function buildInstallerUrl(version) {
  if (!version) return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
  const v = String(version).replace(/^v/, '');
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${v}/SiteWeave-Setup-${v}.exe`;
}

function buildLatestInstallerUrl(fallbackVersion) {
  if (fallbackVersion) return buildInstallerUrl(fallbackVersion);
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
}

function getExpectedUpdateMarkerPath(userDataPath) {
  return require('path').join(userDataPath, 'pending-update-version.json');
}

function readExpectedUpdateVersion(userDataPath) {
  const markerPath = getExpectedUpdateMarkerPath(userDataPath);
  try {
    const raw = require('fs').readFileSync(markerPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.version ? String(parsed.version) : null;
  } catch {
    return null;
  }
}

function writeExpectedUpdateVersion(userDataPath, version) {
  const markerPath = getExpectedUpdateMarkerPath(userDataPath);
  require('fs').writeFileSync(
    markerPath,
    JSON.stringify({ version: String(version), writtenAt: new Date().toISOString() }),
    'utf8'
  );
}

function clearExpectedUpdateVersion(userDataPath) {
  const markerPath = getExpectedUpdateMarkerPath(userDataPath);
  try {
    require('fs').unlinkSync(markerPath);
  } catch {
    /* ignore */
  }
}

/**
 * After restart, compare installed version to the pending marker.
 * Returns null when there is nothing to verify.
 */
function verifyInstalledUpdate(userDataPath, installedVersion) {
  const expected = readExpectedUpdateVersion(userDataPath);
  if (!expected) return null;

  const installed = String(installedVersion || '');
  if (installed === expected) {
    clearExpectedUpdateVersion(userDataPath);
    return {
      success: true,
      state: UPDATE_STATES.UP_TO_DATE,
      expectedVersion: expected,
      currentVersion: installed,
      matched: true,
    };
  }

  return {
    success: false,
    state: UPDATE_STATES.INSTALL_FAILED,
    expectedVersion: expected,
    currentVersion: installed,
    matched: false,
    installerUrl: buildInstallerUrl(expected),
    error: `Expected update to v${expected} but still running v${installed || 'unknown'}.`,
  };
}

module.exports = {
  UPDATE_STATES,
  GITHUB_OWNER,
  GITHUB_REPO,
  isOfflineError,
  isRetryableUpdateError,
  isBenignConcurrentUpdateError,
  mapUpdateCheckResult,
  mapUpdateCheckError,
  buildInstallerUrl,
  buildLatestInstallerUrl,
  getExpectedUpdateMarkerPath,
  readExpectedUpdateVersion,
  writeExpectedUpdateVersion,
  clearExpectedUpdateVersion,
  verifyInstalledUpdate,
};
