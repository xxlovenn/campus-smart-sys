import { Injectable } from '@nestjs/common';
import { PlanPriority, PlanSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

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
      syncedToTimeline?: boolean;
    },
  ) {
    return this.prisma.personalPlan.create({
      data: {
        userId,
        titleZh: dto.titleZh,
        titleEn: dto.titleEn,
        titleRu: dto.titleRu,
        priority: dto.priority ?? PlanPriority.MEDIUM,
        source: dto.source ?? PlanSource.PERSONAL,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        syncedToTimeline: dto.syncedToTimeline ?? true,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.prisma.personalPlan.deleteMany({ where: { id, userId } });
    return { ok: true };
  }
}
