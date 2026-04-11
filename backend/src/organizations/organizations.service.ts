import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private prisma: PrismaService,
    private authorization: AuthorizationService,
  ) {}

  async listForUser(userId: string, role: UserRole) {
    if (role === UserRole.LEAGUE_ADMIN) {
      return this.prisma.organization.findMany({ orderBy: { createdAt: 'desc' } });
    }
    const memberOrgIds = await this.authorization.memberOrgIds(userId);
    const managedOrgIds = await this.authorization.managedOrgIds(userId);
    const orgIds = Array.from(new Set([...memberOrgIds, ...managedOrgIds]));
    return this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: {
    nameZh: string;
    nameEn: string;
    nameRu: string;
    typeZh: string;
    typeEn: string;
    typeRu: string;
  }) {
    return this.prisma.organization.create({ data });
  }
}
