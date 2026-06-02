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

## Screen patterns

| Area | Pattern |
|------|---------|
| **Auth** | Safe area padding; single primary button; OAuth rows with icons; errors via `Alert` + error haptic |
| **Home** | Org name subtitle; quick actions; sync-aware lists |
| **Projects** | `FlatList` + refresh; tap row → project detail |
| **Project detail** | Phases/tasks; modals for edit; haptics on save |
| **Calendar / issues** | Hidden from tab bar but reachable; consistent header back |
| **Modals** | Slide or fade; clear primary/secondary actions; dismiss on success |

## Motion

- Press feedback: `PressableWithFade` or opacity scale; 150ms typical.
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

- Skills: `design-taste-frontend`, Impeccable, `emil-design-eng`, `react-native-mobile-skill`
- MCP: **Sosumi** (HIG), **Playwright** (web only), **GitHub** (PRs/issues)
