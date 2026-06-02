# Store / installer assets

Used by `electron-builder` (`buildResources: store-assets`).

## AppX tiles (Microsoft Store)

- **Sources:** `appx-sources/logo-300.png`, `logo-1080.png`
- **Generated tiles:** `appx/` (required filenames for Windows Start menu / Store package)

Regenerate after changing the logo:

```bash
npm run generate:appx-assets
```

Then rebuild the Store package:

```bash
npm run build:win:msix
```

## Windows / macOS installer icon

- `icon.png` — used for NSIS `.exe`, macOS `.dmg`/`.zip`, and Electron app icon
- Must be **at least 512×512** (electron-builder requirement); source from `appx-sources/logo-1080.png` (1024×1024)
