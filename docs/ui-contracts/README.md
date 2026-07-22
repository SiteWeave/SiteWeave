# SiteWeave UI contracts

SiteWeave keeps its own visual look. There is no HeroUI and no `@siteweave/web-ui`
adapter layer — consistency comes from shared semantic tokens in
`packages/design-tokens` (`@siteweave/design-tokens`, plus `/mobile` and `/css`
exports) and from formalizing SiteWeave's own components over time.

This doc records the behavioral contracts that specialized scheduling controls and
mobile domain widgets must preserve as those components evolve.

## Date range — web / Electron (`DateRangePicker`)

| Contract | Requirement |
|----------|-------------|
| API | `startValue`, `endValue` (YYYY-MM-DD or `''`); `onChange({ start, end })` |
| Interaction | First click = start; second = end; start-only allowed |
| Layout | Two months at `min-width: 768px`; one month when `compact`, `size="sm"`, or narrow |
| Clear | Footer clears to `{ start: '', end: '' }` and closes |
| Presets | Optional `presets` slot (Today / +1w / +2w at call sites) |
| Positioning | Portal to `document.body`; fixed position; clamp to viewport; flip above/below |
| Dates | Local calendar date only — no UTC midnight shifts |
| Variants | `compact`, `size` (`default` \| `sm`), `elevated` (z-index 60 vs 50) |
| Year window | Dropdown caption; `fromYear = year - 3`, `toYear = year + 12` |
| A11y | Trigger `aria-haspopup="dialog"`, `aria-expanded`; popover `role="dialog"` |

Call sites: ProjectModal, BuildPath/PhaseModal, TaskModal, TaskItem, EventModal, WeatherImpactModal.

## Date range — mobile (`DateRangeField`)

| Contract | Requirement |
|----------|-------------|
| Interaction | Tap start, then end; swap if end &lt; start |
| Layout | Single-month grid in bottom sheet (not two calendars) |
| Live updates | `onChange` while picking (no separate Apply) |
| Copy | `mobile.date_range_*` i18n keys |
| Branding | Range highlight uses theme primary / primaryLight |

## Generic web primitives (SiteWeave's own components)

Behaviors SiteWeave's own primitives should offer as they are formalized over time:

- Button: primary / secondary / ghost / danger; disabled; loading; press scale 0.96; focus ring
- Dialog: Escape / overlay close; focus trap / restore; portal; title + close
- TextField: label, description, error, invalid, disabled, required
- Toast: enter/exit; auto-dismiss; stacking; reduced motion
- Select/Combobox: keyboard nav, typeahead where applicable
- Tooltip: delay, escape, focus/hover triggers
- Skeleton: pulse with reduced-motion fallback

## Mobile kit (keep StyleSheet; harden)

- Touch: min 48×48; sheet CTA height 52
- States: default, pressed, focused, disabled, loading, invalid
- Motion: Reanimated preferred; honor Reduce Motion
- Branding: `theme.js` + `BrandingContext` runtime org primary
- Specialized (app-owned): BottomSheet, DateRangeField, DateField, TimeField, FloatingTabBar, pickers, ProgressEditor, WeatherCard, SyncStatusBanner
