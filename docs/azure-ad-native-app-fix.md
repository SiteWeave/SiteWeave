# Fixing Azure AD AADSTS90023 Error for Native Apps

## Error Message
```
AADSTS90023: Cross-origin token redemption is permitted only for the 'Single-Page Application' client-type or 'Native' client-type with origin registered in AllowedOriginForNativeAppCorsRequestInOAuthToken allow list.
```

## Root Cause
This error occurs when Azure AD detects a cross-origin token exchange request from a Native app, but the origin is not registered in the allowed origins list.

## Solution: Configure Azure AD App Registration

### Step 1: Verify App Type
1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Select your app (the one whose Client ID matches `VITE_MICROSOFT_CLIENT_ID`)
4. Go to **Authentication**

### Step 2: Check Platform Configuration
Ensure you have **BOTH** platforms configured:

#### A. Mobile and desktop applications (for Electron)
1. Under "Platform configurations", look for "Mobile and desktop applications"
2. If it doesn't exist, click **"Add a platform"** → **"Mobile and desktop applications"**
3. Add redirect URI: `http://127.0.0.1:5000/microsoft-callback`
4. **IMPORTANT**: Check the box **"Allow public client flows"** (this is critical!)
5. Click **Configure**

#### B. Web (for web portal)
1. Under "Platform configurations", look for "Web"
2. If it doesn't exist, click **"Add a platform"** → **"Web"**
3. Add redirect URIs:
   - `https://yourdomain.com/calendar` (your production URL)
   - `http://localhost:5173/calendar` (for local development)
4. Click **Configure**

### Step 3: Enable Public Client Flows (Critical!)
1. In the "Mobile and desktop applications" platform section
2. Find **"Allow public client flows"**
3. Set it to **"Yes"** (this enables PKCE for Native apps)
4. Save

### Step 4: Verify API Permissions
1. Go to **API permissions**
2. Ensure Microsoft Graph permissions are added:
   - `Calendars.Read`
   - `Calendars.ReadWrite` (if needed)
3. Click **"Grant admin consent"** if you have admin rights

### Step 5: Check Advanced Settings (if error persists)
1. In **Authentication** page, scroll to **"Advanced settings"**
2. Look for **"Allow public client flows"** - ensure it's enabled
3. Some tenants may have this under **"Implicit grant and hybrid flows"** → ensure it's configured correctly

## Why This Happens

Microsoft Azure AD requires explicit configuration for Native apps using PKCE:
- The app must be registered as "Mobile and desktop applications" (not just Web)
- "Allow public client flows" must be enabled
- The redirect URI must match exactly: `http://127.0.0.1:5000/microsoft-callback`

If any of these are missing, Azure AD treats the token exchange as a cross-origin request from an unauthorized origin, causing the AADSTS90023 error.

## Verification

After making these changes:
1. Wait 1-2 minutes for Azure AD to propagate the changes
2. Try connecting Outlook Calendar again
3. Check the console logs - you should see successful token exchange

## Troubleshooting

If the error persists after configuration:
1. **Clear browser cache** - Azure AD caches app configurations
2. **Wait longer** - Azure AD changes can take up to 5 minutes to propagate
3. **Check tenant restrictions** - Some organizations have policies that restrict Native app flows
4. **Verify Client ID** - Ensure you're using the correct Client ID in your `.env` file
5. **Check redirect URI** - Must match exactly: `http://127.0.0.1:5000/microsoft-callback` (case-sensitive, no trailing slash)

## Alternative: Use Separate App Registrations

If you need different configurations for web vs desktop:
- Create **two separate app registrations**:
  - One for Web (with client secret)
  - One for Native/Desktop (without secret, PKCE only)
- Use different Client IDs in your environment variables based on the platform

