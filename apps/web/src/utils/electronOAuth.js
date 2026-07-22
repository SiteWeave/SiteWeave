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

    // For Electron public clients (Google + Microsoft), use PKCE
    let pkceConfig = { ...config };
    if (this.isElectron && (provider === 'microsoft' || provider === 'google')) {
      const codeVerifier = this.generateCodeVerifier();
      const codeChallenge = await this.generateCodeChallenge(codeVerifier);
      this.pkceCodeVerifier = codeVerifier;
      // Keep legacy alias used by Microsoft token exchange paths
      this.msCodeVerifier = codeVerifier;
      console.log(`Generated PKCE code_verifier for ${provider} (length:`, codeVerifier.length, ')');
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

    // Electron public clients: include PKCE challenge for Google and Microsoft
    if (this.isElectron && config.codeChallenge && (provider === 'microsoft' || provider === 'google')) {
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
    console.log('pkceCodeVerifier exists:', !!(this.pkceCodeVerifier || this.msCodeVerifier));

    const body = new URLSearchParams({
      client_id: config.clientId,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });

    const codeVerifier = this.pkceCodeVerifier || this.msCodeVerifier;

    // Electron uses PKCE. If a confidential Web client ID is configured, also send client_secret
    // (Google returns "client_secret is missing" for Web clients without it).
    if (config.clientSecret) {
      body.set('client_secret', config.clientSecret);
      console.log('Including client_secret (confidential client)');
    }

    if (this.isElectron && (provider === 'google' || provider === 'microsoft')) {
      if (!codeVerifier) {
        throw new Error(`PKCE code_verifier is required for ${provider} OAuth in Electron but was not found.`);
      }
      body.set('code_verifier', codeVerifier);
      console.log('Including code_verifier (PKCE flow)');
    } else if (provider === 'microsoft' && !this.isElectron && config.scope) {
      body.set('scope', config.scope);
    }

    console.log('Token exchange body keys:', Array.from(body.keys()));

    // Prefer main-process exchange in Electron to avoid CORS / origin issues
    if (this.isElectron && window.electronAPI?.exchangeOAuthToken) {
      console.log(`Attempting ${provider} token exchange via main process...`);
      try {
        const json = await window.electronAPI.exchangeOAuthToken({
          provider,
          code,
          clientId: config.clientId,
          redirectUri,
          codeVerifier,
          ...(config.clientSecret ? { clientSecret: config.clientSecret } : {}),
        });
        this.pkceCodeVerifier = null;
        this.msCodeVerifier = null;
        console.log(`${provider} token exchange successful via main process`);
        return json;
      } catch (mainProcessError) {
        console.warn(`${provider} token exchange via main process failed, falling back to renderer:`, mainProcessError);
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
    this.pkceCodeVerifier = null;
    this.msCodeVerifier = null;
    return json;
  }
}

// Create singleton instance
const electronOAuth = new ElectronOAuth();

export default electronOAuth;
