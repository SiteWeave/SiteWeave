# SiteWeave full feature test plan (customer personas)

Customer-realistic QA only. No red-team / adversarial security testing.

**Pass / Fail:** mark each step `[ ] Pass` or `[ ] Fail` and note anything odd.

---

## Scripts (run in this order)


| Order | File                                                                                  | Purpose                                           |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1     | `[scripts/qa-seed-personas.sql](../scripts/qa-seed-personas.sql)`                     | Auth users, orgs, golden project, crew roles      |
| 2     | `[scripts/seed-tester-with-fake-data.sql](../scripts/seed-tester-with-fake-data.sql)` | Optional bulk fake content (point at admin email) |
| 3     | `[scripts/qa-accelerate-time-gated.sql](../scripts/qa-accelerate-time-gated.sql)`     | Skip waiting for review / trial / smart notifs    |
| 4     | `[scripts/qa-invoke-cron-jobs.md](../scripts/qa-invoke-cron-jobs.md)`                 | Curl after accelerate blocks                      |
| 5     | `[scripts/qa-verify-time-gated.sql](../scripts/qa-verify-time-gated.sql)`             | Read-only checks                                  |


Default password for **newly created** fake users: `QaTest123!`

---



## Company access vs project role (read this once)


| UI field                 | Meaning                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| **Company access**       | Real app permissions (`profiles.role_id`). Org Admin / Project Manager / Member.             |
| **Role on this project** | Crew label on *this* job only (`project_contacts.role`: PM / Team / Subcontractor / Client). |


The project dropdown does **not** demote company permissions. Helper text in the product: *“Permissions come from company access. This only labels their job on this project.”*

For **external email invites** (not already in the company), that project role maps to guest access (`viewer` / `editor` / `admin`). That path *does* affect what a guest can do.

Expected crew labels after seed on **QA Golden Project**:


| Person             | Company access  | Project role                |
| ------------------ | --------------- | --------------------------- |
| QA Admin           | Org Admin       | PM (Owner badge if creator) |
| QA Project Manager | Project Manager | PM                          |
| QA Member          | Member          | Team                        |
| QA Guest           | (none / guest)  | Subcontractor               |




### Already seeded with wrong project roles?

Edit emails, then run:

```sql
UPDATE public.project_contacts pc
SET role = v.role
FROM (
  SELECT p.id AS project_id, c.id AS contact_id, x.role
  FROM public.projects p
  JOIN public.contacts c ON c.organization_id = p.organization_id
  JOIN (VALUES
    ('you@example.com', 'PM'),
    ('qa-pm@siteweave.test', 'PM'),
    ('qa-member@siteweave.test', 'Team'),
    ('qa-guest@siteweave.test', 'Subcontractor')
  ) AS x(email, role) ON lower(c.email) = lower(x.email)
  WHERE p.name = 'QA Golden Project' AND p.trashed_at IS NULL
) v
WHERE pc.project_id = v.project_id AND pc.contact_id = v.contact_id;
```

---



## Day 0 — Setup



### 0.1 Staging SQL

1. Open Supabase → your **staging** project → SQL Editor.
  - [x] Pass · [ ] Fail · Notes: ________
2. Open `scripts/qa-seed-personas.sql`. Set `v_admin_email` to your **real inbox**.
  - [x] Pass · [ ] Fail · Notes: ________
3. Run the script. Confirm NOTICE lines list Admin, PM, Member, Guest, Personal, Pending, Org B, Managed, golden project id.
  - [x] Pass · [ ] Fail · Notes: ________
4. Copy the pending invite token from NOTICE (or query `invitations`).
  - Token: ***745f9e3886d12a096e22a2c6f9fb0128***__  
  - [x] Pass · [ ] Fail · Notes: ________
5. Open `scripts/qa-accelerate-time-gated.sql`. Set `v_admin_email`, `v_personal_email`, `v_assignee_email` (assignee = your real inbox). Leave all `run_block_*` = `false`.
  - [x] Pass · [ ] Fail · Notes: ________



### 0.2 Confirm crew labels in UI

1. Log in to staging **web** as Admin.
  - [x] Pass · [ ] Fail · Notes: ________
2. Open **QA Golden Project** → Manage project crew / Share.
  - [x] Pass · [ ] Fail · Notes: ________
3. Confirm Company access + project roles match the table above.
  - [x] Pass · [ ] Fail · Notes: ________
