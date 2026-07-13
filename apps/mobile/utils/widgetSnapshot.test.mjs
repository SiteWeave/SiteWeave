import assert from 'node:assert/strict';
import {
  WIDGET_SNAPSHOT_VERSION,
  WIDGET_STATES,
  buildWidgetSnapshot,
  buildLoggedOutWidgetSnapshot,
  computeWeatherRiskLevel,
  countDueTodayTasks,
  mapMyDayItemForWidget,
  mergeWidgetSnapshots,
  formatWidgetStaleLabel,
} from './widgetSnapshot.js';

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test('buildWidgetSnapshot includes version and myDay items', () => {
  const snapshot = buildWidgetSnapshot({
    tasks: [{ id: 't1', title: 'Pour slab', due_date: '2026-06-22', completed: false, project_id: 'p1' }],
    events: [{ id: 'e1', title: 'Inspection', start_time: '2026-06-22T09:00:00Z', project_id: 'p1', type: 'event' }],
    kpis: { dueToday: 1, overdue: 0, unreadNotifications: 2 },
    pinnedProject: { id: 'p1', name: 'Riverside Tower', progress: 64 },
    weather: { temperature: 72, precipProbability: 20, condition: 'Clear', locationLabel: 'Austin, TX' },
  });

  assert.strictEqual(snapshot.version, WIDGET_SNAPSHOT_VERSION);
  assert.ok(snapshot.myDay.length >= 1);
  assert.strictEqual(snapshot.pinnedProject.name, 'Riverside Tower');
  assert.strictEqual(snapshot.kpis.unreadNotifications, 2);
  assert.strictEqual(snapshot.weather.riskLevel, 'medium');
});

test('logged out snapshot uses auth deep link', () => {
  const snapshot = buildLoggedOutWidgetSnapshot();
  assert.strictEqual(snapshot.state, WIDGET_STATES.LOGGED_OUT);
  assert.strictEqual(snapshot.deepLink, 'siteweave:///(auth)/login');
});

test('mapMyDayItemForWidget builds task deep link', () => {
  const item = mapMyDayItemForWidget({
    type: 'task',
    id: 't1',
    title: 'Frame Level 2',
    due_date: '2026-06-22',
    project_id: 'p1',
  });
  assert.match(item.deepLink, /projects\/p1\?task=t1/);
});

test('mergeWidgetSnapshots preserves nested fields', () => {
  const merged = mergeWidgetSnapshots(
    buildWidgetSnapshot({ kpis: { dueToday: 1, overdue: 0, unreadNotifications: 0 } }),
    { kpis: { unreadNotifications: 3 } },
  );
  assert.strictEqual(merged.kpis.dueToday, 1);
  assert.strictEqual(merged.kpis.unreadNotifications, 3);
});

test('utility helpers', () => {
  assert.strictEqual(computeWeatherRiskLevel(10), 'low');
  assert.strictEqual(computeWeatherRiskLevel(70), 'high');
  assert.strictEqual(countDueTodayTasks([{ due_date: '2026-06-22', completed: false }], new Date('2026-06-22T12:00:00')), 1);
  assert.match(formatWidgetStaleLabel(new Date(Date.now() - 5 * 60000).toISOString()), /Updated 5m ago/);
});

console.log('widgetSnapshot tests passed');
