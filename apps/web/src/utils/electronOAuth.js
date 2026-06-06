// Electron OAuth Helper
// Handles OAuth flows for desktop applications using loopback method (localhost server)

class ElectronOAuth {
  constructor() {
    // More robust Electron detection
    this.isElectron = !!(window.electronAPI?.isElectron || window.electronAPI);
    console.log('ElectronOAuth: isElectron =', this.isElectron);
    console.log('ElectronOAuth: window.electronAPI =', window.electronAPI);
    this.localServer = null;
    this.setupListeners();
  }

  setupListeners() {
    if (this.isElectron && window.electronAPI) {
      // Listen for OAuth callbacks from main process
      window.electronAPI.onOAuthCallback((data) => {
        this.handleOAuthCallback(data);
      });
    }
  }

  // Start OAuth flow using loopback method
  async startOAuthFlow(provider, config) {
    console.log('Starting OAuth flow for provider:', provider);
    console.log('isElectron:', this.isElectron);
    console.log('window.electronAPI:', window.electronAPI);
    
    const redirectUri = this.isElectron 
      ? `http://127.0.0.1:5000/${provider}-callback`
      : `${window.location.origin}/${provider}-callback`;

    console.log('Using redirect URI:', redirectUri);

    // For Microsoft in Electron (public client), use PKCE
    let pkceConfig = { ...config };
    if (provider === 'microsoft' && this.isElectron) {
      const codeVerifier = this.generateCodeVerifier();
      const codeChallenge = await this.generateCodeChallenge(codeVerifier);
      this.msCodeVerifier = codeVerifier;
      console.log('Generated PKCE code_verifier for Microsoft (length:', codeVerifier.length, ')');
      console.log('Code challenge generated');
      pkceConfig = { ...pkceConfig, codeChallenge };
    } else if (provider === 'microsoft' && !this.isElectron) {
      console.log('Microsoft OAuth in web mode - will use client_secret');
    }

    const authUrl = this.buildAuthUrl(provider, pkceConfig, redirectUri);
    console.log('Generated auth URL:', authUrl);

    if (this.isElectron) {
      // In Electron, start local server and open browser
      console.log('Using Electron OAuth flow');
      await this.startLocalServer(provider);
      window.electronAPI.openExternal(authUrl);
      
      // Return a promise that resolves when callback is received
      return new Promise((resolve, reject) => {
        this.pendingOAuth = { resolve, reject, provider };
        
        // Set timeout for OAuth flow
        setTimeout(() => {
          if (this.pendingOAuth) {
            this.pendingOAuth.reject(new Error('OAuth timeout'));
            this.pendingOAuth = null;
            this.stopLocalServer();
          }
        }, 300000); // 5 minutes timeout
      });
    } else {
      // In web browser, use popup
      console.log('Using web OAuth flow');
      return this.startWebOAuthFlow(authUrl, provider);
    }
  }

  // Start local server for OAuth callbacks
  async startLocalServer(provider) {
    if (this.localServer) {
      await this.stopLocalServer();
    }

    try {
      // Use electron's IPC to start the server
      if (window.electronAPI) {
        await window.electronAPI.startOAuthServer();
        console.log(`Started local server for ${provider} OAuth callback`);
      }
    } catch (error) {
      console.error('Failed to start local server:', error);
      throw error;
    }
  }

  // Stop local server
  async stopLocalServer() {
    if (this.localServer) {
      try {
        if (window.electronAPI) {
          await window.electronAPI.stopOAuthServer();
        }
        console.log('Stopped local OAuth server');
        this.localServer = null;
      } catch (error) {
        console.error('Error stopping local server:', error);
      }
    }
  }