4. Change **QA Project Manager** project role from PM → Team → save.
  - Expected: Company access still **Project Manager**.  
  - [x] Pass · [ ] Fail · Notes: ________
5. Set project role back to **PM**.
  - [x] Pass · [ ] Fail · Notes: ________

---



## Day 1 — Smoke + Admin golden path



### 1A Web smoke (Admin)

1. Open staging web URL → log in as Admin.
  - [x] Pass · [ ] Fail · Notes: ________
2. Dashboard loads (projects / My Day visible).
  - [x] Pass · [ ] Fail · Notes: ________
3. Open **Projects** → open **QA Golden Project**.
  - [x] Pass · [ ] Fail · Notes: ________
4. Open tab **Tasks** — loads.
  - [x] Pass · [ ] Fail · Notes: ________
5. Open tab **Gantt** — loads.
  - [x] Pass · [ ] Fail · Notes: ________
6. Open tab **Field issues** — loads.
  - [x] Pass · [ ] Fail · Notes: ________
7. Open tab **Activity** — loads. FAIL
  - [ ] Pass · [ ] Fail · Notes: ________
8. Open tab **Stream** — loads.
  - [x] Pass · [ ] Fail · Notes: ________
9. Open **Calendar** — loads.
  - [x] Pass · [ ] Fail · Notes: ________
10. Open **Trade Partners** (or Team hub) — loads.
  - [x] Pass · [ ] Fail · Notes: ________
11. Open **Organization** — loads.
  - [x] Pass · [ ] Fail · Notes: ________
12. Open **Settings** — loads.
  - [x] Pass · [ ] Fail · Notes: ________
13. Sign out → login screen.
  - [x] Pass · [ ] Fail · Notes: ________



### 1B Mobile smoke (Admin)

1. Open mobile app (staging) → log in as Admin.
  - [x] Pass · [ ] Fail · Notes: ________
2. **Home** loads.
  - [x] Pass · [ ] Fail · Notes: ________
3. **Projects** tab → open golden project.
  - [x] Pass · [ ] Fail · Notes: ________
4. **Calendar** tab opens.
  - [x] Pass · [ ] Fail · Notes: ________
5. **Notifications** tab opens.
  - [x] Pass · [ ] Fail · Notes: ________
6. **More** tab opens.
  - [x] Pass · [ ] Fail · Notes: ________



### 1C Admin product walk (web)

1. Create project named `QA Scratch` → appears in directory.
  - [x] Pass · [ ] Fail · Notes: ________
2. Edit golden project address → saves and shows new value.
  - [x] Pass · [ ] Fail · Notes: ________
3. Create task on golden project → appears in Tasks.
  - [x] Pass · [ ] Fail · Notes: ________
4. Assign that task to **QA Member** contact → assignee shown.
  - [x] Pass · [ ] Fail · Notes: ________
5. Complete a task → shows completed.
  - [x] Pass · [ ] Fail · Notes: ________
6. Add a task photo → preview/thumbnail works.
  - [x] Pass · [ ] Fail · Notes: ________
7. Create a field issue → appears under Field issues. assign does not work so fail
  - [ ] Pass · [ ] Fail · Notes: ________
8. Post to project stream → post visible.
  - [x] Pass · [ ] Fail · Notes: ________
9. Create a calendar event → visible on Calendar.
  - [x] Pass · [ ] Fail · Notes: ________
10. Generate a progress report → preview works; optionally send to your inbox.
  - [x] Pass · [ ] Fail · Notes: ________
11. Soft-delete `QA Scratch` → in Trash → Restore → back in list.
  - [x] Pass · [ ] Fail · Notes: ________
12. Settings → switch language EN → ES → UI updates → switch back to EN.   Fail, some thigns don't change
  - [ ] Pass · [ ] Fail · Notes: ________
13. Settings → toggle a notification preference → saves.
  - [x] Pass · [ ] Fail · Notes: ________



### 1D Admin product walk (mobile — critical subset)

1. Create or complete a task on golden project. fail
  - [ ] Pass · [ ] Fail · Notes: ________
2. Create field issue with a photo. fail
  - [ ] Pass · [ ] Fail · Notes: ________
3. Post to stream / daily log.
  - [x] Pass · [ ] Fail · Notes: ________
4. Add or view a calendar item.
  - [x] Pass · [ ] Fail · Notes: ________

---



## Day 2 — Personas

Log out between each persona.

### 2A Project Manager (`qa-pm@siteweave.test`)

