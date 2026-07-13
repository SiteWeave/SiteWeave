# Mobile app updates (OTA + store)

SiteWeave mobile uses a **hybrid update system**:

- **OTA (EAS Update):** JavaScript and asset changes ship without App Store review. The app launches instantly on the current bundle, downloads updates in the background, and applies them on the **next cold start**.
- **Store (native):** When a new native build is required, users are prompted to update via the App Store or Google Play. Required updates block the app until the user opens the store.

## One-time setup (already in codebase)

1. `expo-updates` and `expo-application` are installed.
2. [`app.config.js`](./app.config.js) configures `runtimeVersion`, EAS Update URL, and `fallbackToCacheTimeout: 0`.
3. [`eas.json`](./eas.json) assigns update channels: `production`, `preview`, `development`.
4. Supabase table `mobile_release_config` stores native version thresholds (migration `20260617160000_mobile_release_config.sql`).

**You must ship one new store build** after enabling `expo-updates` before OTA works in production:

```powershell
cd apps/mobile
eas build --profile production --platform all
eas submit --profile production --platform all
```

Apply the Supabase migration before relying on store-version checks:

```powershell
# From repo root, using your usual Supabase workflow
supabase db push
```

## Day-to-day: JS-only changes (OTA)

After the OTA-enabled build is live:

```powershell
cd apps/mobile
eas update --channel production --message "Fix task photo upload label"
```

Users on the `production` channel will:

1. Open the app immediately (no wait).
2. See a banner while the update downloads (optional “Restart now”).
3. Get the new bundle automatically on the next app restart.

### Preview / internal testing

```powershell
eas build --profile preview --platform android
eas update --channel preview --message "Test OTA banner"
```

Install a preview build, publish to `preview`, force-close and reopen twice to verify.

## Native releases (store)

When you change native code, permissions, Expo SDK, or bump `version` in `app.config.js`:

1. Bump `version` in [`app.config.js`](./app.config.js) and [`package.json`](./package.json).
2. Build and submit:

   ```powershell
   eas build --profile production --platform all
   eas submit --profile production --platform all
   ```

3. Update Supabase `mobile_release_config`:

   | Column | Purpose |
   |--------|---------|
   | `latest_native_version` | Soft prompt for users below this version |
   | `min_native_version` | Hard block — app shows required-update modal |
   | `force_update` | When `true`, users below `latest_native_version` are blocked |

   Example after shipping `1.0.4`:

   ```sql
   UPDATE mobile_release_config
   SET
     latest_native_version = '1.0.4',
     min_native_version = '1.0.3',
     updated_at = now()
   WHERE id = 'default';
   ```

## How it behaves in the app

| Scenario | UX |
|----------|-----|
| OTA downloading | Top banner: “Downloading update…” |
| OTA ready | Banner: “Update ready — applies next time you open SiteWeave” + optional “Restart now” |
| Soft store update | Dismissible banner with link to store |
| Required store update | Blocking modal — only action is “Update” (opens store) |
| Dev / Expo Go | Update logic disabled |

Version and OTA status appear on **More → Settings**.

## Troubleshooting

- **OTA not applying:** Confirm the installed build’s EAS channel matches `eas update --channel`. Confirm `runtimeVersion` (app version) matches between build and update.
- **No banner in dev:** Expected — `expo-updates` is disabled in `__DEV__` and Expo Go.
- **Store prompt not showing:** Run the migration; verify `mobile_release_config` row exists and version strings are semver (e.g. `1.0.3`).
