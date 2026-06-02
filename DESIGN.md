# SiteWeave — Design System

## Color strategy

**Restrained product UI:** tinted neutrals + brand primary `#3B82F6` (org override via branding). Status colors: done `#00C875` / `#10B981`, working `#FDAB3D`, stuck `#E2445C`.

## Typography

- System fonts (SF Pro / Segoe UI stack on web; system on mobile)
- Body max ~65ch where prose blocks appear
- Hierarchy via weight + scale, not decorative serif

## Spacing

4px grid. Mobile field targets: minimum 44×44pt (48pt preferred for primary actions).

## Motion

- UI interactions ≤300ms, ease-out (`cubic-bezier(0.23, 1, 0.32, 1)`)
- High-frequency actions (task complete, tab switch): haptic or color snap only, no bounce
- Rare wins (issue resolved, milestone): brief success feedback allowed
- Honor `prefers-reduced-motion` / iOS Reduce Motion

## Components

- **Web/desktop:** `app-card`, `app-action-primary`, sidebar shell
- **Mobile:** `theme.js` tokens, `components/ui/*`, floating tab bar, custom bottom sheets with grabber

## Elevation

Cards use subtle border + soft shadow; avoid nested cards. Side accent stripes on task cards are intentional (status/brand), not generic decoration.
