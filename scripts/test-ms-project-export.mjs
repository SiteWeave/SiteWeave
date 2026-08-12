/**
 * Verify Microsoft Project XML export formatting + mapping round-trips.
 * Run: node scripts/test-ms-project-export.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const {
  buildMsProjectXml,
  formatDurationIso,
  escapeXml,
  sanitizeMsProjectFilename,
  MINUTES_PER_DAY,
  SITEWEAVE_CALENDAR_UID,
} = await import(pathToFileURL(join(root, 'src/utils/msProjectXmlExporter.js')).href);

const {
  mapMsLinkTypeToDependency,
  mapDependencyTypeToMsLinkType,
  mapLinkLagToDays,
  mapLagDaysToLinkLag,
  buildScheduleFromMappedRows,
  mergeWithSuggestedMappings,
} = await import(pathToFileURL(join(root, 'src/utils/msProjectImportMapping.js')).href);

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

function textOf(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1] : null;
}

function taskBlocks(xml) {
  const out = [];
  const re = /<Task>([\s\S]*?)<\/Task>/g;
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function child(block, tag) {
  return textOf(block, tag);
}

// --- Mapping helpers ---
{
  assert(mapMsLinkTypeToDependency('0') === 'finish_to_finish', 'MSP type 0 → FF');
  assert(mapMsLinkTypeToDependency('1') === 'finish_to_start', 'MSP type 1 → FS');
  assert(mapMsLinkTypeToDependency('2') === 'start_to_finish', 'MSP type 2 → SF');
  assert(mapMsLinkTypeToDependency('3') === 'start_to_start', 'MSP type 3 → SS');

  assert(mapDependencyTypeToMsLinkType('finish_to_finish') === 0, 'FF → 0');
  assert(mapDependencyTypeToMsLinkType('finish_to_start') === 1, 'FS → 1');
  assert(mapDependencyTypeToMsLinkType('start_to_finish') === 2, 'SF → 2');
  assert(mapDependencyTypeToMsLinkType('start_to_start') === 3, 'SS → 3');

  assert(mapLagDaysToLinkLag(1, 480) === 4800, '1 day lag → 4800 tenths-of-minutes');
  assert(mapLagDaysToLinkLag(-2, 480) === -9600, 'negative lag converts');
  assert(mapLinkLagToDays('4800', '7', 480) === 1, '4800 LinkLag → 1 day');
  assert(mapLinkLagToDays('-9600', '7', 480) === -2, 'negative LinkLag → days');
  assert(formatDurationIso(5) === 'PT40H0M0S', '5 days → PT40H0M0S');
  assert(formatDurationIso(0, true) === 'PT0H0M0S', 'milestone duration is zero');
  assert(escapeXml(`A & B <C> "D"`) === 'A &amp; B &lt;C&gt; &quot;D&quot;', 'XML escaping');
  assert(escapeXml('A\u0001B') === 'AB', 'invalid XML control characters removed');
  assert(sanitizeMsProjectFilename('Roof / Deck?') === 'Roof Deck-schedule.xml', 'filename sanitized');
}

const fixture = {
  project: { id: 'p1', name: 'Alpha & Beta <HQ>', start_date: '2026-06-01' },
  phases: [
    { id: 'ph1', name: 'Site Prep', order: 1 },
    { id: 'ph2', name: 'Structure', order: 2 },
    {
      id: 'ph-empty',
      name: 'Empty Phase',
      order: 3,
      start_date: '2026-08-03',
      end_date: '2026-08-05',
      progress: 25,
    },
  ],
  tasks: [
    {
      id: 't1',
      text: 'Mobilization',
      project_phase_id: 'ph1',
      start_date: '2026-06-01',
      due_date: '2026-06-03',
      duration_days: 3,
      percent_complete: 50,
      contacts: { name: 'Casey & Co' },
    },
    {
      id: 't2',
      text: 'Excavate',
      project_phase_id: 'ph1',
      start_date: '2026-06-04',
      due_date: '2026-06-08',
      duration_days: 3,
      percent_complete: 0,
      parent_task_id: null,
    },
    {
      id: 't2a',
      text: 'Dig footings',
      project_phase_id: 'ph1',
      parent_task_id: 't2',
      start_date: '2026-06-04',
      due_date: '2026-06-05',
      duration_days: 2,
    },
    {
      id: 't3',
      text: 'Foundation pour',
      project_phase_id: 'ph2',
      start_date: '2026-06-10',
      due_date: '2026-06-12',
      duration_days: 3,
      completed: true,
    },
    {
      id: 't4',
      text: 'Slab complete',
      project_phase_id: 'ph2',
      start_date: '2026-06-15',
      due_date: '2026-06-15',
      is_milestone: true,
      percent_complete: 0,
    },
    {
      id: 't5',
      text: 'Undated note',
      project_phase_id: 'ph2',
    },
    {
      id: 't6',
      text: 'Orphan parent child',
      parent_task_id: 'missing-parent',
      project_phase_id: 'missing-phase',
      start_date: '2026-06-20',
      due_date: '2026-06-21',
      duration_days: 2,
    },
    {
      id: 't7',
      text: 'Bad dates',
      project_phase_id: 'ph2',
      start_date: 'not-a-date',
      due_date: 'also-bad',
      duration_days: 'x',
    },
    {
      id: 't8',
      text: 'Impossible date',
      project_phase_id: 'ph2',
      start_date: '2026-02-31',
    },
    {
      id: 't9',
      text: 'Reversed dates',
      project_phase_id: 'ph2',
      start_date: '2026-07-10',
      due_date: '2026-07-08',
    },
    {
      id: 't10',
      text: 'Cycle A',
      parent_task_id: 't11',
    },
    {
      id: 't11',
      text: 'Cycle B',
      parent_task_id: 't10',
    },
  ],
  dependencies: [
    { id: 'd1', task_id: 't1', successor_task_id: 't2', dependency_type: 'finish_to_start', lag_days: 1 },
    { id: 'd2', task_id: 't2', successor_task_id: 't3', dependency_type: 'start_to_start', lag_days: 0 },
    { id: 'd3', task_id: 't3', successor_task_id: 't4', dependency_type: 'finish_to_finish', lag_days: -1 },
    { id: 'd4', task_id: 't1', successor_task_id: 't3', dependency_type: 'start_to_finish', lag_days: 2 },
  ],
};

const built = buildMsProjectXml(fixture);
const xml = built.xml;

{
  const longTextBuilt = buildMsProjectXml({
    project: { name: 'P'.repeat(300) },
    tasks: [{ id: 'long-task', text: 'T'.repeat(520), contacts: { name: 'C'.repeat(520) } }],
  });
  const longTask = taskBlocks(longTextBuilt.xml).find(
    (block) => child(block, 'UID') !== '0'
  );
  assert(textOf(longTextBuilt.xml, 'Name').length === 255, 'project name fits MSPDI limit');
  assert(child(longTask, 'Name').length === 512, 'task name fits MSPDI limit');
  assert(child(longTask, 'Contact').length === 512, 'contact name fits MSPDI limit');
  assert(
    longTextBuilt.warnings.includes('task_name_truncated:long-task'),
    'warns when task name is truncated'
  );
}

assert(xml.startsWith('<?xml version="1.0" encoding="UTF-8"'), 'XML declaration present');
assert(xml.includes(`xmlns="${'http://schemas.microsoft.com/project'}"`), 'MSP namespace present');
assert(xml.includes('<SaveVersion>12</SaveVersion>'), 'declares Project 2007 MSPDI dialect');
assert(xml.includes('<Name>Alpha &amp; Beta &lt;HQ&gt;</Name>'), 'project name escaped');
assert(xml.includes(`<CalendarUID>${SITEWEAVE_CALENDAR_UID}</CalendarUID>`), 'project calendar referenced');
assert(xml.includes('<MinutesPerDay>480</MinutesPerDay>'), 'MinutesPerDay=480');
assert(xml.includes('<DefaultStartTime>08:00:00</DefaultStartTime>'), 'default start time');
assert(xml.includes('<DefaultFinishTime>17:00:00</DefaultFinishTime>'), 'default finish time');
assert(xml.includes('<FromTime>08:00:00</FromTime>'), 'working morning window');
assert(xml.includes('<ToTime>17:00:00</ToTime>'), 'working afternoon window');
assert(xml.includes('<Exceptions>'), 'holiday exceptions section present');
assert(!xml.includes('<Manual>'), 'does not emit unsupported Manual task element');
assert(!xml.includes('<Active>'), 'does not emit unsupported Active task element');
assert(!xml.includes('<DaysPerWeek>'), 'does not emit unsupported DaysPerWeek project element');
assert(built.filename.includes('schedule.xml'), 'filename ends with schedule.xml');

const tasks = taskBlocks(xml);
assert(tasks.length >= 8, `expected multiple tasks, got ${tasks.length}`);

const projectSummary = tasks[0];
assert(child(projectSummary, 'UID') === '0', 'UID 0 project summary');
assert(child(projectSummary, 'OutlineLevel') === '0', 'project summary outline 0');
assert(child(projectSummary, 'Summary') === '1', 'project summary flagged');

const outlineLevels = tasks.map((t) => child(t, 'OutlineLevel'));
assert(outlineLevels.includes('1'), 'has phase level 1');
assert(outlineLevels.includes('2'), 'has task level 2');
assert(outlineLevels.includes('3'), 'has nested child level 3');

const names = tasks.map((t) => child(t, 'Name'));
assert(names.includes('Site Prep'), 'phase Site Prep present');
assert(names.includes('Empty Phase'), 'empty phase still exported');
assert(names.includes('Undated note'), 'undated task exported');
assert(names.includes('Unassigned Tasks'), 'fallback phase for missing phase tasks');
assert(names.includes('Dig footings'), 'child task nested');
assert(names.includes('Cycle A') && names.includes('Cycle B'), 'cyclic hierarchy tasks still exported');

const emptyPhase = tasks.find((t) => child(t, 'Name') === 'Empty Phase');
assert(emptyPhase && child(emptyPhase, 'Start') === '2026-08-03T08:00:00', 'empty phase keeps start');
assert(emptyPhase && child(emptyPhase, 'Finish') === '2026-08-05T17:00:00', 'empty phase keeps finish');
assert(emptyPhase && child(emptyPhase, 'PercentComplete') === '25', 'empty phase keeps progress');

const dig = tasks.find((t) => child(t, 'Name') === 'Dig footings');
assert(dig && child(dig, 'OutlineLevel') === '3', 'child outline level 3');
assert(dig && child(dig, 'OutlineNumber')?.startsWith('1.'), 'child outline number under phase 1');

const mob = tasks.find((t) => child(t, 'Name') === 'Mobilization');
assert(mob && child(mob, 'Start') === '2026-06-01T08:00:00', 'start at 08:00');
assert(mob && child(mob, 'Finish') === '2026-06-03T17:00:00', 'finish at 17:00');
assert(mob && child(mob, 'Duration') === 'PT24H0M0S', '3-day duration as hours');
assert(mob && child(mob, 'DurationFormat') === '7', 'duration format days');
assert(mob && child(mob, 'PercentComplete') === '50', 'percent complete');
assert(mob && child(mob, 'Contact') === 'Casey &amp; Co', 'assignee contact escaped');

const mile = tasks.find((t) => child(t, 'Name') === 'Slab complete');
assert(mile && child(mile, 'Milestone') === '1', 'milestone flagged');
assert(mile && child(mile, 'Duration') === 'PT0H0M0S', 'milestone zero duration');

const done = tasks.find((t) => child(t, 'Name') === 'Foundation pour');
assert(done && child(done, 'PercentComplete') === '100', 'completed → 100%');

const excavate = tasks.find((t) => child(t, 'Name') === 'Excavate');
assert(excavate && excavate.includes('<PredecessorLink>'), 'successor has predecessor link');
assert(excavate && excavate.includes('<Type>1</Type>'), 'FS type code 1');
assert(excavate && excavate.includes('<LinkLag>4800</LinkLag>'), '1 day lag as 4800');
assert(excavate && excavate.includes('<LagFormat>7</LagFormat>'), 'lag format days');

const foundation = tasks.find((t) => child(t, 'Name') === 'Foundation pour');
assert(foundation && foundation.includes('<Type>3</Type>'), 'SS type code 3');
assert(foundation && foundation.includes('<Type>2</Type>'), 'SF type code 2');

const slab = tasks.find((t) => child(t, 'Name') === 'Slab complete');
assert(slab && slab.includes('<Type>0</Type>'), 'FF type code 0');
assert(slab && slab.includes('<LinkLag>-4800</LinkLag>'), 'negative lag preserved');

assert(built.warnings.some((w) => w.startsWith('orphaned_parent:')), 'warns orphaned parent');
assert(built.warnings.some((w) => w.startsWith('missing_phase:')), 'warns missing phase');
assert(built.warnings.some((w) => w.startsWith('invalid_start:')), 'warns invalid start');
assert(built.warnings.some((w) => w === 'invalid_start:t8'), 'rejects impossible calendar date');
assert(built.warnings.some((w) => w === 'finish_before_start:t9'), 'warns reversed dates');
assert(!built.warnings.some((w) => w.startsWith('non_working_')), 'does not warn on weekend dates');
assert(!built.warnings.some((w) => w.startsWith('unscheduled_task:')), 'does not warn on undated tasks');
assert(built.warnings.some((w) => w.startsWith('hierarchy_cycle:')), 'warns hierarchy cycle');

// Ordering: Site Prep phase before Structure; Mobilization before Excavate
const sitePrepIdx = names.indexOf('Site Prep');
const structureIdx = names.indexOf('Structure');
const mobIdx = names.indexOf('Mobilization');
const excIdx = names.indexOf('Excavate');
assert(sitePrepIdx < structureIdx, 'phases ordered by order field');
assert(mobIdx < excIdx, 'tasks ordered by start/due');
assert(names.indexOf('Excavate') < names.indexOf('Dig footings'), 'parent precedes child');

// Structural MSPDI required-ish elements (lightweight schema checklist)
const requiredProjectTags = [
  'SaveVersion',
  'Name',
  'Title',
  'ScheduleFromStart',
  'StartDate',
  'CalendarUID',
  'MinutesPerDay',
  'Calendars',
  'Tasks',
];
for (const tag of requiredProjectTags) {
  assert(xml.includes(`<${tag}`), `project contains <${tag}>`);
}

const requiredTaskTags = ['UID', 'ID', 'Name', 'OutlineNumber', 'OutlineLevel', 'WBS', 'Summary'];
for (const tag of requiredTaskTags) {
  assert(child(projectSummary, tag) != null, `summary task has <${tag}>`);
}

// Semantic round-trip through mapping (without DOMParser): rebuild rows from exporter outline shape
{
  const rows = tasks.map((block) => {
    const uid = child(block, 'UID');
    const fields = {
      'el:UID': uid,
      'el:Name': (child(block, 'Name') || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
      'el:OutlineLevel': child(block, 'OutlineLevel'),
      'el:Summary': child(block, 'Summary'),
      'el:Start': child(block, 'Start') || '',
      'el:Finish': child(block, 'Finish') || '',
      'el:Duration': child(block, 'Duration') || '',
      'el:PercentComplete': child(block, 'PercentComplete') || '0',
      'el:Milestone': child(block, 'Milestone') || '0',
    };
    const predecessorLinks = [];
    const predRe = /<PredecessorLink>([\s\S]*?)<\/PredecessorLink>/g;
    let pm;
    while ((pm = predRe.exec(block))) {
      predecessorLinks.push({
        predecessorUid: textOf(pm[1], 'PredecessorUID'),
        type: textOf(pm[1], 'Type') || '1',
        linkLag: textOf(pm[1], 'LinkLag') || '0',
        lagFormat: textOf(pm[1], 'LagFormat') || '7',
      });
    }
    return { uid, fields, extended: new Map(), predecessorLinks };
  });

  const mapped = buildScheduleFromMappedRows({
    rows,
    sourceFieldMappings: mergeWithSuggestedMappings({}),
    rowRules: { strategy: 'summary_to_phase', skipOutlineLevel0: true, skipUid0: true },
    minutesPerDay: MINUTES_PER_DAY,
    dependencyStrategy: 'full',
  });

  assert(mapped.phases.some((p) => p.name === 'Site Prep'), 'round-trip keeps Site Prep phase');
  const mobilizationTask = mapped.tasks.find((t) => t.text === 'Mobilization');
  assert(Boolean(mobilizationTask), 'round-trip keeps the original task name');
  assert(mobilizationTask?.percent_complete === 50, 'round-trip keeps partial progress');
  assert(mapped.tasks.some((t) => t.is_milestone && t.text === 'Slab complete'), 'round-trip milestone');
  const doneTask = mapped.tasks.find((t) => t.text === 'Foundation pour' || String(t.text).startsWith('Foundation'));
  assert(doneTask?.percent_complete === 100 || doneTask?.completed === true, 'round-trip completed task');
  assert(
    (mapped.dependencyEdges || []).length >= 2,
    `round-trip leaf dependencies present (${(mapped.dependencyEdges || []).length})`
  );
  // Parent tasks export as Summary=1, so import maps them to phases and drops
  // edges that referenced those UIDs as tasks. Leaf→leaf links must survive.
  const sf = mapped.dependencyEdges.find((d) => d.dependencyType === 'start_to_finish');
  assert(Boolean(sf) && Number(sf.lagDays) === 2, 'round-trip SF lag days = 2');
  const ff = mapped.dependencyEdges.find((d) => d.dependencyType === 'finish_to_finish');
  assert(Boolean(ff) && Number(ff.lagDays) === -1, 'round-trip FF negative lag');
}

// Persist sample for optional manual open in Microsoft Project
const outDir = join(root, 'tmp');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'ms-project-export-fixture.xml');
writeFileSync(outPath, xml, 'utf8');
console.log(`wrote fixture: ${outPath}`);

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}

console.log('\nAll MS Project export checks passed');