1. Log in on web.
  - [x] Pass · [ ] Fail · Notes: ________
2. Open QA Golden Project → can view tasks.
  - [x] Pass · [ ] Fail · Notes: ________
3. Create a new task → succeeds.
  - [x] Pass · [ ] Fail · Notes: ________
4. Open Manage crew / invite UI → can open.
  - [x] Pass · [ ] Fail · Notes: ________
5. Create a new project → succeeds.
  - [x] Pass · [ ] Fail · Notes: ________
6. Try org Team / Roles admin (create custom role or manage members as admin).
  - Expected: blocked or controls not available.  
  - [x] Pass · [ ] Fail · Notes: ________
7. Sign out.
  - [x] Pass · [ ] Fail · Notes: ________



### 2B Member (`qa-member@siteweave.test`)

1. Log in on web.
  - [x] Pass · [ ] Fail · Notes: ________
2. Open assigned task → can edit / complete.
  - [x] Pass · [ ] Fail · Notes: ________
3. Post a stream message → succeeds.
  - [x] Pass · [ ] Fail · Notes: ________
4. Try create a new project.
  - Expected: blocked / no create control.  
  - [x] Pass · [ ] Fail · Notes: ________
5. Try manage team / roles.  fail
  - Expected: blocked / hidden.  
  - [ ] Pass · [ ] Fail · Notes: ________
6. Sign out.
  - [x] Pass · [ ] Fail · Notes: ________



### 2C Guest (`qa-guest@siteweave.test`)

1. Log in on web.
  - [x] Pass · [ ] Fail · Notes: ________
2. Sees golden project (guest framing OK).
  - [x] Pass · [ ] Fail · Notes: ________
3. Does **not** see full Organization / company team admin. fail
  - [ ] Pass · [ ] Fail · Notes: ________
4. Can open assigned guest task and update it as allowed.
  - [x] Pass · [ ] Fail · Notes: ________
5. Sign out.
  - [x] Pass · [ ] Fail · Notes: ________



### 2D Org B Admin (`qa-orgb@siteweave.test`)

1. Log in.
  - [x] Pass · [ ] Fail · Notes: ________
2. Sees **QA Org B Only Project**.
  - [x] Pass · [ ] Fail · Notes: ________
3. Does **not** see **QA Golden Project** in the project list.
  - [x] Pass · [ ] Fail · Notes: ________
4. Sign out.
  - [x] Pass · [ ] Fail · Notes: ________



### 2E Personal owner (`qa-personal@siteweave.test`)

1. Log in → personal workspace (trial banner OK if shown).
  - [x] Pass · [ ] Fail · Notes: ________
2. If seeded as collaborator on golden: can open golden project as guest/viewer.
  - [x] Pass · [ ] Fail · Notes: ________
3. Sign out.
  - [x] Pass · [ ] Fail · Notes: ________



### 2F Pending invite + managed user

1. As Admin → Organization / Team → pending invite for `qa- pending@siteweave.test` is listed.  fail
  - [ ] Pass · [ ] Fail · Notes: ________
2. Open `/invite/<token>` (token from Day 0) in incognito → accept / signup flow works.
  - [ ] Pass · [ ] Fail · Notes: ________
3. Log in as `qa-managed@siteweave.local` / `QaTest123!`.
  - Expected: must change password before using the app.  
  - [x] Pass · [ ] Fail · Notes: ________



### 2G No-login guest links

1. As Admin, from the product create/copy a **guest task share** link. fail
  - [ ] Pass · [ ] Fail · Notes: ________
2. Open link in incognito (logged out) → page works. fail
  - [ ] Pass · [ ] Fail · Notes: ________
3. Create/copy **punch-list / closeout** guest link.
  - [x] Pass · [ ] Fail · Notes: ________
4. Open in incognito → review / sign-off UI works as designed.
  - [x] Pass · [ ] Fail · Notes: ________



### 2H Realistic mishaps

1. Open an **expired** invite link (set `expires_at` in past in SQL, or use old token).
  - Expected: clear expired/error message.  
  - [x] Pass · [ ] Fail · Notes: ________
2. Start Google/Apple/Microsoft sign-in → cancel mid-flow → can return to login.
  - [x] Pass · [ ] Fail · Notes: ________
3. While logged in as Member, open a project-invite link meant for Guest.
  - Expected: sensible reject or account-switch messaging (not silent wrong attach).  
  - [x] Pass · [ ] Fail · Notes: ________

---



## Day 3 — Time-gated, notifications, mobile field



