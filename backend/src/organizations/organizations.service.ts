import { Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationMemberRole, UserRole } from '@prisma/client';
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
    descriptionZh?: string;
    descriptionEn?: string;
    descriptionRu?: string;
    typeZh: string;
    typeEn: string;
    typeRu: string;
    leaderUserId?: string;
  }) {
    return this.prisma.organization.create({
      data: {
        ...data,
        descriptionZh: data.descriptionZh ?? '',
        descriptionEn: data.descriptionEn ?? '',
        descriptionRu: data.descriptionRu ?? '',
      },
      include: {
        leader: { select: { id: true, name: true, email: true, studentId: true } },
        _count: { select: { members: true } },
      },
    });
  }

  adminList() {
    return this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        leader: { select: { id: true, name: true, email: true, studentId: true } },
        _count: { select: { members: true } },
      },
    });
  }

  async detail(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        leader: { select: { id: true, name: true, email: true, studentId: true } },
        members: {
          orderBy: { joinedAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                studentId: true,
                role: true,
              },
            },
          },
        },
        _count: { select: { members: true } },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async update(
    orgId: string,
    data: {
      nameZh: string;
      nameEn: string;
      nameRu: string;
      descriptionZh?: string;
      descriptionEn?: string;
      descriptionRu?: string;
      typeZh: string;
      typeEn: string;
      typeRu: string;
      leaderUserId?: string;
    },
  ) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        nameZh: data.nameZh,
        nameEn: data.nameEn,
        nameRu: data.nameRu,
        descriptionZh: data.descriptionZh ?? '',
        descriptionEn: data.descriptionEn ?? '',
        descriptionRu: data.descriptionRu ?? '',
        typeZh: data.typeZh,
        typeEn: data.typeEn,
        typeRu: data.typeRu,
        leaderUserId: data.leaderUserId || null,
      },
    });

    return this.detail(orgId);
  }

  async addMember(
    orgId: string,
    data: {
      userId: string;
      memberRole?: OrganizationMemberRole;
      roleZh?: string;
      roleEn?: string;
      roleRu?: string;
    },
  ) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    const user = await this.prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.organizationMember.upsert({
      where: { userId_organizationId: { userId: data.userId, organizationId: orgId } },
      update: {
        memberRole: data.memberRole ?? OrganizationMemberRole.MEMBER,
        roleZh: data.roleZh ?? '成员',
        roleEn: data.roleEn ?? 'Member',
        roleRu: data.roleRu ?? 'Участник',
      },
      create: {
        userId: data.userId,
        organizationId: orgId,
        memberRole: data.memberRole ?? OrganizationMemberRole.MEMBER,
        roleZh: data.roleZh ?? '成员',
        roleEn: data.roleEn ?? 'Member',
        roleRu: data.roleRu ?? 'Участник',
      },
    });

    return this.detail(orgId);
  }

  async removeMember(orgId: string, userId: string) {
    await this.prisma.organizationMember.deleteMany({
      where: { organizationId: orgId, userId },
    });
    return this.detail(orgId);
  }

  async remove(orgId: string, operatorName: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    await this.prisma.organizationMember.deleteMany({ where: { organizationId: orgId } });
    await this.prisma.organization.delete({ where: { id: orgId } });
    return { ok: true, operatorName };
  }
}
