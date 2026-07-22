# Netlify Deployment Guide - Quick Reference

## Critical Configuration Steps

### 1. Environment Variables in Netlify

**IMPORTANT:** You MUST set these in Netlify's dashboard:

1. Go to your site in Netlify dashboard
2. Navigate to **Site settings** → **Environment variables**
3. Add these variables:
   - `VITE_SUPABASE_URL` = `https://tchqmlyiwsqxwopvyxjx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `YOUR_SUPABASE_ANON_KEY`

### 2. Netlify Build Settings

The `netlify.toml` file in the root directory should automatically configure:
- **Base directory:** `apps/web`
- **Build command:** `npm install && npm run build`
- **Publish directory:** `dist`

**Verify in Netlify UI:**
- Go to **Site settings** → **Build & deploy** → **Build settings**
- Ensure **Base directory** is set to: `apps/web`
- If it's not, set it manually

### 3. Common Issues

#### Issue: "Missing Supabase environment variables" error
**Solution:** Environment variables are not set in Netlify. Add them in Site settings → Environment variables.

#### Issue: Build fails with "Cannot find module"
**Solution:** Make sure **Base directory** is set to `apps/web` in Netlify build settings.

#### Issue: 404 errors on page refresh
**Solution:** The `_redirects` file should be copied to `dist/` during build. Verify it exists in the built output.

#### Issue: Routes not working
**Solution:** Check that `public/_redirects` contains:
```
/*    /index.html    200
```

### 4. After Deployment

1. **Update Supabase OAuth Redirect URLs:**
   - Go to Supabase Dashboard → Authentication → URL Configuration
   - Add your Netlify URL to Redirect URLs:
     - `https://your-site.netlify.app`
     - `https://your-site.netlify.app/**`

2. **Test the deployment:**
   - Visit your Netlify URL
   - Test login functionality
   - Test navigation between routes
   - Verify all pages load correctly

### 5. Verify Build Output

After a successful build, check that:
- `dist/index.html` exists
- `dist/_redirects` exists (copied from `public/_redirects`)
- `dist/assets/` contains JS and CSS files

If `_redirects` is missing, the build process might not be copying it. Check Vite configuration.

