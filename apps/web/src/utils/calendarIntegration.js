// Calendar Integration Utilities
// This file handles OAuth callbacks and API integrations for Google Calendar and Outlook
import electronOAuth from './electronOAuth.js';

// ============================================================================
// TOKEN STORAGE FUNCTIONS (moved to top for use in callback functions)
// ============================================================================

const TOKEN_STORAGE_KEY = {
    google: 'google_calendar_token',
    outlook: 'outlook_calendar_token'
};

export const storeCalendarToken = (provider, token) => {
    if (provider === 'google' || provider === 'outlook') {
        try {
            localStorage.setItem(TOKEN_STORAGE_KEY[provider], token);
        } catch (error) {
            console.error('Failed to store calendar token:', error);
            // localStorage might be unavailable (privacy mode, quota exceeded, etc.)
        }
    }
};

export const getStoredCalendarToken = (provider) => {
    if (provider === 'google' || provider === 'outlook') {
        try {
            return localStorage.getItem(TOKEN_STORAGE_KEY[provider]);
        } catch (error) {
            console.error('Failed to get calendar token:', error);
            return null;
        }
    }
    return null;
};

export const clearCalendarToken = (provider) => {
    if (provider === 'google' || provider === 'outlook') {
        try {
            localStorage.removeItem(TOKEN_STORAGE_KEY[provider]);
        } catch (error) {
            console.error('Failed to clear calendar token:', error);
        }
    }
};

// ============================================================================
// CALENDAR IMPORT FUNCTIONS
// ============================================================================

export const handleGoogleCalendarCallback = async (code) => {
    try {
        // Exchange authorization code for access token
        const { access_token } = await exchangeGoogleToken(code);
        
        // Store token for future sync operations
        storeCalendarToken('google', access_token);

        // Fetch events from Google Calendar
        const data = await fetchGoogleCalendarEvents(access_token);
        return transformGoogleEvents(data.items || []);

    } catch (error) {
        console.error('Google Calendar integration error:', error);
        throw error;
    }
};

export const startGoogleCalendarOAuth = async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const isElectron = !!window.electronAPI?.isElectron;
    // Prefer PKCE for Electron Desktop clients. Also pass secret when present so
    // confidential Web client IDs still work (Google requires client_secret for those).
    const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
    
    if (!clientId || (!isElectron && !clientSecret)) {
        throw new Error(
            isElectron
                ? 'Google OAuth client ID not configured'
                : 'Google OAuth credentials not configured (set VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_SECRET)'
        );
    }
    if (isElectron && !clientSecret) {
        console.warn(
            'VITE_GOOGLE_CLIENT_SECRET is unset. If Google returns "client_secret is missing", use a Desktop OAuth client or set the Web client secret.',
        );
    }

    try {
        const result = await electronOAuth.startOAuthFlow('google', {
            clientId: clientId,
            ...(clientSecret ? { clientSecret } : {}),
        });

        const tokenData = await electronOAuth.exchangeCodeForToken('google', result.code, {
            clientId: clientId,
            ...(clientSecret ? { clientSecret } : {}),
        });
        
        // Store token for future sync operations
        storeCalendarToken('google', tokenData.access_token);

        // Fetch events from Google Calendar
        const data = await fetchGoogleCalendarEvents(tokenData.access_token);
        return transformGoogleEvents(data.items || []);

    } catch (error) {
        console.error('Google Calendar OAuth error:', error);
        throw error;
    }
};

