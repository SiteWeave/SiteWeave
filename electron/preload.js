const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loading...');

function invokeOrReject(channel, ...args) {
  try {
    return ipcRenderer.invoke(channel, ...args);
  } catch (error) {
    console.error(`Error invoking ${channel}:`, error);
    return Promise.reject(error);
  }
}

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    onOAuthCallback: (callback) => {
      try {
        ipcRenderer.on('oauth-callback', (event, data) => callback(data));
      } catch (error) {
        console.error('Error setting up OAuth callback:', error);
      }
    },

    onUpdateAvailable: (callback) => {
      try {
        ipcRenderer.on('update-available', (event, payload) => callback(payload));
      } catch (error) {
        console.error('Error setting up update available callback:', error);
      }
    },

    onUpdateDownloaded: (callback) => {
      try {
        ipcRenderer.on('update-downloaded', (event, payload) => callback(payload));
      } catch (error) {
        console.error('Error setting up update downloaded callback:', error);
      }
    },

    onUpdateError: (callback) => {
      try {
        ipcRenderer.on('update-error', (event, error) => callback(error));
      } catch (error) {
        console.error('Error setting up update error callback:', error);
      }
    },

    onUpdateDownloadProgress: (callback) => {
      try {
        ipcRenderer.on('update-download-progress', (event, progress) => callback(progress));
      } catch (error) {
        console.error('Error setting up update download progress callback:', error);
      }
    },

    onUpdateNotAvailable: (callback) => {
      try {
        ipcRenderer.on('update-not-available', (event, payload) => callback(payload));
      } catch (error) {
        console.error('Error setting up update not available callback:', error);
      }
    },

    onUpdateOffline: (callback) => {
      try {
        ipcRenderer.on('update-offline', (event, payload) => callback(payload));
      } catch (error) {
        console.error('Error setting up update offline callback:', error);
      }
    },

    onUpdateCheckResult: (callback) => {
      try {
        ipcRenderer.on('update-check-result', (event, payload) => callback(payload));
      } catch (error) {
        console.error('Error setting up update check result callback:', error);
      }
    },

    onUpdateInstallFailed: (callback) => {
      try {
        ipcRenderer.on('update-install-failed', (event, payload) => callback(payload));
      } catch (error) {
        console.error('Error setting up update install failed callback:', error);
      }
    },

    onMenuAction: (callback) => {
      try {
        ipcRenderer.on('menu-new-project', callback);
        ipcRenderer.on('menu-about', callback);
      } catch (error) {
        console.error('Error setting up menu action callback:', error);
      }
    },

    onReplayTour: (callback) => {
      try {
        ipcRenderer.on('menu-replay-tour', callback);
      } catch (error) {
        console.error('Error setting up replay tour callback:', error);
      }
    },

    getAppVersion: () => invokeOrReject('get-app-version'),

    installUpdate: () => invokeOrReject('install-update'),

    checkForUpdates: () => invokeOrReject('check-for-updates'),

    downloadUpdate: () => invokeOrReject('download-update'),

    openUpdateInstaller: (version) => invokeOrReject('open-update-installer', version),

    getPendingUpdateStatus: () => invokeOrReject('get-pending-update-status'),

    clearPendingUpdate: () => invokeOrReject('clear-pending-update'),

    notifyUpdateListenersReady: () => {
      try {
        ipcRenderer.send('update-listeners-ready');
      } catch (error) {
        console.error('Error notifying update listeners ready:', error);
      }
    },

    startOAuthServer: () => invokeOrReject('start-oauth-server'),

    stopOAuthServer: () => invokeOrReject('stop-oauth-server'),

    openExternal: (url) => invokeOrReject('open-external', url),

    saveHtmlAsPdf: (payload) => invokeOrReject('save-html-as-pdf', payload),

    sendOAuthCallback: (data) => invokeOrReject('send-oauth-callback', data),

    exchangeOAuthToken: (params) => invokeOrReject('exchange-oauth-token', params),

    platform: process.platform,

    isElectron: true,
  });

  console.log('Preload script loaded successfully');
} catch (error) {
  console.error('Error in preload script:', error);

  contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    platform: process.platform,
    onOAuthCallback: () => {},
    onUpdateAvailable: () => {},
    onUpdateDownloaded: () => {},
    onUpdateError: () => {},
    onUpdateDownloadProgress: () => {},
    onUpdateNotAvailable: () => {},
    onUpdateOffline: () => {},
    onUpdateCheckResult: () => {},
    onUpdateInstallFailed: () => {},
    onMenuAction: () => {},
    getAppVersion: () => Promise.reject(new Error('Preload fallback: getAppVersion unavailable')),
    installUpdate: () => Promise.reject(new Error('Preload fallback: installUpdate unavailable')),
    checkForUpdates: () =>
      Promise.reject(new Error('Preload fallback: checkForUpdates unavailable')),
    downloadUpdate: () => Promise.reject(new Error('Preload fallback: downloadUpdate unavailable')),
    openUpdateInstaller: () => Promise.resolve(false),
    getPendingUpdateStatus: () => Promise.resolve(null),
    clearPendingUpdate: () => Promise.resolve({ success: false }),
    notifyUpdateListenersReady: () => {},
    startOAuthServer: () => Promise.resolve(),
    stopOAuthServer: () => Promise.resolve(),
    openExternal: (url) => ipcRenderer.invoke('open-external', url).catch(() => false),
    saveHtmlAsPdf: () => Promise.resolve({ unsupported: true }),
    sendOAuthCallback: () => Promise.resolve(),
    exchangeOAuthToken: () =>
      Promise.reject(new Error('exchangeOAuthToken not available in fallback')),
  });
}
