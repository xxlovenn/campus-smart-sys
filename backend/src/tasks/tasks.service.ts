import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlanSource, TaskStatus, UserRole } from '@prisma/client';
import { AuthorizationService } from '../authorization/authorization.service';
import {
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

const TARGET = {
  ORGS: 'ORGS',
  ALL_STUDENTS: 'ALL_STUDENTS',
  GRADE: 'GRADE',
  MAJOR: 'MAJOR',
  CLASS: 'CLASS',
} as const;

const ORG_REVIEW = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
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
      include: { primaryOrg: true, relatedOrgs: true },
    });
    if (!task || task.approvalStatus !== APPROVAL.APPROVED) return;

    const memberIds = await this.resolveTargetStudentIds(task);

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

  private async resolveTargetStudentIds(task: any): Promise<string[]> {
    if (task.targetType === TARGET.ALL_STUDENTS) {
      const users = await this.prisma.user.findMany({
        where: { role: UserRole.STUDENT },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

    if (task.targetType === TARGET.GRADE && task.targetGrade) {
      const users = await this.prisma.user.findMany({
        where: { role: UserRole.STUDENT, grade: task.targetGrade },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

    if (task.targetType === TARGET.MAJOR && task.targetMajor) {
      const users = await this.prisma.user.findMany({
        where: {
          role: UserRole.STUDENT,
          ...(task.targetGrade ? { grade: task.targetGrade } : {}),
          major: task.targetMajor,
        },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

    if (task.targetType === TARGET.CLASS && task.targetClass) {
      const users = await this.prisma.user.findMany({
        where: {
          role: UserRole.STUDENT,
          ...(task.targetGrade ? { grade: task.targetGrade } : {}),
          ...(task.targetMajor ? { major: task.targetMajor } : {}),
          className: task.targetClass,
        },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

    const orgIds = new Set<string>();
    if (task.primaryOrgId) orgIds.add(task.primaryOrgId);
    for (const rel of task.relatedOrgs ?? []) {
      if (typeof rel.organizationId === 'string') orgIds.add(rel.organizationId);
    }
    if (orgIds.size === 0) return [];

    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: { in: Array.from(orgIds) } },
      include: { user: { select: { role: true } } },
    });
    return Array.from(
      new Set(
        members
          .filter((m) => m.user.role === UserRole.STUDENT)
          .map((m) => m.userId),
      ),
    );
  }

  private async finalizeTaskApproval(taskId: string) {
    const task = await (this.prisma.task as any).findUnique({
      where: { id: taskId },
      include: { orgReviews: true },
    });
    if (!task || task.approvalStatus === APPROVAL.REJECTED) return task;

    const hasOrgReviews = Array.isArray(task.orgReviews) && task.orgReviews.length > 0;
    const anyOrgRejected = hasOrgReviews && task.orgReviews.some((r: any) => r.status === ORG_REVIEW.REJECTED);
    if (anyOrgRejected) {
      return (this.prisma.task as any).update({
        where: { id: taskId },
        data: { approvalStatus: APPROVAL.REJECTED, reviewNote: '协办社团审核未通过' },
      });
    }

    const leagueApproved = !!task.reviewedById;
    const allOrgApproved =
      !hasOrgReviews || task.orgReviews.every((r: any) => r.status === ORG_REVIEW.APPROVED);

    if (leagueApproved && allOrgApproved) {
      const updated = await (this.prisma.task as any).update({
        where: { id: taskId },
        data: { approvalStatus: APPROVAL.APPROVED, approvedAt: task.approvedAt ?? new Date(), reviewNote: '' },
      });
      return updated;
    }

    if (leagueApproved && hasOrgReviews) {
      return (this.prisma.task as any).update({
        where: { id: taskId },
        data: { approvalStatus: APPROVAL.PENDING, reviewNote: '已通过团委审核，待协办社团审核' },
      });
    }

    return task;
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
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { grade: true, major: true, className: true },
    });
    const audienceWhere: Record<string, unknown>[] = [{ source: SOURCE.LEAGUE_PUBLISHED, targetType: TARGET.ALL_STUDENTS }];
    if (me?.grade) audienceWhere.push({ source: SOURCE.LEAGUE_PUBLISHED, targetType: TARGET.GRADE, targetGrade: me.grade });
    if (me?.major) {
      audienceWhere.push({
        source: SOURCE.LEAGUE_PUBLISHED,
        targetType: TARGET.MAJOR,
        targetMajor: me.major,
        ...(me.grade ? { targetGrade: me.grade } : {}),
      });
    }
    if (me?.className) {
      audienceWhere.push({
        source: SOURCE.LEAGUE_PUBLISHED,
        targetType: TARGET.CLASS,
        targetClass: me.className,
        ...(me.grade ? { targetGrade: me.grade } : {}),
        ...(me.major ? { targetMajor: me.major } : {}),
      });
    }
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
                ...audienceWhere,
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
              ...audienceWhere,
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
        relatedOrgs: { include: { organization: true } },
        orgReviews: { include: { organization: true } },
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
            reviewedById: reviewerId,
            approvedAt: new Date(),
            reviewNote: '已通过团委审核',
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

    const finalized = approve ? await this.finalizeTaskApproval(taskId) : updated;
    if (finalized?.approvalStatus === APPROVAL.APPROVED) {
      await this.syncApprovedTaskToMemberPlans(taskId);
    }

    await this.prisma.notification.create({
      data: {
        userId: updated.creatorId,
        titleZh: !approve
          ? '活动申请被驳回'
          : finalized?.approvalStatus === APPROVAL.APPROVED
            ? '活动申请已通过'
            : '活动申请待协办社团审核',
        titleEn: !approve
          ? 'Activity request rejected'
          : finalized?.approvalStatus === APPROVAL.APPROVED
            ? 'Activity request approved'
            : 'Waiting co-organizer approvals',
        titleRu: !approve
          ? 'Заявка отклонена'
          : finalized?.approvalStatus === APPROVAL.APPROVED
            ? 'Заявка одобрена'
            : 'Ожидается согласование соорганизаторов',
        bodyZh: updated.titleZh,
        bodyEn: updated.titleEn,
        bodyRu: updated.titleRu,
        taskId: updated.id,
      },
    });

    return finalized ?? updated;
  }

  async orgReviewRequests(userId: string) {
    const managedOrgIds = await this.authorization.managedOrgIds(userId);
    if (managedOrgIds.length === 0) return [];
    return (this.prisma.task as any).findMany({
      where: {
        source: SOURCE.ORG_REQUEST,
        approvalStatus: APPROVAL.PENDING,
        relatedOrgs: { some: { organizationId: { in: managedOrgIds } } },
      },
      include: {
        primaryOrg: true,
        relatedOrgs: { include: { organization: true } },
        orgReviews: { include: { organization: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async orgReviewRequest(taskId: string, reviewerId: string, approve: boolean, reason?: string) {
    const managedOrgIds = await this.authorization.managedOrgIds(reviewerId);
    if (managedOrgIds.length === 0) throw new ForbiddenException('No organization review scope');

    const targetRows = await (this.prisma.taskOrgReview as any).findMany({
      where: { taskId, organizationId: { in: managedOrgIds } },
    });
    if (!targetRows.length) {
      throw new ForbiddenException('No permission to review this request');
    }

    await (this.prisma.taskOrgReview as any).updateMany({
      where: {
        taskId,
        organizationId: { in: managedOrgIds },
        status: ORG_REVIEW.PENDING,
      },
      data: {
        status: approve ? ORG_REVIEW.APPROVED : ORG_REVIEW.REJECTED,
        reviewerId,
        reviewedAt: new Date(),
        reason: approve ? '' : reason?.trim() || 'Rejected by co-organizer',
      },
    });

    if (!approve) {
      await (this.prisma.task as any).update({
        where: { id: taskId },
        data: { approvalStatus: APPROVAL.REJECTED, reviewNote: reason?.trim() || '协办社团审核未通过' },
      });
    }

    const finalized = await this.finalizeTaskApproval(taskId);
    if (finalized?.approvalStatus === APPROVAL.APPROVED) {
      await this.syncApprovedTaskToMemberPlans(taskId);
    }
    return finalized;
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
      targetType?: 'ORGS' | 'ALL_STUDENTS' | 'GRADE' | 'MAJOR' | 'CLASS';
      targetGrade?: string;
      targetMajor?: string;
      targetClass?: string;
    },
  ) {
    const managedOrgIds = await this.authorization.managedOrgIds(userId);
    const effectiveRole = role === UserRole.LEAGUE_ADMIN
      ? UserRole.LEAGUE_ADMIN
      : managedOrgIds.length > 0
        ? UserRole.ORG_ADMIN
        : UserRole.STUDENT;
    const targetType = effectiveRole === UserRole.LEAGUE_ADMIN ? dto.targetType ?? TARGET.ORGS : TARGET.ORGS;

    const needsOrgScopeCheck = !(effectiveRole === UserRole.LEAGUE_ADMIN && targetType !== TARGET.ORGS);
    if (needsOrgScopeCheck && !canCreateTask(effectiveRole, dto.primaryOrgId, managedOrgIds)) {
      if (effectiveRole === UserRole.LEAGUE_ADMIN) {
        throw new ForbiddenException('primaryOrgId is required');
      }
      if (effectiveRole === UserRole.ORG_ADMIN) {
        throw new ForbiddenException('Org admin can only create tasks in managed organizations');
      }
      throw new ForbiddenException('Students cannot create org tasks');
    }
    if (!dto.descZh?.trim() || !dto.descEn?.trim() || !dto.descRu?.trim()) {
      throw new BadRequestException('Activity description is required');
    }
    if (
      effectiveRole === UserRole.LEAGUE_ADMIN &&
      targetType === TARGET.ORGS &&
      !dto.primaryOrgId &&
      !dto.relatedOrgIds?.length
    ) {
      throw new BadRequestException('At least one organization target is required');
    }

    if (effectiveRole === UserRole.LEAGUE_ADMIN && targetType === TARGET.GRADE && !dto.targetGrade?.trim()) {
      throw new BadRequestException('targetGrade is required for grade targeting');
    }
    if (effectiveRole === UserRole.LEAGUE_ADMIN && targetType === TARGET.MAJOR && !dto.targetMajor?.trim()) {
      throw new BadRequestException('targetMajor is required for major targeting');
    }
    if (effectiveRole === UserRole.LEAGUE_ADMIN && targetType === TARGET.CLASS && !dto.targetClass?.trim()) {
      throw new BadRequestException('targetClass is required for class targeting');
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
        targetType,
        targetGrade: effectiveRole === UserRole.LEAGUE_ADMIN ? dto.targetGrade?.trim() || null : null,
        targetMajor: effectiveRole === UserRole.LEAGUE_ADMIN ? dto.targetMajor?.trim() || null : null,
        targetClass: effectiveRole === UserRole.LEAGUE_ADMIN ? dto.targetClass?.trim() || null : null,
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
        orgReviews:
          effectiveRole === UserRole.ORG_ADMIN && dto.relatedOrgIds?.length
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
        orgReviews: true,
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