export const handleOutlookCalendarCallback = async (code) => {
    try {
        // If running in Electron, use electronOAuth which supports PKCE
        if (window.electronAPI?.isElectron) {
            const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;
            if (!clientId) {
                throw new Error('Microsoft OAuth client ID not configured');
            }
            
            const tokenData = await electronOAuth.exchangeCodeForToken('microsoft', code, {
                clientId: clientId
            });
            
            // Store token for future sync operations
            storeCalendarToken('outlook', tokenData.access_token);

            // Fetch events from Microsoft Graph
            const data = await fetchOutlookCalendarEvents(tokenData.access_token);
            return transformOutlookEvents(data.value || []);
        } else {
            // Web browser flow - use standard token exchange
            const { access_token } = await exchangeOutlookToken(code);
            
            // Store token for future sync operations
            storeCalendarToken('outlook', access_token);

            // Fetch events from Microsoft Graph
            const data = await fetchOutlookCalendarEvents(access_token);
            return transformOutlookEvents(data.value || []);
        }

    } catch (error) {
        console.error('Outlook Calendar integration error:', error);
        throw error;
    }
};

export const startOutlookCalendarOAuth = async () => {
    const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;
    
    if (!clientId) {
        throw new Error('Microsoft OAuth client ID not configured');
    }

    console.log('=== STARTING OUTLOOK OAUTH ===');
    console.log('window.electronAPI:', window.electronAPI);
    console.log('electronOAuth.isElectron:', electronOAuth.isElectron);

    try {
        const result = await electronOAuth.startOAuthFlow('microsoft', {
            clientId: clientId
        });

        console.log('OAuth flow completed, received code. Exchanging for token...');
        console.log('msCodeVerifier before exchange:', !!electronOAuth.msCodeVerifier);

        const tokenData = await electronOAuth.exchangeCodeForToken('microsoft', result.code, {
            clientId: clientId
        });
        
        // Store token for future sync operations
        storeCalendarToken('outlook', tokenData.access_token);

        // Fetch events from Microsoft Graph
        const data = await fetchOutlookCalendarEvents(tokenData.access_token);
        return transformOutlookEvents(data.value || []);

    } catch (error) {
        console.error('Microsoft Calendar OAuth error:', error);
        throw error;
    }
};

// Google Calendar API Integration
const exchangeGoogleToken = async (code) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const isElectron = !!window.electronAPI?.isElectron;
    const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
    const redirectUri = isElectron 
        ? 'http://127.0.0.1:5000/google-callback'
        : window.location.origin + '/calendar';

    const params = {
        client_id: clientId,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
    };
    if (clientSecret) {
        params.client_secret = clientSecret;
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
            detail
                ? `Failed to exchange Google token: ${detail}`
                : 'Failed to exchange Google token',
        );
    }

    return await response.json();
};

