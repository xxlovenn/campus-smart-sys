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
const DELETE_REQUEST_PREFIX = 'DELETE_REQUEST::';

type RecommendationCode =
  | 'overdue'
  | 'due_6h'
  | 'due_24h'
  | 'due_72h'
  | 'not_done'
  | 'done'
  | 'in_progress'
  | 'todo'
  | 'blocked'
  | 'no_deadline';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private authorization: AuthorizationService,
  ) {}

  private async appendTaskLog(params: {
    action: string;
    taskId: string;
    organizationId?: string | null;
    actorId?: string | null;
    detailZh?: string;
    detailEn?: string;
    detailRu?: string;
  }) {
    await (this.prisma.activityChangeLog as any).create({
      data: {
        logType: 'TASK',
        action: params.action,
        entityId: params.taskId,
        taskId: params.taskId,
        organizationId: params.organizationId ?? null,
        actorId: params.actorId ?? null,
        detailZh: params.detailZh ?? '',
        detailEn: params.detailEn ?? '',
        detailRu: params.detailRu ?? '',
      },
    });
  }

  private parseOptionalDate(raw?: string) {
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Invalid datetime format');
    }
    return d;
  }

  private isDeleteRequestTask(task: { reviewNote?: string | null }) {
    return typeof task.reviewNote === 'string' && task.reviewNote.startsWith(DELETE_REQUEST_PREFIX);
  }

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
    const existing = await this.prisma.personalPlan.findMany({
      where: { upstreamTaskId: taskId, source: PlanSource.ORG_TASK },
      select: { id: true, userId: true },
    });
    const existingUserIds = new Set(existing.map((row) => row.userId));
    const targetUserIds = new Set(memberIds);

    const removedUserIds = Array.from(existingUserIds).filter((userId) => !targetUserIds.has(userId));
    if (removedUserIds.length > 0) {
      await this.prisma.personalPlan.deleteMany({
        where: {
          upstreamTaskId: taskId,
          source: PlanSource.ORG_TASK,
          userId: { in: removedUserIds },
        },
      });
    }

    if (memberIds.length === 0) return;

    await this.prisma.$transaction(
      memberIds.map((userId) =>
        this.prisma.personalPlan.upsert({
          where: {
            userId_upstreamTaskId: {
              userId,
              upstreamTaskId: taskId,
            },
          },
          create: {
            userId,
            titleZh: task.titleZh,
            titleEn: task.titleEn,
            titleRu: task.titleRu,
            noteZh: task.descZh ?? '',
            noteEn: task.descEn ?? '',
            noteRu: task.descRu ?? '',
            source: PlanSource.ORG_TASK,
            upstreamTaskId: taskId,
            dueAt: task.dueAt ?? task.endAt ?? null,
            startAt: task.startAt ?? null,
            endAt: task.endAt ?? null,
            syncedToTimeline: true,
          },
          update: {
            titleZh: task.titleZh,
            titleEn: task.titleEn,
            titleRu: task.titleRu,
            noteZh: task.descZh ?? '',
            noteEn: task.descEn ?? '',
            noteRu: task.descRu ?? '',
            dueAt: task.dueAt ?? task.endAt ?? null,
            startAt: task.startAt ?? null,
            endAt: task.endAt ?? null,
            syncedToTimeline: true,
          },
        }),
      ),
    );
  }

  private async clearTaskSyncedPlans(taskId: string) {
    await this.prisma.personalPlan.deleteMany({
      where: { upstreamTaskId: taskId, source: PlanSource.ORG_TASK },
    });
  }

  private async syncTaskTimelineMirror(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { approvalStatus: true },
    });
    if (!task) return;
    if (task.approvalStatus === APPROVAL.APPROVED) {
      await this.syncApprovedTaskToMemberPlans(taskId);
      return;
    }
    await this.clearTaskSyncedPlans(taskId);
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

  private resolveTargetOrganizationIds(task: any): string[] {
    const orgIds = new Set<string>();
    if (task.primaryOrgId) orgIds.add(task.primaryOrgId);
    for (const rel of task.relatedOrgs ?? []) {
      if (typeof rel.organizationId === 'string') orgIds.add(rel.organizationId);
    }
    return Array.from(orgIds);
  }

  private async resolveTargetOrgUserIds(task: any): Promise<string[]> {
    const orgIds = this.resolveTargetOrganizationIds(task);
    if (orgIds.length === 0) return [];

    const [members, orgHeads] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where: { organizationId: { in: orgIds } },
        select: { userId: true },
      }),
      this.prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { adminUserId: true, leaderUserId: true },
      }),
    ]);

    const userIds = new Set<string>();
    for (const row of members) userIds.add(row.userId);
    for (const row of orgHeads) {
      if (row.adminUserId) userIds.add(row.adminUserId);
      if (row.leaderUserId) userIds.add(row.leaderUserId);
    }
    return Array.from(userIds);
  }

  private async sendTaskPublishedNotifications(
    taskId: string,
    source: typeof SOURCE[keyof typeof SOURCE],
    excludeUserIds: string[] = [],
  ) {
    const task = await (this.prisma.task as any).findUnique({
      where: { id: taskId },
      include: { relatedOrgs: true },
    });
    if (!task || task.approvalStatus !== APPROVAL.APPROVED) return;

    const [orgUserIds, studentUserIds] = await Promise.all([
      this.resolveTargetOrgUserIds(task),
      this.resolveTargetStudentIds(task),
    ]);
    const blocked = new Set(excludeUserIds.filter(Boolean));
    const orgRecipients = orgUserIds.filter((id) => !blocked.has(id));
    const studentRecipients = studentUserIds.filter((id) => !blocked.has(id));

    const orgTitle =
      source === SOURCE.LEAGUE_PUBLISHED
        ? { zh: '团委发布新任务/活动', en: 'New league task/activity', ru: 'Новая задача/активность от комитета' }
        : { zh: '社团发布新任务/活动', en: 'New club task/activity', ru: 'Новая задача/активность от клуба' };
    const studentTitle =
      source === SOURCE.LEAGUE_PUBLISHED
        ? { zh: '收到新的任务/活动通知', en: 'New task/activity notice', ru: 'Новое уведомление о задаче/активности' }
        : { zh: '收到社团任务/活动通知', en: 'New club task/activity notice', ru: 'Новое уведомление о клубной задаче/активности' };

    if (orgRecipients.length > 0) {
      await this.prisma.notification.createMany({
        data: orgRecipients.map((userId) => ({
          userId,
          titleZh: orgTitle.zh,
          titleEn: orgTitle.en,
          titleRu: orgTitle.ru,
          bodyZh: task.titleZh,
          bodyEn: task.titleEn,
          bodyRu: task.titleRu,
          taskId: task.id,
        })),
      });
    }
    if (studentRecipients.length > 0) {
      await this.prisma.notification.createMany({
        data: studentRecipients.map((userId) => ({
          userId,
          titleZh: studentTitle.zh,
          titleEn: studentTitle.en,
          titleRu: studentTitle.ru,
          bodyZh: task.titleZh,
          bodyEn: task.titleEn,
          bodyRu: task.titleRu,
          taskId: task.id,
        })),
      });
    }
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
        data: {
          approvalStatus: APPROVAL.APPROVED,
          approvedAt: task.approvedAt ?? new Date(),
          reviewNote: task.reviewNote || '已通过审核',
        },
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

  private computeRecommendation(task: any, now: Date) {
    const due = task.dueAt ?? task.endAt ?? task.startAt ?? null;
    const dueDate = due ? new Date(due) : null;
    const dueTs = dueDate && Number.isFinite(dueDate.getTime()) ? dueDate.getTime() : null;
    let score = 0;
    const reasons: RecommendationCode[] = [];

    if (task.status !== 'DONE') {
      score += 30;
      reasons.push('not_done');
    } else {
      score -= 40;
      reasons.push('done');
    }

    if (task.status === 'IN_PROGRESS') {
      score += 25;
      reasons.push('in_progress');
    } else if (task.status === 'TODO') {
      score += 15;
      reasons.push('todo');
    } else if (task.status === 'BLOCKED') {
      score += 10;
      reasons.push('blocked');
    }

    if (dueTs === null) {
      score += 5;
      reasons.push('no_deadline');
    } else {
      const diff = dueTs - now.getTime();
      if (diff < 0) {
        score += 130;
        reasons.push('overdue');
      } else if (diff <= 6 * 60 * 60 * 1000) {
        score += 95;
        reasons.push('due_6h');
      } else if (diff <= 24 * 60 * 60 * 1000) {
        score += 70;
        reasons.push('due_24h');
      } else if (diff <= 72 * 60 * 60 * 1000) {
        score += 40;
        reasons.push('due_72h');
      }
    }

    const priority = score >= 120 ? 'HIGH' : score >= 70 ? 'MEDIUM' : 'LOW';
    return {
      score,
      reasons,
      priority,
      dueAt: dueTs ? new Date(dueTs).toISOString() : null,
    };
  }

  async recommendations(userId: string, role: UserRole) {
    const visibleTasks = await this.listVisible(userId, role);
    const now = new Date();
    const rows = (visibleTasks ?? [])
      .map((task: any) => {
        const recommendation = this.computeRecommendation(task, now);
        return {
          id: task.id,
          titleZh: task.titleZh,
          titleEn: task.titleEn,
          titleRu: task.titleRu,
          status: task.status,
          dueAt: recommendation.dueAt,
          recommendationPriority: recommendation.priority,
          recommendationScore: recommendation.score,
          recommendationReasons: recommendation.reasons,
        };
      })
      .sort((a: any, b: any) => {
        if (b.recommendationScore !== a.recommendationScore) {
          return b.recommendationScore - a.recommendationScore;
        }
        const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        return ad - bd;
      })
      .slice(0, 8)
      .map((row, index) => ({
        ...row,
        order: index + 1,
      }));

    return {
      generatedAt: now.toISOString(),
      items: rows,
    };
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

  async pendingRequests(stage: 'LEAGUE_REVIEW' | 'CO_ORG_REVIEW' | 'ALL' = 'LEAGUE_REVIEW') {
    const rows = await (this.prisma.task as any).findMany({
      where: { approvalStatus: APPROVAL.PENDING },
      include: {
        primaryOrg: true,
        relatedOrgs: { include: { organization: true } },
        orgReviews: { include: { organization: true } },
        creator: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    const withStage = rows.map((row: any) => {
      const hasOrgReviews = Array.isArray(row.orgReviews) && row.orgReviews.length > 0;
      const waitingCoOrgs = hasOrgReviews && row.orgReviews.some((r: any) => r.status === ORG_REVIEW.PENDING);
      const queueStage =
        row.reviewedById && waitingCoOrgs
          ? 'CO_ORG_REVIEW'
          : 'LEAGUE_REVIEW';
      return { ...row, queueStage };
    });
    if (stage === 'ALL') return withStage;
    return withStage.filter((row: any) => row.queueStage === stage);
  }

  reviewRecords(limit = 20, source: 'ORG_REQUEST' | 'LEAGUE_PUBLISHED' | 'ALL' = 'ORG_REQUEST') {
    return (this.prisma.task as any).findMany({
      where: {
        approvalStatus: { in: [APPROVAL.APPROVED, APPROVAL.REJECTED] },
        ...(source === 'ALL' ? {} : { source }),
      },
      include: {
        primaryOrg: true,
        creator: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.max(1, Math.min(50, Number(limit) || 20)),
    });
  }

  async reviewRequest(taskId: string, reviewerId: string, approve: boolean, reason?: string) {
    const task = await (this.prisma.task as any).findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task request not found');
    if (task.approvalStatus !== APPROVAL.PENDING) {
      throw new BadRequestException('Only pending requests can be reviewed');
    }
    const isDeleteRequest = this.isDeleteRequestTask(task);

    if (isDeleteRequest) {
      if (approve) {
        await this.prisma.taskOrganization.deleteMany({ where: { taskId } });
        await this.prisma.taskOrgReview.deleteMany({ where: { taskId } });
        await this.clearTaskSyncedPlans(taskId);
        const deleted = await this.prisma.task.delete({ where: { id: taskId } });
        await this.appendTaskLog({
          action: 'TASK_DELETE_REQUEST_APPROVED',
          taskId,
          organizationId: task.primaryOrgId ?? null,
          actorId: reviewerId,
          detailZh: `团委批准删除活动：${task.titleZh}`,
          detailEn: `League approved activity delete: ${task.titleEn}`,
          detailRu: `Комитет одобрил удаление: ${task.titleRu}`,
        });
        await this.prisma.notification.create({
          data: {
            userId: task.creatorId,
            titleZh: '活动删除申请已通过',
            titleEn: 'Delete request approved',
            titleRu: 'Запрос на удаление одобрен',
            bodyZh: task.titleZh,
            bodyEn: task.titleEn,
            bodyRu: task.titleRu,
          },
        });
        return { ...deleted, approvalStatus: 'DELETED' };
      }

      const rejected = await (this.prisma.task as any).update({
        where: { id: taskId },
        data: {
          approvalStatus: APPROVAL.REJECTED,
          reviewedById: reviewerId,
          reviewNote: reason?.trim() || '删除申请未通过',
        },
      });
      await this.syncTaskTimelineMirror(taskId);
      await this.appendTaskLog({
        action: 'TASK_DELETE_REQUEST_REJECTED',
        taskId,
        organizationId: task.primaryOrgId ?? null,
        actorId: reviewerId,
        detailZh: `团委驳回删除申请：${reason?.trim() || '未填写原因'}`,
        detailEn: `League rejected delete request: ${reason?.trim() || 'No reason'}`,
        detailRu: `Комитет отклонил удаление: ${reason?.trim() || 'Без причины'}`,
      });
      await this.prisma.notification.create({
        data: {
          userId: task.creatorId,
          titleZh: '活动删除申请被驳回',
          titleEn: 'Delete request rejected',
          titleRu: 'Запрос на удаление отклонен',
          bodyZh: task.titleZh,
          bodyEn: task.titleEn,
          bodyRu: task.titleRu,
          taskId,
        },
      });
      return rejected;
    }

    const updated = await (this.prisma.task as any).update({
      where: { id: taskId },
      data: approve
        ? {
            reviewedById: reviewerId,
            approvedAt: new Date(),
            reviewNote: reason?.trim() || '已通过团委审核',
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
    await this.syncTaskTimelineMirror(taskId);

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

    await this.appendTaskLog({
      action: approve ? 'TASK_REVIEWED_BY_LEAGUE_APPROVE' : 'TASK_REVIEWED_BY_LEAGUE_REJECT',
      taskId,
      organizationId: updated.primaryOrgId ?? null,
      actorId: reviewerId,
      detailZh: approve ? '团委审核通过' : `团委审核驳回：${reason?.trim() || '未填写原因'}`,
      detailEn: approve ? 'Approved by league admin' : `Rejected by league admin: ${reason?.trim() || 'No reason'}`,
      detailRu: approve ? 'Одобрено комитетом' : `Отклонено комитетом: ${reason?.trim() || 'Без причины'}`,
    });

    if (approve && finalized?.approvalStatus === APPROVAL.APPROVED) {
      await this.sendTaskPublishedNotifications(updated.id, updated.source, [updated.creatorId]);
    }

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
    await this.syncTaskTimelineMirror(taskId);
    await this.appendTaskLog({
      action: approve ? 'TASK_REVIEWED_BY_COORG_APPROVE' : 'TASK_REVIEWED_BY_COORG_REJECT',
      taskId,
      organizationId: finalized?.primaryOrgId ?? null,
      actorId: reviewerId,
      detailZh: approve ? '协办社团审核通过' : `协办社团驳回：${reason?.trim() || '未填写原因'}`,
      detailEn: approve ? 'Approved by co-organizer' : `Rejected by co-organizer: ${reason?.trim() || 'No reason'}`,
      detailRu: approve ? 'Одобрено соорганизатором' : `Отклонено соорганизатором: ${reason?.trim() || 'Без причины'}`,
    });
    if (approve && finalized?.approvalStatus === APPROVAL.APPROVED) {
      await this.sendTaskPublishedNotifications(taskId, finalized.source);
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
    if (effectiveRole === UserRole.ORG_ADMIN && dto.relatedOrgIds?.length) {
      const invalid = dto.relatedOrgIds.filter((id) => !managedOrgIds.includes(id));
      if (invalid.length > 0) {
        throw new ForbiddenException('Org admin can only attach managed organizations');
      }
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

    if (task.approvalStatus !== APPROVAL.APPROVED) {
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
    await this.syncTaskTimelineMirror(task.id);

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

    if (task.approvalStatus === APPROVAL.APPROVED) {
      await this.sendTaskPublishedNotifications(task.id, task.source, dto.assigneeId ? [dto.assigneeId] : []);
    }

    await this.appendTaskLog({
      action: 'TASK_CREATED',
      taskId: task.id,
      organizationId: task.primaryOrgId ?? null,
      actorId: userId,
      detailZh: `创建活动：${task.titleZh}`,
      detailEn: `Activity created: ${task.titleEn}`,
      detailRu: `Создано мероприятие: ${task.titleRu}`,
    });

    return task;
  }

  async update(
    userId: string,
    role: UserRole,
    taskId: string,
    dto: {
      titleZh?: string;
      titleEn?: string;
      titleRu?: string;
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
    const task = await (this.prisma.task as any).findUnique({
      where: { id: taskId },
      include: { relatedOrgs: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    let orgManaged = false;
    let managedOrgIds: string[] = [];
    if (role !== UserRole.LEAGUE_ADMIN) {
      managedOrgIds = await this.authorization.managedOrgIds(userId);
      orgManaged = managedOrgIds.length > 0;
      if (!orgManaged) {
        throw new ForbiddenException('Student side cannot edit activity tasks');
      }
      if (task.source !== SOURCE.ORG_REQUEST) {
        throw new ForbiddenException('Only organization requests can be edited');
      }
      const inManaged = await this.inManagedScope(taskId, task.primaryOrgId, managedOrgIds);
      if (!inManaged) throw new ForbiddenException('No permission to edit this task');
      if (task.approvalStatus === APPROVAL.APPROVED) {
        throw new ForbiddenException('Approved activity cannot be edited');
      }
      if (dto.primaryOrgId && !managedOrgIds.includes(dto.primaryOrgId)) {
        throw new ForbiddenException('primaryOrgId is out of managed scope');
      }
      if (dto.relatedOrgIds?.length) {
        const invalid = dto.relatedOrgIds.filter((id) => !managedOrgIds.includes(id));
        if (invalid.length > 0) {
          throw new ForbiddenException('relatedOrgIds must stay in managed scope');
        }
      }
    }

    const startAt = dto.startAt !== undefined ? this.parseOptionalDate(dto.startAt) : (task.startAt ?? null);
    const endAt = dto.endAt !== undefined ? this.parseOptionalDate(dto.endAt) : (task.endAt ?? null);
    const dueAt = dto.dueAt !== undefined ? this.parseOptionalDate(dto.dueAt) : (endAt ?? task.dueAt ?? null);
    const now = Date.now();
    if (startAt && startAt.getTime() < now - 60 * 1000) {
      throw new BadRequestException('startAt cannot be earlier than now');
    }
    if (endAt && endAt.getTime() < now - 60 * 1000) {
      throw new BadRequestException('endAt cannot be earlier than now');
    }
    if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
      throw new BadRequestException('endAt cannot be earlier than startAt');
    }

    const nextApprovalStatus =
      orgManaged && task.approvalStatus === APPROVAL.REJECTED ? APPROVAL.PENDING : task.approvalStatus;
    const nextReviewNote =
      orgManaged && task.approvalStatus === APPROVAL.REJECTED ? '已更新并重新提交审核' : task.reviewNote;

    await this.prisma.$transaction(async (tx) => {
      await (tx.task as any).update({
        where: { id: taskId },
        data: {
          titleZh: dto.titleZh ?? task.titleZh,
          titleEn: dto.titleEn ?? task.titleEn,
          titleRu: dto.titleRu ?? task.titleRu,
          descZh: dto.descZh ?? task.descZh,
          descEn: dto.descEn ?? task.descEn,
          descRu: dto.descRu ?? task.descRu,
          startAt,
          endAt,
          dueAt,
          assigneeId: dto.assigneeId !== undefined ? dto.assigneeId || null : task.assigneeId,
          primaryOrgId: dto.primaryOrgId !== undefined ? dto.primaryOrgId || null : task.primaryOrgId,
          approvalStatus: nextApprovalStatus,
          reviewedById: nextApprovalStatus === APPROVAL.PENDING ? null : task.reviewedById,
          approvedAt: nextApprovalStatus === APPROVAL.PENDING ? null : task.approvedAt,
          reviewNote: nextReviewNote,
        },
      });

      if (dto.relatedOrgIds) {
        await tx.taskOrganization.deleteMany({ where: { taskId } });
        if (dto.relatedOrgIds.length > 0) {
          await tx.taskOrganization.createMany({
            data: dto.relatedOrgIds.map((organizationId) => ({ taskId, organizationId })),
            skipDuplicates: true,
          });
        }
        if (task.source === SOURCE.ORG_REQUEST) {
          await (tx.taskOrgReview as any).deleteMany({ where: { taskId } });
          if (dto.relatedOrgIds.length > 0) {
            await (tx.taskOrgReview as any).createMany({
              data: dto.relatedOrgIds.map((organizationId) => ({
                taskId,
                organizationId,
                status: ORG_REVIEW.PENDING,
                reviewerId: null,
                reviewedAt: null,
                reason: '',
              })),
              skipDuplicates: true,
            });
          }
        }
      }
    });

    const updated = await (this.prisma.task as any).findUnique({
      where: { id: taskId },
      include: {
        primaryOrg: true,
        relatedOrgs: { include: { organization: true } },
        orgReviews: true,
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    await this.appendTaskLog({
      action: orgManaged && task.approvalStatus === APPROVAL.REJECTED ? 'TASK_RESUBMITTED' : 'TASK_UPDATED',
      taskId,
      organizationId: updated?.primaryOrgId ?? task.primaryOrgId,
      actorId: userId,
      detailZh: `更新活动：${updated?.titleZh ?? task.titleZh}`,
      detailEn: `Updated activity: ${updated?.titleEn ?? task.titleEn}`,
      detailRu: `Обновлено мероприятие: ${updated?.titleRu ?? task.titleRu}`,
    });

    await this.syncTaskTimelineMirror(taskId);

    return updated;
  }

  async updateStatus(userId: string, role: UserRole, taskId: string, status: TaskStatus) {
    const task = await (this.prisma.task as any).findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException();
    if (task.approvalStatus !== APPROVAL.APPROVED) {
      throw new ForbiddenException('Only approved activities can update progress');
    }

    const from = task.status as TaskStatus;
    const same = from === status;
    const allowedNext =
      (from === TaskStatus.TODO && status === TaskStatus.IN_PROGRESS) ||
      (from === TaskStatus.IN_PROGRESS && status === TaskStatus.DONE) ||
      (from === TaskStatus.DONE && status === TaskStatus.TODO) ||
      (from === TaskStatus.BLOCKED && status === TaskStatus.IN_PROGRESS);
    if (!same && !allowedNext) {
      throw new BadRequestException('Invalid status transition: TODO -> IN_PROGRESS -> DONE');
    }

    if (role === UserRole.LEAGUE_ADMIN) {
      const updated = await this.prisma.task.update({ where: { id: taskId }, data: { status } });
      await this.appendTaskLog({
        action: 'TASK_STATUS_CHANGED',
        taskId,
        organizationId: updated.primaryOrgId ?? null,
        actorId: userId,
        detailZh: `任务状态：${from} -> ${status}`,
        detailEn: `Task status: ${from} -> ${status}`,
        detailRu: `Статус задачи: ${from} -> ${status}`,
      });
      return updated;
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

    const updated = await this.prisma.task.update({ where: { id: taskId }, data: { status } });
    await this.appendTaskLog({
      action: 'TASK_STATUS_CHANGED',
      taskId,
      organizationId: updated.primaryOrgId ?? null,
      actorId: userId,
      detailZh: `任务状态：${from} -> ${status}`,
      detailEn: `Task status: ${from} -> ${status}`,
      detailRu: `Статус задачи: ${from} -> ${status}`,
    });
    return updated;
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
      if (task.approvalStatus === APPROVAL.PENDING) {
        throw new BadRequestException('Task is already pending review');
      }

      const pendingDelete = await (this.prisma.task as any).update({
        where: { id: taskId },
        data: {
          approvalStatus: APPROVAL.PENDING,
          reviewedById: null,
          approvedAt: null,
          reviewNote: `${DELETE_REQUEST_PREFIX}社团发起删除申请`,
        },
      });
      await this.clearTaskSyncedPlans(taskId);
      await this.appendTaskLog({
        action: 'TASK_DELETE_REQUEST_SUBMITTED',
        taskId,
        organizationId: task.primaryOrgId ?? null,
        actorId: userId,
        detailZh: `提交删除申请：${task.titleZh}`,
        detailEn: `Delete request submitted: ${task.titleEn}`,
        detailRu: `Отправлен запрос на удаление: ${task.titleRu}`,
      });
      const leagueAdmins = await this.prisma.user.findMany({
        where: { role: UserRole.LEAGUE_ADMIN },
        select: { id: true },
      });
      if (leagueAdmins.length > 0) {
        await this.prisma.notification.createMany({
          data: leagueAdmins.map((admin) => ({
            userId: admin.id,
            titleZh: '收到活动删除申请',
            titleEn: 'Delete request submitted',
            titleRu: 'Поступил запрос на удаление',
            bodyZh: task.titleZh,
            bodyEn: task.titleEn,
            bodyRu: task.titleRu,
            taskId,
          })),
        });
      }
      return pendingDelete;
    }

    await this.prisma.taskOrganization.deleteMany({
      where: { taskId },
    });
    await this.appendTaskLog({
      action: 'TASK_DELETED',
      taskId,
      organizationId: task.primaryOrgId ?? null,
      actorId: userId,
      detailZh: `删除活动：${task.titleZh}`,
      detailEn: `Deleted activity: ${task.titleEn}`,
      detailRu: `Удалено мероприятие: ${task.titleRu}`,
    });
    await this.clearTaskSyncedPlans(taskId);

    return this.prisma.task.delete({
      where: { id: taskId },
    });
  }

  async changeLogs(
    userId: string,
    role: UserRole,
    query: { organizationId?: string; taskId?: string; limit?: number },
  ) {
    const take = Math.max(1, Math.min(100, Number(query.limit ?? 20)));
    const where: Record<string, unknown> = { logType: 'TASK' };
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.taskId) where.taskId = query.taskId;

    if (role !== UserRole.LEAGUE_ADMIN) {
      const managedOrgIds = await this.authorization.managedOrgIds(userId);
      if (managedOrgIds.length === 0) throw new ForbiddenException('No permission to view task logs');
      if (query.organizationId && !managedOrgIds.includes(query.organizationId)) {
        throw new ForbiddenException('No permission to view organization logs');
      }
      if (query.taskId) {
        const task = await this.prisma.task.findUnique({
          where: { id: query.taskId },
          select: { primaryOrgId: true },
        });
        if (!task || !task.primaryOrgId || !managedOrgIds.includes(task.primaryOrgId)) {
          throw new ForbiddenException('No permission to view this task logs');
        }
      } else if (!query.organizationId) {
        where.organizationId = { in: managedOrgIds };
      }
    }

    return (this.prisma.activityChangeLog as any).findMany({
      where,
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}