const { app, BrowserWindow, Menu, shell, protocol, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { createServer } = require('http');
const { parse } = require('url');

// Cap Chromium HTTP disk cache; oversized/corrupt indexes log
// "Invalid cache (current) size" from backend_impl.cc.
app.commandLine.appendSwitch('disk-cache-size', String(100 * 1024 * 1024));

async function recoverHttpDiskCache() {
  const userData = app.getPath('userData');
  const recoveryFlag = path.join(userData, '.http-cache-recovered-v1');

  // One-time wipe of corrupt blockfile cache dirs (Chromium recreates them).
  if (fs.existsSync(recoveryFlag)) return;

  try {
    for (const name of ['Cache', 'Code Cache']) {
      const cachePath = path.join(userData, name);
      if (fs.existsSync(cachePath)) {
        fs.rmSync(cachePath, { recursive: true, force: true });
      }
    }
    try {
      await session.defaultSession.clearCache();
    } catch {
      /* ignore */
    }
    fs.writeFileSync(recoveryFlag, new Date().toISOString(), 'utf8');
    console.log('Recovered HTTP disk cache directories');
  } catch (err) {
    console.warn('Disk cache folder cleanup skipped:', err?.message || err);
  }
}

const updateAvailability = require('./updateAvailability.js');
const {
  UPDATE_STATES,
  isOfflineError,
  isRetryableUpdateError,
  isBenignConcurrentUpdateError,
  mapUpdateCheckResult,
  mapUpdateCheckError,
  buildInstallerUrl,
  writeExpectedUpdateVersion,
  clearExpectedUpdateVersion,
  verifyInstalledUpdate,
} = updateAvailability;

// Load electron-updater without a silent null-returning mock.
let autoUpdater = null;
let updaterLoadError = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (error) {
  updaterLoadError = error;
  console.error('electron-updater failed to load:', error?.message || error);
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Use vite-plugin-electron environment variables
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const DIST_PATH = process.env.DIST;

let mainWindow;
let oauthServer = null;
const OAUTH_PORT = 5000;

const OAUTH_TOKEN_URLS = Object.freeze({
  google: 'https://oauth2.googleapis.com/token',
  microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
});

/** Only https: may leave the app via shell.openExternal. */
function isSafeExternalUrl(urlString) {
  try {
    const parsed = new URL(String(urlString || ''));
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function openSafeExternalUrl(urlString) {
  if (!isSafeExternalUrl(urlString)) {
    console.warn('Blocked unsafe external URL:', urlString);
    return false;
  }
  shell.openExternal(String(urlString));
  return true;
}

function getAllowedAppOrigins() {
  if (VITE_DEV_SERVER_URL) {
    try {
      return [new URL(VITE_DEV_SERVER_URL).origin];
    } catch {
      return ['http://localhost:5173'];
    }
  }
  return ['file://'];
}

function isAllowedInternalNavigation(urlString) {
  try {
    const parsed = new URL(String(urlString || ''));
    const allowed = getAllowedAppOrigins();
    if (parsed.protocol === 'file:') {
      return allowed.includes('file://');
    }
    return allowed.includes(parsed.origin);
  } catch {
    return false;
  }
}

/** Reject IPC from unexpected frames (not our renderer). */
function isTrustedIpcSender(event) {
  try {
    const frameUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || '';
    return isAllowedInternalNavigation(frameUrl);
  } catch {
    return false;
  }
}

// Configure auto-updater only when the real module loaded in a non-dev launch.
if (!VITE_DEV_SERVER_URL && autoUpdater && typeof autoUpdater.autoDownload !== 'undefined') {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;
}

let updateCheckInFlight = false;
let lastKnownUpdateInfo = null;

function sendUpdaterEvent(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function getUpdaterContext() {
  return {
    updaterLoadError,
    isPackaged: app.isPackaged === true,
    isDevServer: Boolean(VITE_DEV_SERVER_URL),
  };
}

async function performUpdateCheck({ notifyRenderer = true, forceUserInitiated = false } = {}) {
  const currentVersion = app.getVersion();
  const ctx = getUpdaterContext();

  if (ctx.isDevServer || !ctx.isPackaged) {
    const payload = mapUpdateCheckResult(null, currentVersion, ctx);
    if (notifyRenderer && forceUserInitiated) {
      sendUpdaterEvent('update-check-result', payload);
    }
    return payload;
  }

  if (updaterLoadError || !autoUpdater || typeof autoUpdater.checkForUpdates !== 'function') {
    const payload = mapUpdateCheckResult(null, currentVersion, {
      ...ctx,
      updaterLoadError: updaterLoadError || new Error('electron-updater is not available'),
    });
    if (notifyRenderer) {
      sendUpdaterEvent('update-check-result', payload);
      sendUpdaterEvent('update-error', {
        state: payload.state,
        message: payload.error,
        installerUrl: payload.installerUrl,
      });
    }
    return payload;
  }

  if (updateCheckInFlight) {
    // Let electron-updater share its in-flight promise; do not invent a second check.
  }

  const runOnce = async () => autoUpdater.checkForUpdates();

  try {
    updateCheckInFlight = true;
    const result = await runOnce();
    const payload = mapUpdateCheckResult(result, currentVersion, ctx);
    if (payload.updateAvailable && payload.updateInfo) {
      lastKnownUpdateInfo = payload.updateInfo;
    }
    if (notifyRenderer && forceUserInitiated && payload.state === UPDATE_STATES.UP_TO_DATE) {
      sendUpdaterEvent('update-check-result', payload);
    }
    if (notifyRenderer && forceUserInitiated && payload.state === UPDATE_STATES.UPDATE_AVAILABLE) {
      sendUpdaterEvent('update-check-result', payload);
    }
    return payload;
  } catch (error) {
    if (isBenignConcurrentUpdateError(error)) {
      console.log('Update check:', error?.message || error);
      return {
        success: true,
        state: lastKnownUpdateInfo ? UPDATE_STATES.UPDATE_AVAILABLE : UPDATE_STATES.UP_TO_DATE,
        updateAvailable: Boolean(lastKnownUpdateInfo),
        currentVersion,
        latestVersion: lastKnownUpdateInfo?.version || null,
        updateInfo: lastKnownUpdateInfo,
        error: null,
        installerUrl: lastKnownUpdateInfo?.version
          ? buildInstallerUrl(lastKnownUpdateInfo.version)
          : null,
      };
    }

    if (isRetryableUpdateError(error) && !isOfflineError(error)) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const retryResult = await runOnce();
        const payload = mapUpdateCheckResult(retryResult, currentVersion, ctx);
        if (payload.updateAvailable && payload.updateInfo) {
          lastKnownUpdateInfo = payload.updateInfo;
        }
        if (notifyRenderer && forceUserInitiated) {
          sendUpdaterEvent('update-check-result', payload);
        }
        return payload;
      } catch (retryErr) {
        const payload = mapUpdateCheckError(retryErr, currentVersion);
        payload.error = `${payload.error} (retry failed)`;
        if (notifyRenderer) {
          sendUpdaterEvent('update-check-result', payload);
          if (payload.state === UPDATE_STATES.OFFLINE) {
            sendUpdaterEvent('update-offline', payload);
          } else {
            sendUpdaterEvent('update-error', {
              state: payload.state,
              message: payload.error,
              installerUrl: payload.installerUrl,
            });
          }
        }
        return payload;
      }
    }

    const payload = mapUpdateCheckError(error, currentVersion);
    console.error('Auto-updater check error:', payload.error);
    if (notifyRenderer) {
      sendUpdaterEvent('update-check-result', payload);
      if (payload.state === UPDATE_STATES.OFFLINE) {
        // Auto-check offline stays quiet unless user-initiated.
        if (forceUserInitiated) sendUpdaterEvent('update-offline', payload);
      } else {
        sendUpdaterEvent('update-error', {
          state: payload.state,
          message: payload.error,
          installerUrl: payload.installerUrl,
        });
      }
    }
    return payload;
  } finally {
    updateCheckInFlight = false;
  }
}

function runStartupUpdateCheck() {
  performUpdateCheck({ notifyRenderer: true, forceUserInitiated: false }).catch((err) => {
    console.error('Startup update check failed:', err?.message || err);
  });
}

// Run one check after the renderer attaches update listeners (avoids missing events).
ipcMain.on('update-listeners-ready', (event) => {
  if (!isTrustedIpcSender(event)) {
    console.warn('Ignored update-listeners-ready from untrusted sender');
    return;
  }
  const installStatus = verifyInstalledUpdate(app.getPath('userData'), app.getVersion());
  if (installStatus && !installStatus.matched) {
    sendUpdaterEvent('update-install-failed', installStatus);
  }
  setTimeout(runStartupUpdateCheck, 1500);
});

// OAuth Server for loopback method
function startOAuthServer() {
  if (oauthServer) {
    return; // Server already running
  }

  oauthServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // Handle OAuth data POST requests
    if (pathname === '/oauth-data' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          console.log('Received OAuth data from callback page:', data);
          
          // Send the data to the main window
          if (mainWindow) {
            mainWindow.webContents.send('oauth-callback', data);
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          console.error('Error parsing OAuth data:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // Handle OAuth callbacks
    if (pathname.includes('-callback')) {
      // e.g. /google-callback -> google
      const provider = pathname.replace(/^\//, '').replace(/-callback$/, '');
      
      // Send CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Send success response to browser
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>OAuth Success</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .success { color: #4CAF50; }
            .error { color: #f44336; }
          </style>
        </head>
        <body>
          <h2 class="success">&#10003; Authentication Successful!</h2>
          <p>You can close this window and return to SiteWeave.</p>
          <script>
            // Extract hash parameters and send to main window
            if (window.location.hash) {
              const hash = window.location.hash.substring(1);
              console.log('OAuth hash received:', hash);
              
              // Send the hash data back to the server to forward to main window
              fetch('/oauth-data', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  provider: 'supabase',
                  hash: hash,
                  url: window.location.href
                })
              }).then(() => {
                console.log('OAuth data sent to server');
              }).catch((error) => {
                console.error('Failed to send OAuth data:', error);
              });
            } else {
              console.log('No hash found in URL:', window.location.href);
            }
            
            setTimeout(() => {
              window.close();
            }, 2000);
          </script>
        </body>
        </html>
      `);

      // Send callback data to main window
      if (mainWindow) {
        // For Supabase callbacks, we need to extract the hash from the URL
        // The hash is not available in query parameters, so we'll send the full URL
        // and let the client-side JavaScript extract the hash
        mainWindow.webContents.send('oauth-callback', {
          provider: provider,
          code: query.code,
          state: query.state,
          error: query.error,
          errorDescription: query.error_description,
          url: req.url,
          fullUrl: `http://127.0.0.1:${OAUTH_PORT}${req.url}`,
          hash: null // Will be extracted client-side
        });
      }
    } else {
      // Handle other requests
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  oauthServer.listen(OAUTH_PORT, '127.0.0.1', () => {
    console.log(`OAuth server listening on http://127.0.0.1:${OAUTH_PORT}`);
  });

  oauthServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${OAUTH_PORT} is already in use`);
    } else {
      console.error('OAuth server error:', err);
    }
  });
}

function stopOAuthServer() {
  if (oauthServer) {
    oauthServer.close();
    oauthServer = null;
    console.log('OAuth server stopped');
  }
}

// Custom protocol for OAuth callbacks
const PROTOCOL_NAME = 'siteweave';

function createWindow() {
  console.log('Creating window...');
  
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      // Always keep Chromium same-origin protections enabled (Electron security checklist).
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: app.isPackaged 
      ? path.join(process.resourcesPath, 'app.asar', 'build', 'icon.png')
      : path.join(__dirname, '../build/icon.png'),
    title: 'SiteWeave',
    show: false, // Don't show until ready
    titleBarStyle: 'default'
  });

  console.log('Window created, loading app...');

  // Use vite-plugin-electron environment variables for loading
  if (VITE_DEV_SERVER_URL) {
    // Development: Load from the Vite dev server
    console.log('Loading from Vite dev server:', VITE_DEV_SERVER_URL);
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // Production: Load the built index.html file
    // In packaged apps, the dist folder is at the root of the asar file
    const indexPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html')
      : path.join(DIST_PATH || 'dist', 'index.html');
    console.log('Loading from production build:', indexPath);
    mainWindow.loadFile(indexPath);
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();
    mainWindow.focus();
  });

  // Add error handling for failed loads
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
    mainWindow.show();
    mainWindow.focus();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    console.log('Main window was closed');
    mainWindow = null;
  });


  // Handle external links — https only; never open arbitrary schemes.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openSafeExternalUrl(url);
    return { action: 'deny' };
  });

  // Prevent navigation away from the app origin; fail closed on parse errors.
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (isAllowedInternalNavigation(navigationUrl)) {
      return;
    }
    event.preventDefault();
    openSafeExternalUrl(navigationUrl);
  });
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-project');
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Getting Started / Replay Tour',
          click: () => {
            mainWindow.webContents.send('menu-replay-tour');
          }
        },
        { type: 'separator' },
        {
          label: 'About SiteWeave',
          click: () => {
            mainWindow.webContents.send('menu-about');
          }
        },
        {
          label: 'Check for Updates',
          click: () => {
            performUpdateCheck({ notifyRenderer: true, forceUserInitiated: true }).catch((err) => {
              console.error('Menu update check failed:', err?.message || err);
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Register custom protocol
function registerProtocol() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PROTOCOL_NAME,
      privileges: {
        standard: true,
        secure: true,
        allowServiceWorkers: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ]);
}

// Handle protocol URLs
function handleProtocolUrl(url) {
  if (!mainWindow) return;

  const urlObj = new URL(url);
  const pathname = urlObj.pathname;
  
  // Send OAuth callback to renderer
  mainWindow.webContents.send('oauth-callback', {
    provider: pathname.replace('/', ''),
    code: urlObj.searchParams.get('code'),
    state: urlObj.searchParams.get('state'),
    error: urlObj.searchParams.get('error'),
    errorDescription: urlObj.searchParams.get('error_description')
  });
}

// Register protocol BEFORE app is ready
registerProtocol();

// App event handlers
app.whenReady().then(async () => {
  console.log('App is ready');
  await recoverHttpDiskCache();
  
  // Prevent multiple windows
  if (BrowserWindow.getAllWindows().length === 0) {
    console.log('No windows exist, creating new window...');
    createWindow();
    createMenu();
    startOAuthServer(); // Start OAuth server
  } else {
    console.log('Windows already exist, skipping window creation');
  }

  // Handle protocol URLs
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });

  app.on('activate', () => {
    console.log('App activated');
    if (BrowserWindow.getAllWindows().length === 0) {
      console.log('No windows on activate, creating new window');
      createWindow();
    }
  });
});

// Prevent the app from quitting when all windows are closed
app.on('window-all-closed', () => {
  console.log('All windows closed event triggered');
  stopOAuthServer(); // Stop OAuth server
  // Quit the app when all windows are closed (except on macOS)
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopOAuthServer(); // Stop OAuth server before quitting
});

// Auto-updater events (only when real module loaded)
if (autoUpdater && typeof autoUpdater.on === 'function') {
  autoUpdater.on('update-available', (info) => {
    const currentVersion = app.getVersion();
    const nextVersion = info?.version;
    if (!nextVersion || nextVersion === currentVersion) {
      return;
    }
    lastKnownUpdateInfo = {
      version: nextVersion,
      releaseDate: info?.releaseDate || null,
      path: info?.path || null,
    };
    sendUpdaterEvent('update-available', {
      version: nextVersion,
      currentVersion,
      installerUrl: buildInstallerUrl(nextVersion),
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    const version = info?.version || lastKnownUpdateInfo?.version || '';
    if (version) {
      lastKnownUpdateInfo = {
        version,
        releaseDate: info?.releaseDate || lastKnownUpdateInfo?.releaseDate || null,
        path: info?.path || lastKnownUpdateInfo?.path || null,
      };
    }
    sendUpdaterEvent('update-downloaded', {
      version,
      installerUrl: version ? buildInstallerUrl(version) : null,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    sendUpdaterEvent('update-not-available', {
      currentVersion: app.getVersion(),
      latestVersion: info?.version || app.getVersion(),
    });
  });

  autoUpdater.on('error', (error) => {
    if (isBenignConcurrentUpdateError(error)) {
      console.log('Update check:', error?.message || error);
      return;
    }
    const payload = mapUpdateCheckError(error, app.getVersion());
    console.error('Auto-updater error:', payload.error);
    if (payload.state === UPDATE_STATES.OFFLINE) {
      sendUpdaterEvent('update-offline', payload);
      return;
    }
    sendUpdaterEvent('update-error', {
      state: payload.state,
      message: payload.error,
      installerUrl: payload.installerUrl,
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    sendUpdaterEvent('update-download-progress', {
      percent: progressObj.percent,
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total,
    });
  });
}

// IPC handlers
ipcMain.handle('save-html-as-pdf', async (event, { html, defaultFilename }) => {
  if (!isTrustedIpcSender(event)) {
    return { success: false, error: 'Untrusted IPC sender' };
  }
  if (!html || typeof html !== 'string') {
    return { success: false, error: 'Missing HTML content' };
  }

  let baseName = (defaultFilename && String(defaultFilename).replace(/[\\/]/g, '_')) || 'progress-report.pdf';
  if (!baseName.toLowerCase().endsWith('.pdf')) baseName += '.pdf';
  const defaultPath = path.join(app.getPath('downloads'), baseName);

  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow || undefined, {
    title: 'Save progress report as PDF',
    defaultPath,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  const tmpHtml = path.join(app.getPath('temp'), `siteweave-report-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html, 'utf8');

  const hidden = new BrowserWindow({
    show: false,
    width: 1024,
    height: 1400,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Timed out loading report for PDF')), 30000);
      hidden.webContents.once('did-finish-load', () => {
        clearTimeout(t);
        resolve();
      });
      hidden.webContents.once('did-fail-load', (_e, _code, desc) => {
        clearTimeout(t);
        reject(new Error(desc || 'Failed to load report'));
      });
      hidden.loadFile(tmpHtml).catch(reject);
    });

    // Wait for <img> loads (task photos) before printToPDF — did-finish-load alone is not enough.
    try {
      await hidden.webContents.executeJavaScript(`
        Promise.all(Array.from(document.images || []).map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
            setTimeout(done, 10000);
          });
        }))
      `);
    } catch (_) {
      /* proceed anyway */
    }
    await new Promise((r) => setTimeout(r, 200));

    const pdfBuffer = await hidden.webContents.printToPDF({
      printBackground: true,
      // Use CSS @page margins only; default+@page margins can confuse pagination.
      margins: { marginType: 'none' },
      preferCSSPageSize: true,
    });

    fs.writeFileSync(filePath, pdfBuffer);
    return { success: true, path: filePath };
  } catch (err) {
    console.error('save-html-as-pdf:', err);
    return { success: false, error: err.message || String(err) };
  } finally {
    hidden.destroy();
    try {
      fs.unlinkSync(tmpHtml);
    } catch (_) {
      /* ignore */
    }
  }
});

ipcMain.handle('get-app-version', (event) => {
  if (!isTrustedIpcSender(event)) {
    throw new Error('Untrusted IPC sender');
  }
  return app.getVersion();
});

ipcMain.handle('install-update', (event) => {
  if (!isTrustedIpcSender(event)) {
    throw new Error('Untrusted IPC sender');
  }
  if (!autoUpdater || typeof autoUpdater.quitAndInstall !== 'function') {
    return {
      success: false,
      error: updaterLoadError?.message || 'Updater is not available',
      installerUrl: buildInstallerUrl(lastKnownUpdateInfo?.version || app.getVersion()),
    };
  }
  const targetVersion = lastKnownUpdateInfo?.version;
  if (!targetVersion) {
    return {
      success: false,
      error: 'No downloaded update is ready to install.',
      installerUrl: buildInstallerUrl(app.getVersion()),
    };
  }
  try {
    writeExpectedUpdateVersion(app.getPath('userData'), targetVersion);
    // isSilent=false, isForceRunAfter=true so the app relaunches after install.
    autoUpdater.quitAndInstall(false, true);
    return { success: true, expectedVersion: targetVersion };
  } catch (error) {
    return {
      success: false,
      error: error?.message || String(error),
      installerUrl: buildInstallerUrl(targetVersion),
    };
  }
});

ipcMain.handle('check-for-updates', async (event) => {
  if (!isTrustedIpcSender(event)) {
    throw new Error('Untrusted IPC sender');
  }
  return performUpdateCheck({ notifyRenderer: false, forceUserInitiated: true });
});

ipcMain.handle('download-update', async (event) => {
  if (!isTrustedIpcSender(event)) {
    throw new Error('Untrusted IPC sender');
  }
  if (!autoUpdater || typeof autoUpdater.downloadUpdate !== 'function') {
    return {
      success: false,
      state: UPDATE_STATES.UPDATER_UNAVAILABLE,
      error: updaterLoadError?.message || 'Updater is not available',
      installerUrl: buildInstallerUrl(lastKnownUpdateInfo?.version || app.getVersion()),
    };
  }
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    const payload = mapUpdateCheckError(error, app.getVersion());
    return {
      success: false,
      state: payload.state,
      error: payload.error,
      installerUrl: lastKnownUpdateInfo?.version
        ? buildInstallerUrl(lastKnownUpdateInfo.version)
        : payload.installerUrl,
    };
  }
});

