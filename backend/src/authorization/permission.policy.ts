import { UserRole } from '@prisma/client';

export function resolveEffectiveRole(
  platformRole: UserRole,
  managedOrgCount: number,
): UserRole {
  if (platformRole === UserRole.LEAGUE_ADMIN) {
    return UserRole.LEAGUE_ADMIN;
  }
  return managedOrgCount > 0 ? UserRole.ORG_ADMIN : UserRole.STUDENT;
}

export function canCreateTask(
  effectiveRole: UserRole,
  primaryOrgId: string | undefined,
  managedOrgIds: string[],
): boolean {
  if (effectiveRole === UserRole.LEAGUE_ADMIN) {
    return !!primaryOrgId;
  }
  if (effectiveRole === UserRole.ORG_ADMIN) {
    return !!primaryOrgId && managedOrgIds.includes(primaryOrgId);
  }
  return false;
}

export function canDeleteTask(
  effectiveRole: UserRole,
  isCreator: boolean,
  inManagedScope: boolean,
): boolean {
  if (effectiveRole === UserRole.LEAGUE_ADMIN) return true;
  if (effectiveRole === UserRole.ORG_ADMIN) return inManagedScope;
  return isCreator;
}

export function canAttachRelatedOrgs(
  effectiveRole: UserRole,
  relatedOrgIds: string[] | undefined,
  managedOrgIds: string[],
): boolean {
  if (!relatedOrgIds?.length) return true;
  if (effectiveRole === UserRole.LEAGUE_ADMIN) return true;
  if (effectiveRole === UserRole.ORG_ADMIN) {
    return relatedOrgIds.every((orgId) => managedOrgIds.includes(orgId));
  }
  return false;
}

export function canUpdateTaskStatus(
  effectiveRole: UserRole,
  isCreatorOrAssignee: boolean,
  inManagedScope: boolean,
): boolean {
  if (effectiveRole === UserRole.LEAGUE_ADMIN) return true;
  if (effectiveRole === UserRole.ORG_ADMIN) return inManagedScope;
  return isCreatorOrAssignee;
}
