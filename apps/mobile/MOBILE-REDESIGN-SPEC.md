# SiteWeave mobile redesign spec (monday-led)

Primary reference: **monday.com** mobile patterns. Field UX: **48pt** minimum touch targets.

## Navigation

- Floating pill tab bar: Home · Calendar · Inbox · More
- Side circles: Search → Projects list, Folder → Projects list
- Projects detail via Home recents or projects stack (`href: null` in tabs)

## Core field features

1. **Notifications** — Inbox tab with badge; post-auth permission screen; deep links unchanged
2. **Task %** — `ProgressEditor`: slider + numeric input + ±1 (any 0–100); no preset chips
3. **Photos** — Camera icon on `TaskCard`; `PhotoAttachSheet` for camera/library
4. **Weather** — `WeatherCard` on Home; `WeatherShiftSheet` logs `weather_impacts`

## Components (`components/ui/`)

`BottomSheet`, `Button`, `Card`, `Text`, `ProgressEditor`, `ProgressBar`, `ProgressPill`, `WeatherCard`, `FloatingTabBar`

## Out of scope (v1)

Gantt edit, custom fields builder, full desktop weather schedule apply, org admin.
