import { strict as assert } from 'node:assert';
import { UserRole } from '@prisma/client';
import {
  canAttachRelatedOrgs,
  canCreateTask,
  canDeleteTask,
  canUpdateTaskStatus,
  resolveEffectiveRole,
} from '../src/authorization/permission.policy';

function run() {
  assert.equal(resolveEffectiveRole(UserRole.LEAGUE_ADMIN, 0), UserRole.LEAGUE_ADMIN);
  assert.equal(resolveEffectiveRole(UserRole.STUDENT, 0), UserRole.STUDENT);
  assert.equal(resolveEffectiveRole(UserRole.STUDENT, 1), UserRole.ORG_ADMIN);
  assert.equal(resolveEffectiveRole(UserRole.ORG_ADMIN, 0), UserRole.STUDENT);
  assert.equal(resolveEffectiveRole(UserRole.ORG_ADMIN, 2), UserRole.ORG_ADMIN);

  assert.equal(canCreateTask(UserRole.LEAGUE_ADMIN, undefined, []), false);
  assert.equal(canCreateTask(UserRole.LEAGUE_ADMIN, 'org-1', []), true);
  assert.equal(canCreateTask(UserRole.ORG_ADMIN, 'org-1', ['org-1']), true);
  assert.equal(canCreateTask(UserRole.ORG_ADMIN, 'org-2', ['org-1']), false);
  assert.equal(canCreateTask(UserRole.STUDENT, 'org-1', ['org-1']), false);
  assert.equal(canAttachRelatedOrgs(UserRole.LEAGUE_ADMIN, ['org-1', 'org-2'], []), true);
  assert.equal(canAttachRelatedOrgs(UserRole.ORG_ADMIN, ['org-1'], ['org-1']), true);
  assert.equal(canAttachRelatedOrgs(UserRole.ORG_ADMIN, ['org-2'], ['org-1']), false);
  assert.equal(canAttachRelatedOrgs(UserRole.STUDENT, ['org-1'], ['org-1']), false);

  assert.equal(canUpdateTaskStatus(UserRole.LEAGUE_ADMIN, false, false), true);
  assert.equal(canUpdateTaskStatus(UserRole.ORG_ADMIN, false, true), true);
  assert.equal(canUpdateTaskStatus(UserRole.ORG_ADMIN, true, false), false);
  assert.equal(canUpdateTaskStatus(UserRole.STUDENT, true, false), true);
  assert.equal(canUpdateTaskStatus(UserRole.STUDENT, false, true), false);

  assert.equal(canDeleteTask(UserRole.LEAGUE_ADMIN, false, false), true);
  assert.equal(canDeleteTask(UserRole.ORG_ADMIN, false, true), true);
  assert.equal(canDeleteTask(UserRole.ORG_ADMIN, true, false), false);
  assert.equal(canDeleteTask(UserRole.STUDENT, true, false), true);
  assert.equal(canDeleteTask(UserRole.STUDENT, false, true), false);

  // eslint-disable-next-line no-console
  console.log('Permission matrix verification passed.');
}

run();