ipcMain.handle('open-update-installer', async (event, version) => {
  if (!isTrustedIpcSender(event)) {
    throw new Error('Untrusted IPC sender');
  }
  const url = buildInstallerUrl(version || lastKnownUpdateInfo?.version || '');
  return openSafeExternalUrl(url);
});

ipcMain.handle('get-pending-update-status', (event) => {
  if (!isTrustedIpcSender(event)) {
    throw new Error('Untrusted IPC sender');
  }
  return verifyInstalledUpdate(app.getPath('userData'), app.getVersion());
});

ipcMain.handle('clear-pending-update', (event) => {
  if (!isTrustedIpcSender(event)) {
    throw new Error('Untrusted IPC sender');
  }
  clearExpectedUpdateVersion(app.getPath('userData'));
  return { success: true };
});

ipcMain.handle('open-external', (event, url) => {
  if (!isTrustedIpcSender(event)) {
    throw new Error('Untrusted IPC sender');
  }
  return openSafeExternalUrl(url);
});

ipcMain.handle('start-oauth-server', (event) => {
  if (!isTrustedIpcSender(event)) {
    throw new Error('Untrusted IPC sender');
  }
  startOAuthServer();
  return true;
});

ipcMain.handle('stop-oauth-server', (event) => {
  if (!isTrustedIpcSender(event)) {
    throw new Error('Untrusted IPC sender');
  }
  stopOAuthServer();
  return true;
});