### 3A Smart notifications

1. In `qa-accelerate-time-gated.sql`: set `run_block_b := true` only; run script.
  - [x] Pass · [ ] Fail · Notes: ________
2. Curl `process-task-notifications` (`[qa-invoke-cron-jobs.md](../scripts/qa-invoke-cron-jobs.md)`).
  - [x] Pass · [ ] Fail · Notes: ________
3. Check your real inbox / Resend for task-start reminder.
  - [x] Pass · [ ] Fail · Notes: ________
4. Run `qa-verify-time-gated.sql` history section — today’s rows present.
  - [ ] Pass · [ ] Fail · Notes: ________



### 3B Trial emails (personal)

1. Enable `run_block_c` only → run accelerate → curl `process-trial-reminders`.
  - Expected: mid-trial email.  
  - [ ] Pass · [ ] Fail · Notes: ________
2. Enable `run_block_d` only → run → curl again.
  - Expected: final trial email.  
  - [ ] Pass · [ ] Fail · Notes: ________
3. Do **not** enable C and D in the same SQL run.
  - [ ] Pass · [ ] Fail · Notes: ________



### 3C Review prompt (mobile)

1. Enable `run_block_a` → run accelerate.
  - [x] Pass · [ ] Fail · Notes: ________
2. Mobile as Admin (or personal): complete a normal success (task complete / sync).
  - Expected: soft review prompt.  
  - [x] Pass · [ ] Fail · Notes: ________
3. Dismiss or leave review → does not keep reappearing.
  - [x] Pass · [ ] Fail · Notes: ________
4. As Guest: no review prompt.
  - [x] Pass · [ ] Fail · Notes: ________



### 3D Personal project limit

1. Enable `run_block_f` → run.
  - [ ] Pass · [ ] Fail · Notes: ________
2. Log in as personal owner → try create project.
  - Expected: upgrade / limit UI.  
  - [ ] Pass · [ ] Fail · Notes: ________



### 3E Mobile field day (offline)

1. As Member on phone: enable airplane mode.
  - [ ] Pass · [ ] Fail · Notes: ________
2. Complete a task offline.
  - [ ] Pass · [ ] Fail · Notes: ________
3. Create field issue + photo offline.
  - [ ] Pass · [ ] Fail · Notes: ________
4. Turn network back on → Sync banner / More → flush.
  - [ ] Pass · [ ] Fail · Notes: ________
5. On web as Admin: see those updates on the project.
  - [ ] Pass · [ ] Fail · Notes: ________
6. Sign out Member; sign in Admin on same phone → see Admin’s workspace (not Member’s leftover as if it were Admin’s).
  - [ ] Pass · [ ] Fail · Notes: ________



### 3F Notifications & calendar (happy path)

1. As Admin, assign a task with email notify on → email arrives.
  - [ ] Pass · [ ] Fail · Notes: ________
2. Connect Google or Outlook calendar the normal customer way (if you use it) → events sync or import works.
  - [ ] Pass · [ ] Fail · Notes: ________ · [ ] N/A
3. Mobile: allow notifications → Notifications tab shows items → tap opens related project.
  - [ ] Pass · [ ] Fail · Notes: ________



### 3G Optional wrap

1. Electron (only if shipping desktop): login + open a normal https link.
  - [ ] Pass · [ ] Fail · Notes: ________ · [ ] N/A
2. Account delete: only on a **throwaway** account — never demo.
  - [ ] Pass · [ ] Fail · Notes: ________ · [ ] Skipped



### 3H Scheduled progress report (optional)

1. Enable `run_block_g` → run accelerate.
  - [ ] Pass · [ ] Fail · Notes: ________
2. Curl `process-scheduled-reports`.
  - [ ] Pass · [ ] Fail · Notes: ________
3. Check inbox / Resend for report.
  - [ ] Pass · [ ] Fail · Notes: ________

---



## Sign-off


| Area                      | Tester | Date | Result      |
| ------------------------- | ------ | ---- | ----------- |
| Day 0 setup               |        |      | Pass / Fail |
| Day 1 Admin               |        |      | Pass / Fail |
| Day 2 personas            |        |      | Pass / Fail |
| Day 3 time-gated / mobile |        |      | Pass / Fail |


**Blockers / bugs filed:** ________

---



## Out of scope

Unauthenticated cron calls, wrong tokens, concurrency races, rate-limit hammering, storage path spoofing, full accessibility audits, large-data performance gates.