import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlanSource, TaskStatus, UserRole } from '@prisma/client';
import { AuthorizationService } from '../authorization/authorization.service';
import {
  canAttachRelatedOrgs,
  canCreateTask,
} from '../authorization/permission.policy';
import { PrismaService } from '../prisma/prisma.service';

const APPROVAL = {
  PENDING: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

const SOURCE = {
  ORG_REQUEST: 'ORG_REQUEST',
  LEAGUE_PUBLISHED: 'LEAGUE_PUBLISHED',
} as const;

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private authorization: AuthorizationService,
  ) {}

  private async inManagedScope(taskId: string, primaryOrgId: string | null, managedOrgIds: string[]) {
    if (managedOrgIds.length === 0) return false;
    if (primaryOrgId && managedOrgIds.includes(primaryOrgId)) return true;
    const related = await this.prisma.taskOrganization.findFirst({
      where: { taskId, organizationId: { in: managedOrgIds } },
      select: { taskId: true },
    });
    return !!related;
  }

  private async syncApprovedTaskToMemberPlans(taskId: string) {
    const task = await (this.prisma.task as any).findUnique({
      where: { id: taskId },
      include: { primaryOrg: true },
    });
    if (!task || !task.primaryOrgId || task.approvalStatus !== APPROVAL.APPROVED) return;

    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: task.primaryOrgId },
      include: { user: { select: { role: true } } },
    });
    const memberIds = members
      .filter((m) => m.user.role === UserRole.STUDENT)
      .map((m) => m.userId);

    if (memberIds.length === 0) return;

    await this.prisma.personalPlan.createMany({
      data: memberIds.map((userId) => ({
        userId,
        titleZh: task.titleZh,
        titleEn: task.titleEn,
        titleRu: task.titleRu,
        source: PlanSource.ORG_TASK,
        dueAt: task.dueAt ?? task.endAt ?? null,
        startAt: task.startAt ?? null,
        endAt: task.endAt ?? null,
        syncedToTimeline: true,
      })),
    });
  }

  async listVisible(userId: string, role: UserRole) {
    if (role === UserRole.LEAGUE_ADMIN) {
      return (this.prisma.task as any).findMany({
        include: {
          primaryOrg: true,
          relatedOrgs: { include: { organization: true } },
          assignee: { select: { id: true, name: true, email: true } },
          creator: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ endAt: 'asc' }, { dueAt: 'asc' }],
      });
    }

    const managedOrgIds = await this.authorization.managedOrgIds(userId);
    if (managedOrgIds.length > 0) {
      return (this.prisma.task as any).findMany({
        where: {
          OR: [
            { assigneeId: userId },
            { creatorId: userId },
            {
              approvalStatus: APPROVAL.APPROVED,
              OR: [
                { primaryOrgId: { in: managedOrgIds } },
                { relatedOrgs: { some: { organizationId: { in: managedOrgIds } } } },
              ],
            },
          ],
        },
        include: {
          primaryOrg: true,
          relatedOrgs: { include: { organization: true } },
          assignee: { select: { id: true, name: true, email: true } },
          creator: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ endAt: 'asc' }, { dueAt: 'asc' }],
      });
    }

    const memberOrgIds = await this.authorization.memberOrgIds(userId);
    return (this.prisma.task as any).findMany({
      where: {
        OR: [
          { assigneeId: userId },
          { creatorId: userId },
          {
            approvalStatus: APPROVAL.APPROVED,
            OR: [
              { primaryOrgId: { in: memberOrgIds } },
              { relatedOrgs: { some: { organizationId: { in: memberOrgIds } } } },
            ],
          },
        ],
      },
      include: {
        primaryOrg: true,
        relatedOrgs: { include: { organization: true } },
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ endAt: 'asc' }, { dueAt: 'asc' }],
    });
  }

  async adminOverview() {
    const grouped = await (this.prisma.task as any).groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const tasks = await (this.prisma.task as any).findMany({
      include: {
        primaryOrg: true,
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ endAt: 'asc' }, { dueAt: 'asc' }],
    });

    return { grouped, tasks };
  }

  pendingRequests() {
    return (this.prisma.task as any).findMany({
      where: { approvalStatus: APPROVAL.PENDING },
      include: {
        primaryOrg: true,
        creator: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async reviewRequest(taskId: string, reviewerId: string, approve: boolean, reason?: string) {
    const task = await (this.prisma.task as any).findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task request not found');
    if (task.approvalStatus !== APPROVAL.PENDING) {
      throw new BadRequestException('Only pending requests can be reviewed');
    }

    const updated = await (this.prisma.task as any).update({
      where: { id: taskId },
      data: approve
        ? {
            approvalStatus: APPROVAL.APPROVED,
            reviewedById: reviewerId,
            approvedAt: new Date(),
            reviewNote: '',
          }
        : {
            approvalStatus: APPROVAL.REJECTED,
            reviewedById: reviewerId,
            reviewNote: reason?.trim() || 'Rejected by league admin',
          },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        primaryOrg: true,
      },
    });

    if (approve) {
      await this.syncApprovedTaskToMemberPlans(taskId);
    }

    await this.prisma.notification.create({
      data: {
        userId: updated.creatorId,
        titleZh: approve ? '活动申请已通过' : '活动申请被驳回',
        titleEn: approve ? 'Activity request approved' : 'Activity request rejected',
        titleRu: approve ? 'Заявка одобрена' : 'Заявка отклонена',
        bodyZh: updated.titleZh,
        bodyEn: updated.titleEn,
        bodyRu: updated.titleRu,
        taskId: updated.id,
      },
    });

    return updated;
  }

  async create(
    userId: string,
    role: UserRole,
    dto: {
      titleZh: string;
      titleEn: string;
      titleRu: string;
      descZh?: string;
      descEn?: string;
      descRu?: string;
      startAt?: string;
      endAt?: string;
      dueAt?: string;
      assigneeId?: string;
      primaryOrgId?: string;
      relatedOrgIds?: string[];
    },
  ) {
    const managedOrgIds = await this.authorization.managedOrgIds(userId);
    const effectiveRole = role === UserRole.LEAGUE_ADMIN
      ? UserRole.LEAGUE_ADMIN
      : managedOrgIds.length > 0
        ? UserRole.ORG_ADMIN
        : UserRole.STUDENT;

    if (!canCreateTask(effectiveRole, dto.primaryOrgId, managedOrgIds)) {
      if (effectiveRole === UserRole.LEAGUE_ADMIN) {
        throw new ForbiddenException('primaryOrgId is required');
      }
      if (effectiveRole === UserRole.ORG_ADMIN) {
        throw new ForbiddenException('Org admin can only create tasks in managed organizations');
      }
      throw new ForbiddenException('Students cannot create org tasks');
    }
    if (!canAttachRelatedOrgs(effectiveRole, dto.relatedOrgIds, managedOrgIds)) {
      throw new ForbiddenException('Related organizations must be within managed scope');
    }

    const now = new Date();
    const startAt = dto.startAt ? new Date(dto.startAt) : undefined;
    const endAt = dto.endAt ? new Date(dto.endAt) : undefined;
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : endAt;

    if (startAt && startAt.getTime() < now.getTime() - 60 * 1000) {
      throw new BadRequestException('startAt cannot be earlier than now');
    }

    if (endAt && endAt.getTime() < now.getTime() - 60 * 1000) {
      throw new BadRequestException('endAt cannot be earlier than now');
    }

    if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
      throw new BadRequestException('endAt cannot be earlier than startAt');
    }

    const task = await (this.prisma.task as any).create({
      data: {
        titleZh: dto.titleZh,
        titleEn: dto.titleEn,
        titleRu: dto.titleRu,
        descZh: dto.descZh ?? '',
        descEn: dto.descEn ?? '',
        descRu: dto.descRu ?? '',
        startAt,
        endAt,
        dueAt,
        creatorId: userId,
        assigneeId: dto.assigneeId,
        primaryOrgId: dto.primaryOrgId,
        source:
          effectiveRole === UserRole.LEAGUE_ADMIN ? SOURCE.LEAGUE_PUBLISHED : SOURCE.ORG_REQUEST,
        approvalStatus:
          effectiveRole === UserRole.LEAGUE_ADMIN
            ? APPROVAL.APPROVED
            : APPROVAL.PENDING,
        approvedAt: effectiveRole === UserRole.LEAGUE_ADMIN ? new Date() : null,
        reviewedById: effectiveRole === UserRole.LEAGUE_ADMIN ? userId : null,
        reviewNote: effectiveRole === UserRole.LEAGUE_ADMIN ? '' : '待团委审核',
        relatedOrgs: dto.relatedOrgIds?.length
          ? {
              createMany: {
                data: dto.relatedOrgIds.map((organizationId) => ({ organizationId })),
                skipDuplicates: true,
              },
            }
          : undefined,
      },
      include: {
        primaryOrg: true,
        relatedOrgs: { include: { organization: true } },
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    if (task.approvalStatus === APPROVAL.APPROVED) {
      await this.syncApprovedTaskToMemberPlans(task.id);
    } else {
      const leagueAdmins = await this.prisma.user.findMany({
        where: { role: UserRole.LEAGUE_ADMIN },
        select: { id: true },
      });
      if (leagueAdmins.length > 0) {
        await this.prisma.notification.createMany({
          data: leagueAdmins.map((admin) => ({
            userId: admin.id,
            titleZh: '收到新的活动申请',
            titleEn: 'New activity request submitted',
            titleRu: 'Поступила новая заявка',
            bodyZh: task.titleZh,
            bodyEn: task.titleEn,
            bodyRu: task.titleRu,
            taskId: task.id,
          })),
        });
      }
    }

    if (dto.assigneeId && task.approvalStatus === APPROVAL.APPROVED) {
      await this.prisma.notification.create({
        data: {
          userId: dto.assigneeId,
          titleZh: '新任务指派',
          titleEn: 'New task assigned',
          titleRu: 'Новая задача',
          bodyZh: dto.titleZh,
          bodyEn: dto.titleEn,
          bodyRu: dto.titleRu,
          taskId: task.id,
        },
      });
    }

    return task;
  }

  async updateStatus(userId: string, role: UserRole, taskId: string, status: TaskStatus) {
    const task = await (this.prisma.task as any).findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException();
    if (task.approvalStatus !== APPROVAL.APPROVED) {
      throw new ForbiddenException('Only approved activities can update progress');
    }

    if (role === UserRole.LEAGUE_ADMIN) {
      return this.prisma.task.update({ where: { id: taskId }, data: { status } });
    }

    const managedOrgIds = await this.authorization.managedOrgIds(userId);
    const effectiveRole = managedOrgIds.length > 0 ? UserRole.ORG_ADMIN : UserRole.STUDENT;
    if (effectiveRole === UserRole.STUDENT) {
      throw new ForbiddenException('Student side cannot modify activity tasks');
    }
    if (task.source === SOURCE.LEAGUE_PUBLISHED) {
      throw new ForbiddenException('League published tasks cannot be modified by org/student side');
    }

    const inManaged = await this.inManagedScope(taskId, task.primaryOrgId, managedOrgIds);
    if (!inManaged) {
      throw new ForbiddenException('No permission to update this task');
    }

    return this.prisma.task.update({ where: { id: taskId }, data: { status } });
  }

  async remove(userId: string, role: UserRole, taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException();
    }

    if (role !== UserRole.LEAGUE_ADMIN) {
      const managedOrgIds = await this.authorization.managedOrgIds(userId);
      const effectiveRole = managedOrgIds.length > 0 ? UserRole.ORG_ADMIN : UserRole.STUDENT;
      if (effectiveRole === UserRole.STUDENT) {
        throw new ForbiddenException('Student side cannot delete activity tasks');
      }
      if (task.source === SOURCE.LEAGUE_PUBLISHED) {
        throw new ForbiddenException('League published tasks cannot be deleted by org/student side');
      }
      const inManaged = await this.inManagedScope(taskId, task.primaryOrgId, managedOrgIds);
      if (!inManaged) {
        throw new ForbiddenException('No permission to delete this task');
      }
    }

    await this.prisma.taskOrganization.deleteMany({
      where: { taskId },
    });

    return this.prisma.task.delete({
      where: { id: taskId },
    });
  }
}