const fetchGoogleCalendarEvents = async (accessToken) => {
    const now = new Date();
    const timeMin = new Date(now);
    timeMin.setMonth(timeMin.getMonth() - 3);
    const timeMax = new Date(now);
    timeMax.setMonth(timeMax.getMonth() + 12);

    const baseParams = new URLSearchParams({
        singleEvents: 'true',
        orderBy: 'startTime',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: '250',
    });

    const allItems = [];
    let pageToken = null;
    let pageCount = 0;

    do {
        const params = new URLSearchParams(baseParams);
        if (pageToken) params.set('pageToken', pageToken);

        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        );

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to fetch Google Calendar events: ${text}`);
        }

        const data = await response.json();
        if (Array.isArray(data.items)) allItems.push(...data.items);
        pageToken = data.nextPageToken || null;
        pageCount += 1;
    } while (pageToken && pageCount < 20);

    return { items: allItems };
};

// Microsoft Graph API Integration
const OUTLOOK_PKCE_VERIFIER_KEY = 'outlook_oauth_code_verifier';

function generatePkceCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

async function generatePkceCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/** Build Microsoft authorize URL for browser SPA flow (PKCE required). */
export async function buildOutlookWebAuthUrl(clientId) {
    const redirectUri = `${window.location.origin}/calendar`;
    const codeVerifier = generatePkceCodeVerifier();
    const codeChallenge = await generatePkceCodeChallenge(codeVerifier);
    sessionStorage.setItem(OUTLOOK_PKCE_VERIFIER_KEY, codeVerifier);

    const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'https://graph.microsoft.com/Calendars.Read');
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
}

const exchangeOutlookToken = async (code) => {
    const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;
    // Use the same redirect URI used during authorization (Calendar page)
    const redirectUri = window.location.origin + '/calendar';
    const codeVerifier = sessionStorage.getItem(OUTLOOK_PKCE_VERIFIER_KEY);

    const body = new URLSearchParams({
        client_id: clientId,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        scope: 'https://graph.microsoft.com/Calendars.Read',
    });
    if (codeVerifier) {
        body.set('code_verifier', codeVerifier);
    }

    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    });

    sessionStorage.removeItem(OUTLOOK_PKCE_VERIFIER_KEY);

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
            detail
                ? `Failed to exchange Microsoft token: ${detail}`
                : 'Failed to exchange Microsoft token',
        );
    }

    return await response.json();
};

const fetchOutlookCalendarEvents = async (accessToken) => {
    // Fetch all pages of events (Graph paginates results)
    let url = 'https://graph.microsoft.com/v1.0/me/events?$top=100&$orderby=start/dateTime asc';
    const all = [];
    let pageCount = 0;

    while (url && pageCount < 20) { // hard cap to avoid infinite loops
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error('Failed to fetch Outlook Calendar events: ' + text);
        }

        const data = await response.json();
        if (Array.isArray(data.value)) all.push(...data.value);
        url = data['@odata.nextLink'] || null;
        pageCount += 1;
    }

    return { value: all };
};

const transformGoogleEvents = (events) => {
    return events.map(event => ({
        title: event.summary || 'Untitled Event',
        description: event.description || '',
        start_time: event.start?.dateTime || event.start?.date + 'T09:00:00',
        end_time: event.end?.dateTime || event.end?.date + 'T17:00:00',
        location: event.location || '',
        attendees: event.attendees?.map(a => a.email).join(', ') || '',
        category: 'other',
        color: '#6B7280',
        is_all_day: !event.start?.dateTime,
        external_id: event.id,
        external_source: 'google'
    }));
};

// Decode HTML entities to text
const decodeHtmlEntities = (text) => {
    if (!text) return '';
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
};

// Convert HTML string to plain text, preserving basic line breaks
const htmlToPlainText = (html) => {
    if (!html) return '';
    const normalized = html
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\s*\/(p|div|li)\s*>/gi, '\n');
    const container = document.createElement('div');
    container.innerHTML = normalized;
    const text = container.textContent || container.innerText || '';
    return text.replace(/\u00A0/g, ' ') // nbsp
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const transformOutlookEvents = (events) => {
    return events.map(event => {
        const raw = event.body?.content || '';
        const description = event.body?.contentType === 'html'
            ? htmlToPlainText(raw)
            : decodeHtmlEntities(raw);

        return {
            title: event.subject || 'Untitled Event',
            description: description,
            start_time: event.start?.dateTime || event.start?.date + 'T09:00:00',
            end_time: event.end?.dateTime || event.end?.date + 'T17:00:00',
            location: event.location?.displayName || '',
            attendees: event.attendees?.map(a => a.emailAddress?.address).join(', ') || '',
            category: 'other',
            color: '#6B7280',
            is_all_day: !event.start?.dateTime,
            external_id: event.id,
            external_source: 'outlook'
        };
    });
};

// Parse URL parameters for OAuth callbacks
export const parseOAuthCallback = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    return { code, state, error };
};

// Clear OAuth parameters from URL
export const clearOAuthParams = () => {
    const url = new URL(window.location);
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('error');
    window.history.replaceState({}, document.title, url.pathname);
};

// Prepare events for DB insert by picking only allowed columns
export const prepareCalendarEventsForInsert = (events, userId = null) => {
    return events.map(e => ({
        title: e.title,
        description: e.description || '',
        start_time: e.start_time,
        end_time: e.end_time,
        location: e.location || '',
        attendees: e.attendees || '',
        category: e.category || 'other',
        color: e.color || '#6B7280',
        is_all_day: !!e.is_all_day,
        recurrence: e.recurrence || null,
        external_id: e.external_id || null,
        external_source: e.external_source || null,
        user_id: userId,
    }));
};

/** Skip calendar events already imported for this user + external provider. */
export const filterNewCalendarImports = async (supabaseClient, events, userId) => {
    if (!userId || !Array.isArray(events) || events.length === 0) return events || [];

    const bySource = events.reduce((acc, event) => {
        if (event.external_id && event.external_source) {
            if (!acc[event.external_source]) acc[event.external_source] = [];
            acc[event.external_source].push(event.external_id);
        }
        return acc;
    }, {});

    const existingIds = new Set();
    for (const [source, ids] of Object.entries(bySource)) {
        const uniqueIds = [...new Set(ids)];
        if (!uniqueIds.length) continue;
        const { data, error } = await supabaseClient
            .from('calendar_events')
            .select('external_id')
            .eq('user_id', userId)
            .eq('external_source', source)
            .in('external_id', uniqueIds);
        if (error) {
            console.warn('Could not check existing imported events:', error.message);
            continue;
        }
        (data || []).forEach((row) => {
            if (row.external_id) existingIds.add(`${source}:${row.external_id}`);
        });
    }

    return events.filter((event) => {
        if (!event.external_id || !event.external_source) return true;
        return !existingIds.has(`${event.external_source}:${event.external_id}`);
    });
};

// ============================================================================
// BIDIRECTIONAL SYNC FUNCTIONS
// ============================================================================

function getLocalTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
        return undefined;
    }
}

// Create event in Google Calendar
export const createGoogleCalendarEvent = async (event, accessToken) => {
    if (!accessToken) {
        throw new Error('Google Calendar access token is required');
    }
    try {
        const eventData = {
            summary: event.title,
            description: event.description || '',
            start: {
                dateTime: event.is_all_day ? undefined : event.start_time,
                date: event.is_all_day ? event.start_time.split('T')[0] : undefined,
                timeZone: getLocalTimeZone()
            },
            end: {
                dateTime: event.is_all_day ? undefined : event.end_time,
                date: event.is_all_day ? event.end_time.split('T')[0] : undefined,
                timeZone: getLocalTimeZone()
            },
            location: event.location || '',
            attendees: event.attendees ? event.attendees.split(',').map(email => ({ email: email.trim() })) : []
        };

        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventData)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            // Handle token expiration
            if (response.status === 401 || response.status === 403) {
                clearCalendarToken('google');
                throw new Error('Google Calendar token expired. Please reconnect your calendar.');
            }
            throw new Error(error.error?.message || 'Failed to create event in Google Calendar');
        }

        const data = await response.json();
        return {
            success: true,
            external_id: data.id,
            external_source: 'google'
        };
    } catch (error) {
        console.error('Error creating Google Calendar event:', error);
        throw error;
    }
};

// Create event in Outlook Calendar
export const createOutlookCalendarEvent = async (event, accessToken) => {
    if (!accessToken) {
        throw new Error('Outlook Calendar access token is required');
    }
    try {
        const eventData = {
            subject: event.title,
            body: {
                contentType: 'text',
                content: event.description || ''
            },
            start: {
                dateTime: event.start_time,
                timeZone: getLocalTimeZone()
            },
            end: {
                dateTime: event.end_time,
                timeZone: getLocalTimeZone()
            },
            location: event.location ? {
                displayName: event.location
            } : undefined,
            attendees: event.attendees ? event.attendees.split(',').map(email => ({
                emailAddress: { address: email.trim() },
                type: 'required'
            })) : [],
            isAllDay: event.is_all_day || false
        };

        const response = await fetch('https://graph.microsoft.com/v1.0/me/events', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventData)
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            // Handle token expiration
            if (response.status === 401 || response.status === 403) {
                clearCalendarToken('outlook');
                throw new Error('Outlook Calendar token expired. Please reconnect your calendar.');
            }
            throw new Error(`Failed to create event in Outlook Calendar: ${errorText}`);
        }

        const data = await response.json();
        return {
            success: true,
            external_id: data.id,
            external_source: 'outlook'
        };
    } catch (error) {
        console.error('Error creating Outlook Calendar event:', error);
        throw error;
    }
};

// Update event in Google Calendar
export const updateGoogleCalendarEvent = async (event, externalId, accessToken) => {
    if (!accessToken) {
        throw new Error('Google Calendar access token is required');
    }
    if (!externalId) {
        throw new Error('External event ID is required');
    }
    try {
        const eventData = {
            summary: event.title,
            description: event.description || '',
            start: {
                dateTime: event.is_all_day ? undefined : event.start_time,
                date: event.is_all_day ? event.start_time.split('T')[0] : undefined,
                timeZone: getLocalTimeZone()
            },
            end: {
                dateTime: event.is_all_day ? undefined : event.end_time,
                date: event.is_all_day ? event.end_time.split('T')[0] : undefined,
                timeZone: getLocalTimeZone()
            },
            location: event.location || '',
            attendees: event.attendees ? event.attendees.split(',').map(email => ({ email: email.trim() })) : []
        };

        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${externalId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventData)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            // Handle token expiration
            if (response.status === 401 || response.status === 403) {
                clearCalendarToken('google');
                throw new Error('Google Calendar token expired. Please reconnect your calendar.');
            }
            throw new Error(error.error?.message || 'Failed to update event in Google Calendar');
        }

        return { success: true };
    } catch (error) {
        console.error('Error updating Google Calendar event:', error);
        throw error;
    }
};

// Update event in Outlook Calendar
export const updateOutlookCalendarEvent = async (event, externalId, accessToken) => {
    if (!accessToken) {
        throw new Error('Outlook Calendar access token is required');
    }
    if (!externalId) {
        throw new Error('External event ID is required');
    }
    try {
        const eventData = {
            subject: event.title,
            body: {
                contentType: 'text',
                content: event.description || ''
            },
            start: {
                dateTime: event.start_time,
                timeZone: getLocalTimeZone()
            },
            end: {
                dateTime: event.end_time,
                timeZone: getLocalTimeZone()
            },
            location: event.location ? {
                displayName: event.location
            } : undefined,
            attendees: event.attendees ? event.attendees.split(',').map(email => ({
                emailAddress: { address: email.trim() },
                type: 'required'
            })) : [],
            isAllDay: event.is_all_day || false
        };

        const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${externalId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventData)
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            // Handle token expiration
            if (response.status === 401 || response.status === 403) {
                clearCalendarToken('outlook');
                throw new Error('Outlook Calendar token expired. Please reconnect your calendar.');
            }
            throw new Error(`Failed to update event in Outlook Calendar: ${errorText}`);
        }

        return { success: true };
    } catch (error) {
        console.error('Error updating Outlook Calendar event:', error);
        throw error;
    }
};

// Delete event from Google Calendar
export const deleteGoogleCalendarEvent = async (externalId, accessToken) => {
    if (!accessToken) {
        throw new Error('Google Calendar access token is required');
    }
    if (!externalId) {
        return { success: true }; // No-op if no external ID
    }
    try {
        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${externalId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok && response.status !== 404) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Failed to delete event from Google Calendar');
        }

        return { success: true };
    } catch (error) {
        console.error('Error deleting Google Calendar event:', error);
        throw error;
    }
};

// Delete event from Outlook Calendar
export const deleteOutlookCalendarEvent = async (externalId, accessToken) => {
    if (!accessToken) {
        throw new Error('Outlook Calendar access token is required');
    }
    if (!externalId) {
        return { success: true }; // No-op if no external ID
    }
    try {
        const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${externalId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok && response.status !== 404) {
            const error = await response.text();
            throw new Error(`Failed to delete event from Outlook Calendar: ${error}`);
        }

        return { success: true };
    } catch (error) {
        console.error('Error deleting Outlook Calendar event:', error);
        throw error;
    }
};