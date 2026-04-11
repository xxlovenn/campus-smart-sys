import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationMemberRole, OrganizationStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private prisma: PrismaService,
    private authorization: AuthorizationService,
  ) {}

  private async appendChangeLog(params: {
    action: string;
    entityId: string;
    organizationId?: string | null;
    actorId?: string | null;
    detailZh?: string;
    detailEn?: string;
    detailRu?: string;
  }) {
    await (this.prisma.activityChangeLog as any).create({
      data: {
        logType: 'ORGANIZATION',
        action: params.action,
        entityId: params.entityId,
        organizationId: params.organizationId ?? params.entityId,
        actorId: params.actorId ?? null,
        detailZh: params.detailZh ?? '',
        detailEn: params.detailEn ?? '',
        detailRu: params.detailRu ?? '',
      },
    });
  }

  private async generateUniqueOrgAccount(prefix = 'org') {
    while (true) {
      const account = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}@campus.org`;
      const exists = await this.prisma.user.findUnique({ where: { email: account }, select: { id: true } });
      if (!exists) return account;
    }
  }

  private async generateUniqueDefaultPassword() {
    while (true) {
      const password = `Org@${Math.random().toString(36).slice(2, 10)}${Math.floor(Math.random() * 10)}`;
      const exists = await this.prisma.organization.findFirst({
        where: { adminPassword: password },
        select: { id: true },
      });
      if (!exists) return password;
    }
  }

  private async ensureOrgCredential(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        adminUser: { select: { id: true, email: true, isOrgAccount: true } },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const hasAllFields =
      !!org.adminUserId &&
      !!org.adminAccount &&
      !!org.adminPassword &&
      !!org.adminUser &&
      org.adminUser.isOrgAccount &&
      org.adminUser.email === org.adminAccount;

    if (hasAllFields) return;

    let account = org.adminAccount?.trim() || '';
    let password = org.adminPassword?.trim() || '';
    let adminUserId = org.adminUserId || '';
    let adminUser = org.adminUser;

    // If linked user is absent or not a dedicated org account, create one instead of hijacking a normal student account.
    if (!adminUser || !adminUser.isOrgAccount) {
      if (!account) {
        account = await this.generateUniqueOrgAccount('org');
      }
      if (!password) password = await this.generateUniqueDefaultPassword();
      const passwordHash = await bcrypt.hash(password, 10);
      const created = await this.prisma.user.create({
        data: {
          email: account,
          passwordHash,
          name: `${org.nameZh}组织账号`,
          isOrgAccount: true,
          role: UserRole.STUDENT,
        },
        select: { id: true },
      });
      adminUserId = created.id;
    } else {
      adminUserId = adminUser.id;
      if (!account) account = adminUser.email;
      if (!password) password = await this.generateUniqueDefaultPassword();

      if (adminUser.email !== account) {
        await this.prisma.user.update({
          where: { id: adminUser.id },
          data: { email: account },
        });
      }
      if (!org.adminPassword) {
        await this.prisma.user.update({
          where: { id: adminUser.id },
          data: { passwordHash: await bcrypt.hash(password, 10) },
        });
      }
    }

    await this.prisma.organization.update({
      where: { id: org.id },
      data: {
        adminUserId,
        adminAccount: account,
        adminPassword: password,
      },
    });

    await this.prisma.organizationMember.upsert({
      where: { userId_organizationId: { userId: adminUserId, organizationId: org.id } },
      update: {
        memberRole: OrganizationMemberRole.ORG_ADMIN,
        roleZh: '系统组织账号',
        roleEn: 'System org account',
        roleRu: 'Системная учетная запись',
      },
      create: {
        userId: adminUserId,
        organizationId: org.id,
        memberRole: OrganizationMemberRole.ORG_ADMIN,
        roleZh: '系统组织账号',
        roleEn: 'System org account',
        roleRu: 'Системная учетная запись',
      },
    });
  }

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

  async create(data: {
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
    const account = await this.generateUniqueOrgAccount();
    const password = await this.generateUniqueDefaultPassword();
    const passwordHash = await bcrypt.hash(password, 10);

    const adminUser = await this.prisma.user.create({
      data: {
        email: account,
        passwordHash,
        name: `${data.nameZh}组织账号`,
        isOrgAccount: true,
        role: UserRole.STUDENT,
      },
      select: { id: true },
    });

    const org = await this.prisma.organization.create({
      data: {
        ...data,
        descriptionZh: data.descriptionZh ?? '',
        descriptionEn: data.descriptionEn ?? '',
        descriptionRu: data.descriptionRu ?? '',
        adminUserId: adminUser.id,
        adminAccount: account,
        adminPassword: password,
      },
      include: {
        leader: { select: { id: true, name: true, email: true, studentId: true } },
        _count: { select: { members: true } },
      },
    });

    await this.prisma.organizationMember.create({
      data: {
        userId: adminUser.id,
        organizationId: org.id,
        memberRole: OrganizationMemberRole.ORG_ADMIN,
        roleZh: '系统组织账号',
        roleEn: 'System org account',
        roleRu: 'Системная учетная запись',
      },
    });

    await this.appendChangeLog({
      action: 'ORGANIZATION_CREATED',
      entityId: org.id,
      organizationId: org.id,
      actorId: org.leaderUserId ?? adminUser.id,
      detailZh: `创建组织：${org.nameZh}`,
      detailEn: `Organization created: ${org.nameEn}`,
      detailRu: `Создана организация: ${org.nameRu}`,
    });

    return org;
  }

  async adminList() {
    const orgIds = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    for (const row of orgIds) {
      await this.ensureOrgCredential(row.id);
    }
    return this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        leader: { select: { id: true, name: true, email: true, studentId: true } },
        adminUser: { select: { id: true, name: true, email: true } },
        _count: { select: { members: true } },
      },
    });
  }

  private async assertManageScope(userId: string, role: UserRole, orgId: string) {
    if (role === UserRole.LEAGUE_ADMIN) return;
    const managedOrgIds = await this.authorization.managedOrgIds(userId);
    if (!managedOrgIds.includes(orgId)) {
      throw new ForbiddenException('No permission to manage this organization');
    }
  }

  async detail(orgId: string, userId: string, role: UserRole) {
    await this.assertManageScope(userId, role, orgId);
    if (role === UserRole.LEAGUE_ADMIN) {
      await this.ensureOrgCredential(orgId);
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        leader: { select: { id: true, name: true, email: true, studentId: true } },
        adminUser: { select: { id: true, name: true, email: true } },
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
    userId: string,
    role: UserRole,
  ) {
    await this.assertManageScope(userId, role, orgId);
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

    await this.appendChangeLog({
      action: 'ORGANIZATION_UPDATED',
      entityId: orgId,
      organizationId: orgId,
      actorId: userId,
      detailZh: `更新组织信息：${data.nameZh}`,
      detailEn: `Updated organization profile: ${data.nameEn}`,
      detailRu: `Обновлена информация организации: ${data.nameRu}`,
    });

    return this.detail(orgId, userId, role);
  }

  async updateStatus(orgId: string, status: OrganizationStatus, userId: string, role: UserRole) {
    await this.assertManageScope(userId, role, orgId);
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    if (org.status === status) return this.detail(orgId, userId, role);

    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        status,
        statusChangedAt: new Date(),
        statusChangedById: userId,
      },
    });
    await this.appendChangeLog({
      action: 'ORGANIZATION_STATUS_CHANGED',
      entityId: orgId,
      organizationId: orgId,
      actorId: userId,
      detailZh: `组织状态变更为：${status === OrganizationStatus.ACTIVE ? '启用' : '暂停'}`,
      detailEn: `Organization status changed to ${status}`,
      detailRu: `Статус организации изменен на ${status}`,
    });
    return this.detail(orgId, userId, role);
  }

  async changeLogs(orgId: string, userId: string, role: UserRole, limit = 20) {
    await this.assertManageScope(userId, role, orgId);
    return (this.prisma.activityChangeLog as any).findMany({
      where: { organizationId: orgId, logType: 'ORGANIZATION' },
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(100, limit)),
    });
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
    userId: string,
    role: UserRole,
  ) {
    await this.assertManageScope(userId, role, orgId);
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

    await this.appendChangeLog({
      action: 'ORGANIZATION_MEMBER_ADDED',
      entityId: orgId,
      organizationId: orgId,
      actorId: userId,
      detailZh: `添加组织成员：${user.name}`,
      detailEn: `Added member: ${user.name}`,
      detailRu: `Добавлен участник: ${user.name}`,
    });

    return this.detail(orgId, userId, role);
  }

  async removeMember(
    orgId: string,
    memberUserId: string,
    operatorUserId: string,
    role: UserRole,
  ) {
    await this.assertManageScope(operatorUserId, role, orgId);
    await this.prisma.organizationMember.deleteMany({
      where: { organizationId: orgId, userId: memberUserId },
    });
    const member = await this.prisma.user.findUnique({
      where: { id: memberUserId },
      select: { name: true, email: true },
    });
    await this.appendChangeLog({
      action: 'ORGANIZATION_MEMBER_REMOVED',
      entityId: orgId,
      organizationId: orgId,
      actorId: operatorUserId,
      detailZh: `移除组织成员：${member?.name ?? member?.email ?? memberUserId}`,
      detailEn: `Removed member: ${member?.name ?? member?.email ?? memberUserId}`,
      detailRu: `Удален участник: ${member?.name ?? member?.email ?? memberUserId}`,
    });
    return this.detail(orgId, operatorUserId, role);
  }

  async remove(orgId: string, operatorName: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    await this.appendChangeLog({
      action: 'ORGANIZATION_DELETED',
      entityId: orgId,
      organizationId: orgId,
      detailZh: `删除组织：${org.nameZh}（操作者：${operatorName}）`,
      detailEn: `Deleted organization: ${org.nameEn} (operator: ${operatorName})`,
      detailRu: `Удалена организация: ${org.nameRu} (оператор: ${operatorName})`,
    });
    await this.prisma.organizationMember.deleteMany({ where: { organizationId: orgId } });
    await this.prisma.organization.delete({ where: { id: orgId } });
    return { ok: true, operatorName };
  }

  async updateCredential(orgId: string, account: string, password: string) {
    await this.ensureOrgCredential(orgId);
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const dup = await this.prisma.organization.findFirst({
      where: { adminAccount: account, id: { not: orgId } },
      select: { id: true },
    });
    if (dup) throw new ForbiddenException('Account already exists');

    const passwordHash = await bcrypt.hash(password, 10);
    if (org.adminUserId) {
      await this.prisma.user.update({
        where: { id: org.adminUserId },
        data: { email: account, passwordHash },
      });
    }
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { adminAccount: account, adminPassword: password },
    });
    return this.adminList();
  }
}
