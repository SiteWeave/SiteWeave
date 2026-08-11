/**
 * One-off: build a realistic SiteWeave-style progress report and email it via Resend.
 * Usage: node scripts/send-demo-progress-report.mjs
 * Reads RESEND_* from repo-root .env (never prints secrets).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, '.env'));

const TO = process.argv[2] || 'djpugst3r@gmail.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM =
  process.env.RESEND_FROM || 'SiteWeave Notifications <notifications@siteweave.org>';

if (!RESEND_API_KEY) {
  console.error('Missing RESEND_API_KEY in environment / .env');
  process.exit(1);
}

// Mock i18n so we can import the real email template module.
register(pathToFileURL(path.join(__dirname, 'demo-progress-report-loader.mjs')).href, pathToFileURL(import.meta.url));

const { generateStandardReportEmail } = await import(
  pathToFileURL(path.join(root, 'src/utils/progressReportEmailTemplates.js')).href
);

const reportData = {
  project_id: 'demo-riverside-b',
  project_name: 'Riverside Townhomes — Building B',
  organization_name: 'Summit Ridge Construction',
  project_status: 'In Progress',
  start_date: '2026-07-28',
  end_date: '2026-08-04',
  vitals: {
    tasks_completed_count: 47,
    open_tasks_count: 31,
    project_end_date: '2026-10-17',
    schedule_day_current: 86,
    schedule_day_total: 142,
    schedule_progress_pct: 61,
  },
  status_changes: [
    {
      old_status: 'In Progress',
      new_status: 'In Progress',
      note: 'Framing package closed out on floors 1–2; weather delay absorbed into overall finish date.',
      changed_by: 'Marcus Hale (PM)',
      changed_at: '2026-08-04',
    },
  ],
  completed_tasks: [
    {
      text: 'Complete exterior wall sheathing — floors 1 & 2',
      phase_name: 'Framing',
      assignee: 'Jordan Ellis',
      completed_at: '2026-07-29',
    },
    {
      text: 'Install house wrap and flash window openings (south & east elevations)',
      phase_name: 'Weatherproofing',
      assignee: 'Priya Nair',
      completed_at: '2026-07-30',
    },
    {
      text: 'Set remaining second-floor windows (Units B3–B6)',
      phase_name: 'Openings',
      assignee: 'Jordan Ellis',
      completed_at: '2026-07-31',
    },
    {
      text: 'Rough-in HVAC trunks — second floor corridor chase',
      phase_name: 'MEP Rough-In',
      assignee: 'Chris Delgado',
      completed_at: '2026-08-01',
    },
    {
      text: 'Pour and finish balcony slab toppings — Units B1 & B2',
      phase_name: 'Concrete',
      assignee: 'Alex Rivera',
      completed_at: '2026-08-04',
    },
    {
      text: 'Complete temporary weather seals at unfinished west openings',
      phase_name: 'Weatherproofing',
      assignee: 'Priya Nair',
      completed_at: '2026-08-04',
    },
  ],
  phase_progress: [
    { name: 'Site & Foundations', old_progress: 100, progress: 100 },
    { name: 'Framing', old_progress: 78, progress: 92 },
    { name: 'Weatherproofing / Openings', old_progress: 40, progress: 68 },
    { name: 'MEP Rough-In', old_progress: 18, progress: 34 },
    { name: 'Drywall & Interiors', old_progress: 0, progress: 0 },
    { name: 'Finishes & Closeout', old_progress: 0, progress: 0 },
  ],
  last_week_done: [
    { text: 'Closed framing punch on floors 1–2', phase_name: 'Framing' },
    { text: 'Installed house wrap on south and east elevations', phase_name: 'Weatherproofing' },
    { text: 'Set second-floor windows for Units B3–B6', phase_name: 'Openings' },
    { text: 'Started HVAC trunk rough-in on second floor', phase_name: 'MEP Rough-In' },
  ],
  this_week_plan: [
    { text: 'Complete north elevation house wrap and window flashing', phase_name: 'Weatherproofing', start_date: '2026-08-04' },
    { text: 'Continue electrical rough-in — Units B1–B3', phase_name: 'MEP Rough-In', start_date: '2026-08-05' },
    { text: 'Set remaining west elevation windows after weather clears', phase_name: 'Openings', start_date: '2026-08-06' },
    { text: 'Schedule plumbing stack inspection with city inspector', phase_name: 'MEP Rough-In', start_date: '2026-08-07' },
  ],
  next_week_plan: [
    { text: 'Begin drywall hang in Units B1–B2 corridors', phase_name: 'Drywall & Interiors', start_date: '2026-08-11' },
    { text: 'Complete electrical rough-in Units B4–B6', phase_name: 'MEP Rough-In', start_date: '2026-08-11' },
    { text: 'Install stair stringers and temporary treads — Building B core', phase_name: 'Framing', start_date: '2026-08-12' },
    { text: 'Roof underlayment and drip edge — Building B', phase_name: 'Weatherproofing', start_date: '2026-08-13' },
  ],
  weather_impacts: [
    {
      title: 'Heavy thunderstorms — site shut down (Tue–Wed)',
      project_name: 'Riverside Townhomes — Building B',
      days_lost: 2,
      schedule_shift_applied: true,
      description:
        'Lightning within 8 miles and sustained 1.4" rainfall forced a full crew stand-down Tue–Wed. Exterior sheathing and window setting paused; interior MEP continued where dry. Finish date pushed from Oct 15 to Oct 17.',
    },
    {
      title: 'High winds delayed west-elevation boom work',
      project_name: 'Riverside Townhomes — Building B',
      days_lost: 0.5,
      schedule_shift_applied: false,
      description:
        'Gusts over 35 mph Friday morning delayed boom lift for west openings. Resumed after lunch; logged as half-day impact without shifting the critical path further.',
    },
  ],
  schedule_adjustments: [
    {
      note: 'Pulled electrical rough-in forward in Units B1–B2 after framing cleared early',
      project_name: 'Riverside Townhomes — Building B',
      applied_workdays: 2,
      planned_finish: '2026-08-12',
      actual_finish: '2026-08-08',
    },
  ],
  daily_site_logs: [
    {
      created_at: '2026-07-29T18:30:00Z',
      project_name: 'Riverside Townhomes — Building B',
      payload: {
        sections: {
          work_completed: [
            { title: 'Finished OSB sheathing on east elevation floors 1–2' },
            { title: 'Staged window units for B3–B6' },
          ],
          weather: [{ summary: 'Clear, 84°F — full exterior day' }],
          crew_on_site: [
            { trade: 'Carpenters', name: '8' },
            { trade: 'Labor', name: '3' },
          ],
          notes: 'Material delivery on time. No safety incidents.',
        },
      },
    },
    {
      created_at: '2026-07-30T18:45:00Z',
      project_name: 'Riverside Townhomes — Building B',
      payload: {
        sections: {
          work_completed: [
            { title: 'House wrap south elevation complete' },
            { title: 'Window flashing started on east openings' },
          ],
          weather: [{ summary: 'Partly cloudy, 81°F' }],
          crew_on_site: [
            { trade: 'Carpenters', name: '7' },
            { trade: 'Weatherization', name: '4' },
          ],
          notes: 'Owner walk-through of Unit B1 framing — punch list noted and closed same day.',
        },
      },
    },
    {
      created_at: '2026-08-01T17:50:00Z',
      project_name: 'Riverside Townhomes — Building B',
      payload: {
        sections: {
          work_completed: [
            { title: 'HVAC trunks installed in second-floor corridor chase' },
            { title: 'Protected open west elevations ahead of storm front' },
          ],
          weather: [{ summary: 'Storms forecast overnight — site secured early' }],
          crew_on_site: [
            { trade: 'HVAC', name: '5' },
            { trade: 'Carpenters', name: '4' },
          ],
          notes: 'Secured loose materials; temp weather seals on unfinished openings.',
        },
      },
    },
    {
      created_at: '2026-08-04T18:20:00Z',
      project_name: 'Riverside Townhomes — Building B',
      payload: {
        sections: {
          work_completed: [
            { title: 'Balcony slab toppings poured for Units B1 & B2' },
            { title: 'Crew remobilized after weather delay; west window setting resumed' },
          ],
          weather: [{ summary: 'Clearing after storms, 78°F — full remobilization' }],
          crew_on_site: [
            { trade: 'Concrete', name: '6' },
            { trade: 'Carpenters', name: '8' },
            { trade: 'Electricians', name: '3' },
          ],
          notes: 'Schedule updated for 2 lost weather days. Next inspection target Thu for plumbing stacks.',
        },
      },
    },
  ],
  blockers: [
    'City plumbing rough-in inspection slot pending confirmation for Thu Aug 7 (inspector backlog after storm week).',
    'West elevation window units: 2 casements delayed from supplier — ETA Wed Aug 6; temporary weather seals in place.',
  ],
  next_steps: [
    'Confirm plumbing stack inspection for Aug 7 and notify MEP trade partners.',
    'Complete north wrap/flashing and resume west openings once casements arrive.',
    'Keep electrical rough-in moving in dry units so drywall can start Aug 11 in B1–B2.',
    'Update owner on Oct 17 finish date reflecting the two weather days.',
  ],
};

const schedule = {
  custom_subject: 'Progress Update: Riverside Townhomes — Building B (Jul 28 – Aug 4)',
  custom_message:
    'Weekly field update from the Building B crew. Framing is nearly closed, weatherproofing is moving, and we absorbed two thunderstorm stand-down days into the schedule. Finish date is now October 17.',
  report_audience_type: 'client',
  report_sections: {
    status_changes: true,
    task_completion: true,
    phase_changes: true,
    vitals: true,
    weekly_plan: true,
    show_assignees: true,
    show_dates: true,
    show_who_changed: true,
    show_phase_delta: true,
    show_blockers: true,
    show_weather_impacts: true,
    show_schedule_adjustments: true,
    include_daily_site_logs: true,
    include_task_photos: false,
    show_task_phase: true,
    client_friendly_labels: true,
  },
};

const branding = {
  organization_name: 'Summit Ridge Construction',
  primary_color: '#3B82F6',
  secondary_color: '#10B981',
  company_footer: 'Summit Ridge Construction · 1400 Harbor Ave, Suite 200 · Field office: (555) 014-2280',
  email_signature: 'Marcus Hale\nProject Manager\nSummit Ridge Construction',
  logo_url: null,
};

const { subject, html, text } = generateStandardReportEmail(reportData, schedule, branding);

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: RESEND_FROM,
    to: [TO],
    subject,
    html,
    text,
  }),
});

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('Resend error:', res.status, body?.message || body);
  process.exit(1);
}

console.log(`Sent progress report to ${TO}`);
console.log(`Resend id: ${body.id || '(ok)'}`);
console.log(`Subject: ${subject}`);
