import { Injectable } from '@nestjs/common';
import { OrganizationMemberRole, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveEffectiveRole } from './permission.policy';

@Injectable()
export class AuthorizationService {
  constructor(private prisma: PrismaService) {}

  async memberOrgIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    return rows.map((row) => row.organizationId);
  }

  async managedOrgIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.organizationMember.findMany({
      where: { userId, memberRole: OrganizationMemberRole.ORG_ADMIN },
      select: { organizationId: true },
    });
    return rows.map((row) => row.organizationId);
  }

  async effectiveRole(userId: string, platformRole: UserRole): Promise<UserRole> {
    if (platformRole === UserRole.LEAGUE_ADMIN) {
      return UserRole.LEAGUE_ADMIN;
    }
    const managed = await this.managedOrgIds(userId);
    return resolveEffectiveRole(platformRole, managed.length);
  }
}
