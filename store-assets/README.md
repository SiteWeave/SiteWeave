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

## Windows installer icon

- `icon.png` — used for NSIS `.exe` and Electron app icon