ipcMain.handle('send-oauth-callback', (event, data) => {
  if (!isTrustedIpcSender(event)) {
    throw new Error('Untrusted IPC sender');
  }
  console.log('Received OAuth callback from renderer:', data);
  if (mainWindow) {
    mainWindow.webContents.send('oauth-callback', data);
  }
  return true;
});

// Handle OAuth token exchange from main process (to avoid CORS/origin issues).
// Token endpoint hosts are fixed; do not accept renderer-supplied token URLs.
ipcMain.handle('exchange-oauth-token', async (event, { provider, code, clientId, redirectUri, codeVerifier, clientSecret }) => {
  if (!isTrustedIpcSender(event)) {
    throw new Error('Untrusted IPC sender');
  }

  const https = require('https');
  const { URL, URLSearchParams } = require('url');

  const tokenUrl = OAUTH_TOKEN_URLS[provider];
  if (!tokenUrl) {
    throw new Error(`Unknown OAuth provider: ${provider}`);
  }

  if (!code || !clientId || !redirectUri) {
    throw new Error('Missing OAuth token exchange parameters');
  }

  // Loopback redirect only (Electron desktop OAuth).
  let parsedRedirect;
  try {
    parsedRedirect = new URL(String(redirectUri));
  } catch {
    throw new Error('Invalid OAuth redirect URI');
  }
  if (
    parsedRedirect.protocol !== 'http:' ||
    (parsedRedirect.hostname !== '127.0.0.1' && parsedRedirect.hostname !== 'localhost') ||
    parsedRedirect.port !== String(OAUTH_PORT)
  ) {
    throw new Error('OAuth redirect URI must use the local loopback callback');
  }

  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_id: clientId,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    // Public desktop clients use PKCE. Confidential Web clients also need client_secret.
    if (codeVerifier) {
      body.set('code_verifier', codeVerifier);
    }
    if (clientSecret) {
      body.set('client_secret', clientSecret);
    }

    const url = new URL(tokenUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body.toString())
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (error) {
            reject(new Error(`Failed to parse token response: ${error.message}`));
          }
        } else {
          reject(new Error(`Token exchange failed (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Token exchange request failed: ${error.message}`));
    });

    req.write(body.toString());
    req.end();
  });
});

// Handle deep links on Windows
if (process.platform === 'win32') {
  app.setAsDefaultProtocolClient(PROTOCOL_NAME);
  
  // Handle protocol URL when app is already running
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (url) {
      handleProtocolUrl(url);
    }
    
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
