import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RemindersService {
  constructor(private prisma: PrismaService) {}

  async upcomingForUser(userId: string) {
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 86400000);
    const [plans, tasks] = await Promise.all([
      this.prisma.personalPlan.findMany({
        where: { userId, dueAt: { gte: now, lte: week } },
        orderBy: { dueAt: 'asc' },
      }),
      this.prisma.task.findMany({
        where: {
          OR: [{ assigneeId: userId }, { creatorId: userId }],
          dueAt: { gte: now, lte: week },
        },
        orderBy: { dueAt: 'asc' },
      }),
    ]);
    return { plans, tasks, windowDays: 7 };
  }
}
