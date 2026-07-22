# Setting Up a New GitHub Repository for SiteWeave Web

## Step 1: Create New GitHub Repository

1. Go to https://github.com/new
2. Repository name: `siteweave-web` (or your preferred name)
3. Description: "SiteWeave Client Portal - Web Application"
4. Set to **Public** or **Private** (your choice)
5. **DO NOT** initialize with README, .gitignore, or license
6. Click **"Create repository"**

## Step 2: Remove Old Remote (if exists)

If the current repo is connected to your main SiteWeave repo, remove it:

```bash
cd apps/web
git remote remove origin
```

## Step 3: Add New Remote

Replace `YOUR_USERNAME` and `REPO_NAME` with your actual GitHub username and the repo name you created:

```bash
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
```

## Step 4: Stage and Commit All Files

```bash
# Add all files
git add .

# Commit
git commit -m "Initial commit: SiteWeave web app"

# Push to new repository
git branch -M main
git push -u origin main
```

## Step 5: Configure Netlify

1. Go to https://app.netlify.com
2. Click **"Add new site"** → **"Import an existing project"**
3. Choose **"Deploy with GitHub"**
4. Select your new `siteweave-web` repository
5. Netlify should auto-detect settings from `netlify.toml`
6. **IMPORTANT:** Add environment variables:
   - Go to **Site settings** → **Environment variables**
   - Add:
     - `VITE_SUPABASE_URL` = `https://tchqmlyiwsqxwopvyxjx.supabase.co`
     - `VITE_SUPABASE_ANON_KEY` = `YOUR_SUPABASE_ANON_KEY`
7. Click **"Deploy site"**

## Step 6: Update Supabase OAuth Redirect URLs

After deployment, update Supabase:
1. Go to Supabase Dashboard → Authentication → URL Configuration
2. Add your Netlify URL to Redirect URLs:
   - `https://your-site-name.netlify.app`
   - `https://your-site-name.netlify.app/**`

## Done!

Your web app is now in its own repository and deployed separately from the desktop app.

