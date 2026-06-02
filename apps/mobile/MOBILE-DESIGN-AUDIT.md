# Mobile design audit (MCP-backed)

Validated against **Apple Human Interface Guidelines** via Sosumi MCP (May 2026).

## Applied HIG rules

| HIG topic | Requirement | SiteWeave implementation |
|-----------|-------------|---------------------------|
| [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | Hit region ≥ **44×44 pt** (field: **48**) | `touch.minSize`, `touch.minRowHeight`, tab icons 48pt |
| Buttons | Press state / feedback | `PressableWithFade` opacity + haptics |
| Buttons | One primary CTA per view | Single primary `Button` on auth sheets |
| [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets) | Cancel leading, Done trailing | `BottomSheet`: ✕ left, Save right |
| Sheets | Grabber + swipe dismiss | Top handle on `BottomSheet`; Modal `onRequestClose` |
| Sheets | Don't stack sheets | One sheet visible per flow |
| Tab bar | Clear selection state | Active tab `primaryLight` circle + `accessibilityState.selected` |
| Accessibility | Labels on controls | `accessibilityRole` + `accessibilityLabel` on tabs, buttons, % pill |

## monday.com alignment (product)

- Off-white `#F5F6F8` background, 24px cards, floating pill nav
- Lavender secondary buttons (`secondaryButton`)
- Task cards with metadata row + bottom sheet editors

## Follow-ups (optional)

- VoiceOver pass on device for task list + progress slider
- `prefersGrabberVisible` equivalent already visual; consider `@gorhom/bottom-sheet` for native detents later
- Reduce prominence of home KPI carousel if it competes with primary CTA (HIG: limit prominent buttons)
