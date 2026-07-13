# Field Issues Closeout (Punch List) — Revised Plan

## Counsel decision: same tab, not a new one

**Do not add a Punch List tab.** Evolve the existing **Field Issues** surface in place.

Current navigation is already tight:
- **Mobile project tabs:** Tasks | Stream (mgr) | Field Issues | Reports (mgr)
- **Web project tabs:** Tasks | Gantt | Updates (Stream | Field Issues) | Activity

A separate Punch List tab would crowd the project screen and split one real-world workflow into two places. Field Issues and punch lists are the same job-site deficiency tracker at different moments — mid-build vs closeout — not two different products.

---

## Tab naming decision: rename to "Issues & Punch List"

**Rename the existing Field Issues tab to "Issues & Punch List"** on both web and mobile. This is the only naming option that makes the punch-list capability self-evident from navigation, directly addressing the discoverability risk (feature built but unused).

- Rejected **"Punch List"** (full rename): wrong for daily mid-build use — a week-3 safety hazard is not a punch item.
- Rejected keeping **"Field Issues"**: zero discoverability signal.

Implementation notes:
- Update i18n keys, not just strings. Current keys: `mobile.project_field_issues_tab` / `mobile.project_field_issues_tab_full` (see [`[id].js`](apps/mobile/app/(tabs)/projects/[id].js) lines ~690-693) and web tab label in [`ProjectDetailsView.jsx`](apps/web/src/views/ProjectDetailsView.jsx). Add EN/ES translations for the new label.
- Mobile tabs scroll horizontally, so the longer label is acceptable; keep an abbreviated `label` ("Punch List") with full `accessibilityLabel` ("Issues & Punch List") if width becomes tight.
- Keep route segments (`/projects/:id/field-issues`) unchanged to avoid breaking deep links — only the display label changes.

## Recommended approach: one tab, progressive closeout features

Add punch-list capabilities as **enhancements inside the existing panel**, revealed when useful. The rename signals the feature exists; the in-panel discovery mechanisms below make sure users find it at the right moment (do not rely on the tab name alone).

```mermaid
flowchart TB
  subgraph sameTab [Field Issues Tab - unchanged nav]
    Filters[Open / Closed / All]
    ViewToggle[List view | By location]
    Capture[Report issue OR Quick walkthrough]
    Actions[Share for review | Export PDF]
  end
  subgraph data [Same data model]
    Issues[project_issues extended]
  end
  Capture --> Issues
  Filters --> Issues
  ViewToggle --> Issues
  Actions --> Issues
```

### What stays the same (no crowding)
- Same tab on mobile and web Updates panel
- Same open/closed filters
- Same create flow for a normal field issue (title, priority, assignee, photo)
- Same notifications (`field_issue_created`, `field_issue_assigned`)

### What gets added (only when relevant)
| Addition | Where it lives | When it appears |
|---|---|---|
| **Location field** | Issue create/edit sheet | Optional always; prominent in walkthrough mode |
| **Before / after photos** | Issue detail | Before on create (walkthrough); after on close |
| **By location grouping** | Subtle view toggle in panel header | When any issue has a location |
| **Quick walkthrough** | Secondary CTA (camera icon) | Always available; optimized capture flow |
| **Client review link** | Overflow / action menu | When open issues exist |
| **Branded punch list PDF** | Same menu | Business tier; grouped by location |

Progressive disclosure keeps daily use simple. Closeout power features appear in one menu, not as new navigation.

### Discoverability mechanisms (all included)

To ensure the punch-list feature is not missed, the plan includes ALL of the following:

1. **Closeout hint banner** — when a project nears completion (high task-completion %, or has closed tasks), show a dismissible banner in the panel: "Ready to close out? Start a punch walkthrough." Contextual, appears only when relevant.
2. **Visible "Walkthrough" button** — a distinct camera-first CTA next to "Report issue," so the closeout flow is seen, not hidden in a mode.
3. **"By location" view toggle** — appears once any issue has a `location`, organically signaling punch-list organization.
4. **One-time tooltip/badge** — first time closeout features unlock for a user, show a brief coach mark on the Walkthrough button / tab, then never again (persist a flag, e.g. via `user_preferences` or local onboarding state like [`onboarding.js`](apps/mobile/utils/onboarding.js)).

---

## Data model: extend `project_issues`, no new tables

Add columns to existing [`project_issues`](schema.sql) via migration:

