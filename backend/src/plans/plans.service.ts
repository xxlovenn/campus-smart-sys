import { BadRequestException, Injectable } from '@nestjs/common';
import { PlanPriority, PlanSource, PlanStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  private toDateOrUndefined(value?: string) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid datetime format');
    }
    return date;
  }

  list(userId: string) {
    return this.prisma.personalPlan.findMany({
      where: { userId },
      orderBy: { dueAt: 'asc' },
    });
  }

  timeline(userId: string) {
    return this.prisma.personalPlan.findMany({
      where: { userId, syncedToTimeline: true },
      orderBy: { dueAt: 'asc' },
    });
  }

  create(
    userId: string,
    dto: {
      titleZh: string;
      titleEn: string;
      titleRu: string;
      priority?: PlanPriority;
      source?: PlanSource;
      dueAt?: string;
      startAt?: string;
      endAt?: string;
      noteZh?: string;
      noteEn?: string;
      noteRu?: string;
      status?: PlanStatus;
      syncedToTimeline?: boolean;
    },
  ) {
    const startAt = this.toDateOrUndefined(dto.startAt);
    const endAt = this.toDateOrUndefined(dto.endAt);
    const dueAt = this.toDateOrUndefined(dto.dueAt) ?? endAt;
    if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
      throw new BadRequestException('endAt cannot be earlier than startAt');
    }
    return this.prisma.personalPlan.create({
      data: {
        userId,
        titleZh: dto.titleZh,
        titleEn: dto.titleEn,
        titleRu: dto.titleRu,
        priority: dto.priority ?? PlanPriority.MEDIUM,
        status: dto.status ?? PlanStatus.TODO,
        source: dto.source ?? PlanSource.PERSONAL,
        noteZh: dto.noteZh ?? '',
        noteEn: dto.noteEn ?? '',
        noteRu: dto.noteRu ?? '',
        startAt,
        endAt,
        dueAt,
        syncedToTimeline: dto.syncedToTimeline ?? true,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.prisma.personalPlan.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  async update(
    userId: string,
    id: string,
    dto: {
      titleZh?: string;
      titleEn?: string;
      titleRu?: string;
      priority?: PlanPriority;
      dueAt?: string;
      startAt?: string;
      endAt?: string;
      noteZh?: string;
      noteEn?: string;
      noteRu?: string;
      status?: PlanStatus;
      syncedToTimeline?: boolean;
    },
  ) {
    const current = await this.prisma.personalPlan.findFirst({ where: { id, userId } });
    if (!current) throw new BadRequestException('Plan not found');
    const startAt = dto.startAt !== undefined ? this.toDateOrUndefined(dto.startAt) : current.startAt ?? undefined;
    const endAt = dto.endAt !== undefined ? this.toDateOrUndefined(dto.endAt) : current.endAt ?? undefined;
    const dueAt = dto.dueAt !== undefined ? this.toDateOrUndefined(dto.dueAt) : current.dueAt ?? undefined;
    if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
      throw new BadRequestException('endAt cannot be earlier than startAt');
    }
    return this.prisma.personalPlan.update({
      where: { id: current.id },
      data: {
        titleZh: dto.titleZh ?? current.titleZh,
        titleEn: dto.titleEn ?? current.titleEn,
        titleRu: dto.titleRu ?? current.titleRu,
        priority: dto.priority ?? current.priority,
        status: dto.status ?? current.status,
        noteZh: dto.noteZh ?? current.noteZh,
        noteEn: dto.noteEn ?? current.noteEn,
        noteRu: dto.noteRu ?? current.noteRu,
        startAt,
        endAt,
        dueAt,
        syncedToTimeline: dto.syncedToTimeline ?? current.syncedToTimeline,
      },
    });
  }
}
