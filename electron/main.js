// NOTE: Vite bundles electron/main.cjs as dist-electron/main.cjs (package.json "main"). Keep IPC handlers in sync with main.cjs.
const { app, BrowserWindow, Menu, shell, protocol, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { createServer } = require('http');
const fs = require('fs');
const { parse } = require('url');

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

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let oauthServer = null;
const OAUTH_PORT = 5000;

// Configure auto-updater
// Only check for updates in production builds from official releases
if (!isDev && process.env.PORTABLE_EXECUTABLE_DIR === undefined) {
  // Configure auto-updater settings
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  
  // Check for updates with better error handling
  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    // Only log if it's not a "no update available" error
    if (!err.message.includes('latest.yml') && !err.message.includes('404')) {
      console.log('Auto-update check failed:', err.message);
    }
  });
}

// OAuth Server for loopback method
function startOAuthServer() {
  if (oauthServer) {
    return; // Server already running
  }

  oauthServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // Handle OAuth callbacks
    if (pathname.includes('-callback')) {
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
            setTimeout(() => {
              window.close();
            }, 2000);
          </script>
        </body>
        </html>
      `);

      // Send callback data to main window
      if (mainWindow) {
        mainWindow.webContents.send('oauth-callback', {
          provider: provider,
          code: query.code,
          state: query.state,
          error: query.error,
          errorDescription: query.error_description
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
      console.log(`Port ${OAUTH_PORT} is already in use, trying next port...`);
      // Try next available port
      oauthServer.listen(0, '127.0.0.1', () => {
        const actualPort = oauthServer.address().port;
        console.log(`OAuth server listening on http://127.0.0.1:${actualPort}`);
      });
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
      // Enable webSecurity when loading from HTTP (dev server)
      // In production with file:// protocol, webSecurity may need to be disabled
      // but Content Security Policy in index.html provides protection
      webSecurity: isDev,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../build/icon.png'),
    title: 'SiteWeave',
    show: false, // Don't show until ready
    titleBarStyle: 'default'
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, use the correct path for packaged apps
    let indexPath;
    
    if (app.isPackaged) {
      // For packaged apps, the dist folder is at the root of the asar file
      indexPath = path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html');
    } else {
      // For development builds
      indexPath = path.join(__dirname, '../dist/index.html');
    }
    
    console.log('Production - Loading from:', indexPath);
    console.log('File exists:', fs.existsSync(indexPath));
    
    if (fs.existsSync(indexPath)) {
      // Use loadFile for better compatibility
      mainWindow.loadFile(indexPath);
    } else {
      console.error('Could not find index.html at:', indexPath);
      mainWindow.loadURL('data:text/html,<h1>Error: Could not load application</h1><p>Please reinstall the application.</p>');
    }
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
    // Show window even if load fails
    mainWindow.show();
    mainWindow.focus();
  });

  // Add error handling for renderer process crashes
  mainWindow.webContents.on('crashed', (event) => {
    console.error('Renderer process crashed');
    // Don't close the window, just log the error
  });

  // Add error handling for unresponsive renderer
  mainWindow.webContents.on('unresponsive', () => {
    console.warn('Renderer process became unresponsive');
  });

  // Add error handling for responsive renderer
  mainWindow.webContents.on('responsive', () => {
    console.log('Renderer process became responsive again');
  });

  // Fallback: Force show window after timeout
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('Force showing window after timeout');
      mainWindow.show();
      mainWindow.focus();
    }
  }, 2000);

  // Handle window closed
  mainWindow.on('closed', () => {
    console.log('Main window was closed');
    mainWindow = null;
  });

  // Prevent window from closing on error
  mainWindow.on('close', (event) => {
    console.log('Window close event triggered');
    // Don't prevent closing, just log it
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Prevent navigation to external URLs (but allow same-origin)
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const currentUrl = mainWindow.webContents.getURL();
      const parsedNav = new URL(navigationUrl);
      const parsedCurrent = new URL(currentUrl);
      
      // Allow same-origin navigation (includes file:// within same directory)
      if (parsedNav.protocol === parsedCurrent.protocol && 
          (parsedNav.protocol === 'file:' || parsedNav.host === parsedCurrent.host)) {
        return; // Allow navigation
      }
      
      // Block and open externally
      event.preventDefault();
      shell.openExternal(navigationUrl);
    } catch (err) {
      console.error('Navigation check error:', err);
      // On error, allow navigation (fail open)
    }
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
    createWindow();
    createMenu();
    startOAuthServer(); // Start OAuth server
  }

  // Handle protocol URLs
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Prevent the app from quitting when all windows are closed
app.on('window-all-closed', () => {
  stopOAuthServer(); // Stop OAuth server
  // Don't quit on Windows - keep the app running
  if (process.platform !== 'darwin') {
    // Only quit if explicitly requested
    console.log('All windows closed, but keeping app running');
  }
});

app.on('before-quit', () => {
  stopOAuthServer(); // Stop OAuth server before quitting
});

// Auto-updater events
autoUpdater.on('update-available', () => {
  mainWindow?.webContents.send('update-available');
});

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update-downloaded');
});

autoUpdater.on('error', (error) => {
  // Only log and send error if it's not a "no update available" error
  const errorMessage = error?.message || String(error);
  if (!errorMessage.includes('latest.yml') && !errorMessage.includes('404') && !errorMessage.includes('No published versions')) {
    console.error('Auto-updater error:', error);
    mainWindow?.webContents.send('update-error', errorMessage);
  }
});

// Add download progress tracking
autoUpdater.on('download-progress', (progressObj) => {
  mainWindow?.webContents.send('update-download-progress', {
    percent: progressObj.percent,
    transferred: progressObj.transferred,
    total: progressObj.total,
    bytesPerSecond: progressObj.bytesPerSecond
  });
});

// IPC handlers
ipcMain.handle('save-html-as-pdf', async (event, { html, defaultFilename }) => {
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
      webSecurity: false,
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

    await new Promise((r) => setTimeout(r, 400));

    const pdfBuffer = await hidden.webContents.printToPDF({
      printBackground: true,
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

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    // Return only serializable data
    return {
      success: true,
      updateInfo: result?.updateInfo ? {
        version: result.updateInfo.version,
        releaseDate: result.updateInfo.releaseDate,
        path: result.updateInfo.path
      } : null
    };
  } catch (error) {
    // Return serializable error
    return {
      success: false,
      error: error.message || String(error)
    };
  }
});

ipcMain.handle('start-oauth-server', () => {
  startOAuthServer();
  return true;
});

ipcMain.handle('stop-oauth-server', () => {
  stopOAuthServer();
  return true;
});

// Handle OAuth token exchange from main process (to avoid CORS/origin issues)
ipcMain.handle('exchange-oauth-token', async (event, { provider, code, clientId, redirectUri, codeVerifier, clientSecret }) => {
  const https = require('https');
  const { URL, URLSearchParams } = require('url');
  
  const tokenUrls = {
    google: 'https://oauth2.googleapis.com/token',
    microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
  };
  
  const tokenUrl = tokenUrls[provider];
  if (!tokenUrl) {
    throw new Error(`Unknown OAuth provider: ${provider}`);
  }
  
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_id: clientId,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });
    
    if (provider === 'google' && clientSecret) {
      body.set('client_secret', clientSecret);
    }

    // Add code_verifier for Microsoft PKCE flow
    if (provider === 'microsoft' && codeVerifier) {
      body.set('code_verifier', codeVerifier);
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
