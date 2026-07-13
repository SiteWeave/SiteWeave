# SiteWeave mobile redesign spec (monday-led)

Primary reference: **monday.com** mobile patterns. Field UX: **48pt** minimum touch targets.

## Navigation

Curved bottom tab bar with icon + label:

| Slot | Tab | Route |
|------|-----|-------|
| 1 | Home | `index` |
| 2 | Projects | `projects` |
| 3 | **+** Create (raised FAB, managers) | action sheet |
| 4 | Inbox | `notifications` (badge) |
| 5 | More | `more` |

- **Calendar** — linked from More screen (`href: null` in tab navigator)
- **Create menu** — Report issue · Site day · New project (gated by role)
- Layout spacing via `utils/layoutInsets.js`

## Core field features

1. **Notifications** — Inbox tab with badge; post-auth permission screen; deep links unchanged
2. **Task %** — `ProgressEditor`: slider + numeric input + ±1 (any 0–100); no preset chips
3. **Photos** — Camera icon on `TaskCard`; `PhotoAttachSheet` for camera/library
4. **Weather** — `WeatherCard` on Home; `WeatherShiftSheet` logs `weather_impacts`

## Components (`components/ui/`)

`BottomSheet`, `Button`, `Card`, `Text`, `ProgressEditor`, `ProgressBar`, `ProgressPill`, `WeatherCard`, `FloatingTabBar`, `CurvedTabBarBackground`, `NotificationBadge`, `Screen`

## Out of scope (v1)

Gantt edit, custom fields builder, full desktop weather schedule apply, org admin.