  // Build OAuth URL based on provider
  buildAuthUrl(provider, config, redirectUri) {
    const baseUrls = {
      google: 'https://accounts.google.com/o/oauth2/v2/auth',
      microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
    };

    const scopes = {
      google: 'https://www.googleapis.com/auth/calendar.readonly',
      microsoft: 'https://graph.microsoft.com/Calendars.Read'
    };

    const url = new URL(baseUrls[provider]);
    
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', scopes[provider]);

    // Microsoft: include PKCE in Electron/public client flow
    if (provider === 'microsoft' && config.codeChallenge) {
      url.searchParams.set('code_challenge', config.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }

    if (config.state) {
      url.searchParams.set('state', config.state);
    }

    return url.toString();
  }

  // Handle OAuth callback from main process
  handleOAuthCallback(data) {
    if (!this.pendingOAuth) return;

    const { provider, code, error, errorDescription } = data;

    if (error) {
      this.pendingOAuth.reject(new Error(errorDescription || error));
    } else if (code) {
      this.pendingOAuth.resolve({ code, provider });
    }

    this.pendingOAuth = null;
    this.stopLocalServer();
  }

  // Web OAuth flow using popup (fallback for web browsers)
  async startWebOAuthFlow(authUrl, provider) {
    const popup = window.open(
      authUrl,
      `${provider}-oauth`,
      'width=600,height=600,scrollbars=yes,resizable=yes'
    );

    return new Promise((resolve, reject) => {
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          reject(new Error('OAuth popup was closed'));
        }
      }, 1000);

      // Listen for OAuth completion
      window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === `${provider.toUpperCase()}_OAUTH_SUCCESS`) {
          clearInterval(checkClosed);
          popup.close();
          resolve({ code: event.data.code, provider });
        } else if (event.data.type === `${provider.toUpperCase()}_OAUTH_ERROR`) {
          clearInterval(checkClosed);
          popup.close();
          reject(new Error(event.data.error));
        }
      });
    });
  }

  // Generate PKCE code verifier
  generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  // Generate PKCE code challenge
  async generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  // Exchange authorization code for access token
  async exchangeCodeForToken(provider, code, config) {
    const tokenUrls = {
      google: 'https://oauth2.googleapis.com/token',
      microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
    };

    const redirectUri = this.isElectron 
      ? `http://127.0.0.1:5000/${provider}-callback`
      : `${window.location.origin}/${provider}-callback`;

    console.log('=== TOKEN EXCHANGE DEBUG ===');
    console.log('Provider:', provider);
    console.log('isElectron:', this.isElectron);
    console.log('Redirect URI:', redirectUri);
    console.log('msCodeVerifier exists:', !!this.msCodeVerifier);
    console.log('msCodeVerifier length:', this.msCodeVerifier?.length);

    const body = new URLSearchParams({
      client_id: config.clientId,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });

    // Only include client_secret for confidential clients (web/backend). Public clients (Electron) must not send it.
    if (!(provider === 'microsoft' && this.isElectron) && config.clientSecret) {
      body.set('client_secret', config.clientSecret);
      console.log('Including client_secret (web flow)');
    }

    // Microsoft public client requires PKCE code_verifier
    // CRITICAL: For Electron, we MUST include code_verifier, otherwise Microsoft treats it as cross-origin
    if (provider === 'microsoft' && this.isElectron) {
      if (this.msCodeVerifier) {
        body.set('code_verifier', this.msCodeVerifier);
        console.log('Including code_verifier (PKCE flow)');
      } else {
        console.error('ERROR: Microsoft Electron flow requires code_verifier but it is missing!');
        throw new Error('PKCE code_verifier is required for Microsoft OAuth in Electron but was not found. This usually means the authorization flow did not complete properly.');
      }
      // For Native apps with PKCE, do NOT include scope in token exchange
      // The scope is already bound to the authorization code
    } else if (provider === 'microsoft' && !this.isElectron) {
      // Web flow: include scope if provided
      if (config.scope) {
        body.set('scope', config.scope);
      }
    }

    console.log('Token exchange body keys:', Array.from(body.keys()));

    // Google in Electron: use main process to avoid CORS and include client_secret securely
    if (provider === 'google' && this.isElectron && window.electronAPI?.exchangeOAuthToken) {
      console.log('Attempting Google token exchange via main process...');
      try {
        const json = await window.electronAPI.exchangeOAuthToken({
          provider: 'google',
          code,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          redirectUri,
        });
        console.log('Google token exchange successful via main process');
        return json;
      } catch (mainProcessError) {
        console.warn('Google token exchange via main process failed, falling back to renderer:', mainProcessError);
      }
    }

    // For Microsoft in Electron, try using main process to avoid CORS/origin issues
    if (provider === 'microsoft' && this.isElectron && window.electronAPI?.exchangeOAuthToken) {
      console.log('Attempting token exchange via main process (to avoid CORS issues)...');
      try {
        const json = await window.electronAPI.exchangeOAuthToken({
          provider: 'microsoft',
          code: code,
          clientId: config.clientId,
          redirectUri: redirectUri,
          codeVerifier: this.msCodeVerifier
        });
        // Clear one-time verifier after successful exchange
        this.msCodeVerifier = null;
        console.log('Token exchange successful via main process');
        return json;
      } catch (mainProcessError) {
        console.warn('Token exchange via main process failed, falling back to renderer:', mainProcessError);
        // Fall through to renderer process attempt
      }
    }

    // Fallback to renderer process fetch (original method)
    const response = await fetch(tokenUrls[provider], {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Token exchange failed. Response:', error);
      throw new Error(`Token exchange failed: ${error}`);
    }

    const json = await response.json();
    // Clear one-time verifier after successful exchange
    if (provider === 'microsoft') {
      this.msCodeVerifier = null;
    }
    return json;
  }
}

// Create singleton instance
const electronOAuth = new ElectronOAuth();

export default electronOAuth;
