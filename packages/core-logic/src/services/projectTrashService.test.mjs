import assert from 'node:assert/strict';
import {
  PROJECT_TRASH_RETENTION_DAYS,
  TRASHED_PROJECT_COLUMNS,
} from './projectTrashService.js';

assert.equal(PROJECT_TRASH_RETENTION_DAYS, 30);
assert.ok(TRASHED_PROJECT_COLUMNS.includes('trashed_at'));
assert.ok(TRASHED_PROJECT_COLUMNS.includes('purge_after'));
console.log('projectTrashService.test.mjs passed');
