import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaskStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  private async memberOrgIds(userId: string) {
    const rows = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    return rows.map((r) => r.organizationId);
  }

  async listVisible(userId: string, role: UserRole) {
    if (role === UserRole.LEAGUE_ADMIN) {
      return this.prisma.task.findMany({
        include: {
          primaryOrg: true,
          relatedOrgs: { include: { organization: true } },
          assignee: { select: { id: true, name: true, email: true } },
          creator: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ endAt: 'asc' }, { dueAt: 'asc' }],
      });
    }

    const orgIds = await this.memberOrgIds(userId);

    if (role === UserRole.ORG_ADMIN) {
      return this.prisma.task.findMany({
        where: {
          OR: [
            { primaryOrgId: { in: orgIds } },
            { relatedOrgs: { some: { organizationId: { in: orgIds } } } },
            { assigneeId: userId },
            { creatorId: userId },
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

    return this.prisma.task.findMany({
      where: {
        OR: [{ assigneeId: userId }, { creatorId: userId }],
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
    const grouped = await this.prisma.task.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const tasks = await this.prisma.task.findMany({
      include: {
        primaryOrg: true,
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ endAt: 'asc' }, { dueAt: 'asc' }],
    });

    return { grouped, tasks };
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
    if (role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot create org tasks');
    }

    const orgIds = await this.memberOrgIds(userId);

    if (role === UserRole.ORG_ADMIN) {
      if (!dto.primaryOrgId || !orgIds.includes(dto.primaryOrgId)) {
        throw new ForbiddenException('Invalid primary organization');
      }
    }

    if (role === UserRole.LEAGUE_ADMIN && !dto.primaryOrgId) {
      throw new ForbiddenException('primaryOrgId is required');
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

    const task = await this.prisma.task.create({
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

    if (dto.assigneeId) {
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
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException();

    if (role === UserRole.LEAGUE_ADMIN) {
      return this.prisma.task.update({ where: { id: taskId }, data: { status } });
    }

    const orgIds = await this.memberOrgIds(userId);
    const isAssignee = task.assigneeId === userId;
    const isCreator = task.creatorId === userId;
    const inPrimaryOrg = !!(task.primaryOrgId && orgIds.includes(task.primaryOrgId));
    const inRelatedOrg = !!(await this.prisma.taskOrganization.findFirst({
      where: { taskId, organizationId: { in: orgIds } },
    }));

    if (role === UserRole.ORG_ADMIN) {
      if (!isAssignee && !isCreator && !inPrimaryOrg && !inRelatedOrg) {
        throw new ForbiddenException('No permission to update this task');
      }
      return this.prisma.task.update({ where: { id: taskId }, data: { status } });
    }

    if (!isAssignee && !isCreator) {
      throw new ForbiddenException('Students can only manage their own tasks');
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

    if (role === UserRole.STUDENT && task.creatorId !== userId) {
      throw new ForbiddenException('Students can only delete tasks created by self');
    }

    if (role === UserRole.ORG_ADMIN && task.creatorId !== userId) {
      throw new ForbiddenException('Org admin can only delete tasks created by self');
    }

    if (role === UserRole.LEAGUE_ADMIN && task.creatorId !== userId) {
      throw new ForbiddenException('League admin can only delete tasks created by self');
    }

    await this.prisma.taskOrganization.deleteMany({
      where: { taskId },
    });

    return this.prisma.task.delete({
      where: { id: taskId },
    });
  }
}