import assert from 'node:assert/strict';
import {
  mapOrgRoleToDefaultProjectCrewRole,
  defaultProjectCrewRoleForContact,
  PROJECT_CREW_ROLES,
} from '../packages/core-logic/src/utils/projectCrewRole.js';

assert.deepEqual(PROJECT_CREW_ROLES, ['PM', 'Team', 'Subcontractor', 'Client']);

assert.equal(mapOrgRoleToDefaultProjectCrewRole('Project Manager'), 'PM');
assert.equal(mapOrgRoleToDefaultProjectCrewRole('Org Admin'), 'PM');
assert.equal(mapOrgRoleToDefaultProjectCrewRole('Admin'), 'PM');
assert.equal(mapOrgRoleToDefaultProjectCrewRole('Member'), 'Team');
assert.equal(mapOrgRoleToDefaultProjectCrewRole('Custom Foreman'), 'Team');
assert.equal(mapOrgRoleToDefaultProjectCrewRole(null), 'Team');
assert.equal(mapOrgRoleToDefaultProjectCrewRole(''), 'Team');

assert.equal(
  defaultProjectCrewRoleForContact({ orgRoleName: 'Project Manager' }),
  'PM',
);
assert.equal(
  defaultProjectCrewRoleForContact({ contactType: 'Subcontractor' }),
  'Subcontractor',
);
assert.equal(
  defaultProjectCrewRoleForContact({ contactType: 'Client' }),
  'Client',
);
assert.equal(
  defaultProjectCrewRoleForContact({ hasOrgAccount: true }),
  'Team',
);
assert.equal(defaultProjectCrewRoleForContact({}), 'Subcontractor');

console.log('test-project-crew-role: ok');