- `location TEXT` — e.g. "Master Bath", "Kitchen", "Unit 2B"
- `before_photo_path TEXT` — storage ref (nullable)
- `after_photo_path TEXT` — storage ref (nullable)
- `signed_off_at TIMESTAMPTZ` — set when client completes review (project-level sign-off stored on project or a lightweight `project_closeout_signoffs` row — prefer **project columns** to avoid extra table: `punch_list_signed_off_at`, `punch_list_signed_off_by_name`, `punch_list_signature JSONB`)

Guest review token: reuse pattern from [`guestTaskShareService.js`](packages/core-logic/src/services/guestTaskShareService.js) — one token per project closeout review, not per issue.

**Cut from original plan:** `punch_lists`, `punch_list_items`, `punch_list_review_tokens` as separate entities.

---

## Service layer: extend `issuesService`, not a parallel service

Extend [`packages/core-logic/src/services/issuesService.js`](packages/core-logic/src/services/issuesService.js):

- `fetchProjectIssuesGroupedByLocation(projectId)` — for location view
- `createWalkthroughIssue({ location, description, beforePhoto, assignee })` — thin wrapper over create
- `uploadIssueAfterPhoto(issueId, photo)` — on close
- `createProjectCloseoutReviewLink(projectId)` — guest token
- `signOffProjectCloseout({ projectId, signerName, signature })` — client sign-off

Export PDF via new edge function `export-field-issues-pdf` (or `export-punch-list-pdf`) that reads open/closed issues grouped by location + org branding — same pattern as [`export-progress-report-pdf`](supabase/functions/export-progress-report-pdf/index.ts).

---

## UI changes (minimal surface area)

### Mobile — [`FieldIssuesPanel.jsx`](apps/mobile/components/FieldIssuesPanel.jsx) + [`FieldIssueSheet.jsx`](apps/mobile/components/FieldIssueSheet.jsx)
- Add **List | Location** segmented control (only visible when locations exist, or always with Location showing flat list for unlocated items)
- Add **Walkthrough** button next to "Report issue" — opens sheet in camera-first mode (photo → location chip → short note → save & next)
- Add overflow menu: **Share for client review**, **Export PDF** (tier-gated)
- On close issue: prompt for after photo if before photo exists

### Web — [`FieldIssues.jsx`](apps/web/src/components/FieldIssues.jsx) + Updates panel in [`ProjectDetailsView.jsx`](apps/web/src/views/ProjectDetailsView.jsx)
- Same location grouping toggle
- Same closeout actions in panel toolbar
- New [`GuestCloseoutReviewView.jsx`](apps/web/src/views/GuestCloseoutReviewView.jsx) — public token route (mirror [`GuestTaskShareView.jsx`](apps/web/src/views/GuestTaskShareView.jsx))

**No new project tab. No new route segment beyond guest review page.**

---

## Monetization (unchanged logic)

- **Free:** create issues, location, photos, location view, walkthrough capture
- **Business / trial:** client review link + branded PDF export (`canExportProfessionalDocs`)
- Upgrade UX: reuse [`UpgradeRequiredModal.jsx`](apps/web/src/components/UpgradeRequiredModal.jsx)

Market externally as **"Punch list & closeout sign-off"** — sell the outcome. Inside the app, the tab is now **"Issues & Punch List"** so the capability is discoverable without adding navigation.

---

## Why this is better than a separate Punch List tab

| Concern | Separate tab | Evolve Field Issues |
|---|---|---|
| Navigation crowding | Adds 5th mobile tab | Zero new tabs |
| User confusion | "Issue vs punch item?" | One list, richer at closeout |
| Engineering scope | New tables + service + 2 UIs | Extend existing table + panel |
| Daily use | Empty tab most of the project | Same tab they already use |
| Killer feature | Still delivers sign-off + PDF | Same payoff, less UI tax |

---

## Implementation order

1. Migration: extend `project_issues` + project closeout sign-off columns
2. Extend `issuesService` with location grouping + walkthrough helpers
3. Rename tab to "Issues & Punch List" (i18n keys EN/ES, mobile + web) — keep route segments unchanged
4. Mobile: location view + walkthrough sheet + after-photo on close
5. Web: same panel enhancements
6. Discoverability: closeout hint banner + Walkthrough button + location toggle + one-time coach mark
7. Guest review link + sign-off edge function
8. Branded PDF export + tier gating
9. Notifications + i18n (EN/ES)

Estimated effort: **~1.5–2 sprints** (smaller than separate-module plan).

---

## Out of scope for v1

- Separate Punch List tab or route
- New `punch_lists` / `punch_list_items` tables
- Converting field issues ↔ punch items (they're the same entity)
- Org-wide punch dashboard
- Offline queue for walkthrough photos
