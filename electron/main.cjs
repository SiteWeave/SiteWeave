const { app, BrowserWindow, Menu, shell, protocol, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { createServer } = require('http');
const { parse } = require('url');

// Try to load electron-updater (may not be available in dev or if not installed)
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (error) {
  console.warn('electron-updater not available:', error.message);
  // Create a mock autoUpdater for dev mode
  autoUpdater = {
    checkForUpdatesAndNotify: () => {
      console.log('Update check skipped (dev mode or electron-updater not available)');
      return Promise.resolve(null);
    },
    checkForUpdates: () => {
      console.log('Update check skipped (dev mode or electron-updater not available)');
      return Promise.resolve(null);
    },
    quitAndInstall: () => {
      console.log('Update install skipped (dev mode)');
    },
    on: () => {},
    updateInfo: null
  };
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

// Configure auto-updater
// Only enable auto-download in production builds (not in dev mode)
if (!VITE_DEV_SERVER_URL && autoUpdater && typeof autoUpdater.autoDownload !== 'undefined') {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
}

let updateCheckInFlight = false;

function shouldIgnoreUpdateError(message) {
  const msg = String(message || '');
  return (
    msg.includes('latest.yml') ||
    msg.includes('404') ||
    msg.includes('No published versions') ||
    /already downloading|cancelled|canceled|ENOENT|same version|not available/i.test(msg)
  );
}

function runUpdateCheck() {
  if (VITE_DEV_SERVER_URL || !autoUpdater || typeof autoUpdater.checkForUpdatesAndNotify !== 'function') {
    return;
  }
  if (updateCheckInFlight) return;
  updateCheckInFlight = true;
  autoUpdater.checkForUpdatesAndNotify()
    .catch((error) => {
      const msg = error?.message || String(error);
      if (!shouldIgnoreUpdateError(msg)) {
        console.error('Auto-updater check error:', msg);
      }
    })
    .finally(() => {
      updateCheckInFlight = false;
    });
}

// Run one check after the renderer attaches update listeners (avoids missing events).
ipcMain.on('update-listeners-ready', (event) => {
  if (!isTrustedIpcSender(event)) {
    console.warn('Ignored update-listeners-ready from untrusted sender');
    return;
  }
  setTimeout(runUpdateCheck, 1500);
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
            autoUpdater.checkForUpdatesAndNotify();
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
app.whenReady().then(() => {
  console.log('App is ready');
  
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

// Auto-updater events
autoUpdater.on('update-available', (info) => {
  const currentVersion = app.getVersion();
  const nextVersion = info?.version;
  if (nextVersion && nextVersion === currentVersion) {
    return;
  }
  mainWindow?.webContents.send('update-available', {
    version: nextVersion || '',
    currentVersion,
  });
});

autoUpdater.on('update-downloaded', (info) => {
  mainWindow?.webContents.send('update-downloaded', {
    version: info?.version || '',
  });
});

autoUpdater.on('update-not-available', () => {
  mainWindow?.webContents.send('update-not-available');
});

autoUpdater.on('error', (error) => {
  const msg = error.message || String(error);
  if (shouldIgnoreUpdateError(msg)) {
    console.log('Update check:', msg);
    return;
  }
  console.error('Auto-updater error:', msg);
  mainWindow?.webContents.send('update-error', msg);
});

autoUpdater.on('download-progress', (progressObj) => {
  mainWindow?.webContents.send('update-download-progress', {
    percent: progressObj.percent,
    bytesPerSecond: progressObj.bytesPerSecond,
    transferred: progressObj.transferred,
    total: progressObj.total
  });
});

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
  autoUpdater.quitAndInstall();
});

function isRetryableUpdateError(err) {
  const msg = (err && (err.message || err)) || '';
  return /504|502|503|ETIMEDOUT|ECONNRESET|network/i.test(String(msg));
}

ipcMain.handle('check-for-updates', async (event) => {
  if (!isTrustedIpcSender(event)) {
    throw new Error('Untrusted IPC sender');
  }
  const runCheck = async () => {
    const result = await autoUpdater.checkForUpdates();
    const info = result?.updateInfo;
    const currentVersion = app.getVersion();
    if (!info || info.version === currentVersion) {
      return { success: true, updateInfo: null };
    }
    return {
      success: true,
      updateInfo: {
        version: info.version,
        releaseDate: info.releaseDate,
        path: info.path,
      },
    };
  };
  try {
    return await runCheck();
  } catch (error) {
    if (isRetryableUpdateError(error)) {
      await new Promise(r => setTimeout(r, 2500));
      try {
        return await runCheck();
      } catch (retryErr) {
        return {
          success: false,
          error: (retryErr.message || String(retryErr)) + ' (retry failed)'
        };
      }
    }
    return {
      success: false,
      error: error.message || String(error)
    };
  }
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
