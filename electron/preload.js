const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loading...');

try {
  // Expose protected methods that allow the renderer process to use
  // the ipcRenderer without exposing the entire object
  contextBridge.exposeInMainWorld('electronAPI', {
    // OAuth callbacks
    onOAuthCallback: (callback) => {
      try {
        ipcRenderer.on('oauth-callback', (event, data) => callback(data));
      } catch (error) {
        console.error('Error setting up OAuth callback:', error);
      }
    },

    // Update notifications
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
        ipcRenderer.on('update-not-available', callback);
      } catch (error) {
        console.error('Error setting up update not available callback:', error);
      }
    },

    // Menu actions
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

    // App info
    getAppVersion: () => {
      try {
        return ipcRenderer.invoke('get-app-version');
      } catch (error) {
        console.error('Error getting app version:', error);
        return '1.0.0';
      }
    },

    // Update actions
    installUpdate: () => {
      try {
        return ipcRenderer.invoke('install-update');
      } catch (error) {
        console.error('Error installing update:', error);
        return Promise.resolve();
      }
    },
    
    checkForUpdates: () => {
      try {
        return ipcRenderer.invoke('check-for-updates');
      } catch (error) {
        console.error('Error checking for updates:', error);
        return Promise.resolve();
      }
    },

    /** Tell main process that update listeners are ready so it can run the first check (avoids missing update-available) */
    notifyUpdateListenersReady: () => {
      try {
        ipcRenderer.send('update-listeners-ready');
      } catch (error) {
        console.error('Error notifying update listeners ready:', error);
      }
    },

    // OAuth server control
    startOAuthServer: () => {
      try {
        return ipcRenderer.invoke('start-oauth-server');
      } catch (error) {
        console.error('Error starting OAuth server:', error);
        return Promise.resolve();
      }
    },
    
    stopOAuthServer: () => {
      try {
        return ipcRenderer.invoke('stop-oauth-server');
      } catch (error) {
        console.error('Error stopping OAuth server:', error);
        return Promise.resolve();
      }
    },

    // External links — validated https-only in the main process.
    openExternal: (url) => {
      try {
        return ipcRenderer.invoke('open-external', url);
      } catch (error) {
        console.error('Error opening external link:', error);
        return Promise.resolve(false);
      }
    },

    /** Save full HTML document as a real PDF via Chromium print (avoids window.open / about: issues). */
    saveHtmlAsPdf: (payload) => {
      try {
        return ipcRenderer.invoke('save-html-as-pdf', payload);
      } catch (error) {
        console.error('Error saving HTML as PDF:', error);
        return Promise.resolve({ success: false, error: String(error) });
      }
    },

    // OAuth callback sender
    sendOAuthCallback: (data) => {
      try {
        return ipcRenderer.invoke('send-oauth-callback', data);
      } catch (error) {
        console.error('Error sending OAuth callback:', error);
        return Promise.resolve();
      }
    },

    // Exchange OAuth token from main process (avoids CORS/origin issues)
    exchangeOAuthToken: (params) => {
      try {
        return ipcRenderer.invoke('exchange-oauth-token', params);
      } catch (error) {
        console.error('Error exchanging OAuth token:', error);
        return Promise.reject(error);
      }
    },

    // Platform detection
    platform: process.platform,

    // Environment
    isElectron: true
  });

  console.log('Preload script loaded successfully');
} catch (error) {
  console.error('Error in preload script:', error);
  
  // Fallback: create a minimal electronAPI
  contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    platform: process.platform,
    onOAuthCallback: () => {},
    onUpdateAvailable: () => {},
    onUpdateDownloaded: () => {},
    onUpdateError: () => {},
    onUpdateDownloadProgress: () => {},
    onMenuAction: () => {},
    getAppVersion: () => '1.0.0',
    installUpdate: () => Promise.resolve(),
    checkForUpdates: () => Promise.resolve(),
    startOAuthServer: () => Promise.resolve(),
    stopOAuthServer: () => Promise.resolve(),
    openExternal: (url) => ipcRenderer.invoke('open-external', url).catch(() => false),
    saveHtmlAsPdf: () => Promise.resolve({ unsupported: true }),
    sendOAuthCallback: () => Promise.resolve(),
    exchangeOAuthToken: () => Promise.reject(new Error('exchangeOAuthToken not available in fallback'))
  });
}
