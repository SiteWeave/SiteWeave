# SiteWeave mobile design contract

Reference for humans and agents working in `apps/mobile`. Web uses Tailwind in `apps/web`; mobile mirrors the same brand via `theme.js` and org branding from `@siteweave/core-logic`.

## Colors (defaults)

| Token | Hex | Use |
|-------|-----|-----|
| `primary` | `#3B82F6` | CTAs, active tab, links (overridden by org branding when loaded) |
| `primaryDark` | `#2563EB` | Pressed / emphasis |
| `secondary` | `#10B981` | Success accents (org secondary when set) |
| `background` | `#F5F6F8` | Screen background (monday off-white) |
| `surface` | `#FFFFFF` | Cards, modals |
| `text` | `#111827` | Headings, body |
| `textMuted` | `#6B7280` | Secondary labels |
| `textSubtle` | `#9CA3AF` | Placeholders |
| `border` | `#E5E7EB` | Dividers, inputs |
| `borderStrong` | `#D1D5DB` | Input borders |
| `error` | `#EF4444` | Errors, destructive emphasis |

Org-specific primary/secondary: `getOrganizationBranding()` in `packages/core-logic` — exposed in app via `useBranding()`.

## Spacing (4px grid)

`4, 8, 12, 16, 20, 24, 32, 40, 48` — prefer `theme.spacing.*` over magic numbers.

## Typography

| Style | Size / weight |
|-------|----------------|
| Screen title | 24–28, 700–800 |
| Section title | 18–20, 700 |
| Body | 15–16, 400–500 |
| Caption | 12–13, 500–600 |
| Button label | 17–18, 600–700 |

Use system fonts (SF Pro / Roboto). Support Dynamic Type where practical.

## Field touch targets

- `touch.minSize`: **48** · `touch.minRowHeight`: **56** · `touch.fabSize`: **56**
- New UI: `components/ui/*` — see `MOBILE-REDESIGN-SPEC.md`

## Layout chrome (safe area + tab bar)

Use [`utils/layoutInsets.js`](utils/layoutInsets.js) for all spacing that clears system UI or the bottom tab bar. Do not hardcode values like `bottom: 96` or `paddingBottom: 32`.

| Helper | Use |
|--------|-----|
| `contentTopInset(insets, extra?)` | Full-screen top padding below notch / status bar |
| `scrollBottomPadding(insets, extra?)` | `ScrollView` / `FlatList` bottom inset on tab screens |
| `fabBottomOffset(insets, extra?)` | Absolute `bottom` for screen-level FABs above the tab bar |
| `sheetBottomPadding(insets, extra?)` | Modal / bottom sheet shell padding above home indicator, plus breathing room |
| `sheetScrollEndPadding(insets, extra?)` | End padding for scroll content inside bottom sheets |
| `sheetListEndPadding(insets, extra?)` | End padding for static sheet action lists |
| `TAB_BAR_CLEARANCE` | Deprecated compatibility constant; tab bar is in normal document flow |

Rules:

- Tab screens: always `scrollBottomPadding` on scroll content.
- Stack / auth screens: prefer `paddingBottom: sheetBottomPadding(insets)` over raw `insets.bottom`.
- Tab bar sits above the home indicator via its `insets.bottom` padding plus a small breathing gap.
- Inactive nav labels use `colors.textMuted` (not `textSubtle`) for contrast.
- Prefer [`components/ui/Screen.jsx`](components/ui/Screen.jsx) on tab list screens to avoid drift.

## Screen patterns

| Area | Pattern |
|------|---------|
| **Auth** | Safe area padding; single primary button; OAuth rows with icons; errors via `Alert` + error haptic |
| **Home** | Org name subtitle; quick actions; sync-aware lists |
| **Projects** | `FlatList` + refresh; tap row → project detail |
| **Project detail** | Phases/tasks; modals for edit; haptics on save |
| **Calendar / issues** | Calendar via More screen; issues via Create menu |
| **Modals** | Bottom sheets with snap (`medium` → `large` on focus), sticky footer CTAs, grabber tap-to-dismiss; never pure `#000` shadows on `background` surfaces |

## Motion

- Press feedback: `PressableWithFade` with `scale(0.96)` on press; 150ms typical. Use `static` prop for high-frequency controls (tab bar, rapid list taps).
- Modals: prefer Reanimated; avoid animating every list item on mount.
- Tab bar: Expo Router `animation: 'shift'`; selection haptic on tab press.

## Done looks like

- [ ] Uses `theme` colors/spacing, not one-off hex (except legacy migration).
- [ ] 44×44 minimum touch targets on interactive controls.
- [ ] Safe areas respected on notched devices.
- [ ] Loading, empty, and error states on data screens.
- [ ] Haptics on primary submit/success/error paths.
- [ ] `testID` on tab screens and main modal actions for QA.

## Agent stack (reminder)

- Skills: `design-taste-frontend`, Impeccable, `emil-design-eng`, `make-interfaces-feel-better`, `react-native-mobile-skill`
- MCP: **Sosumi** (HIG), **Playwright** (web only), **GitHub** (PRs/issues)
