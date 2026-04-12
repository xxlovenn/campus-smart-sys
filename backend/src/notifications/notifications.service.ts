import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        task: {
          select: {
            source: true,
            primaryOrg: {
              select: {
                nameZh: true,
                nameEn: true,
                nameRu: true,
              },
            },
          },
        },
      },
    });

    return rows.map((row) => {
      const titleText = `${row.titleZh} ${row.titleEn} ${row.titleRu}`.toLowerCase();
      const isReviewResult =
        /(审核|申请|驳回|通过|approved|rejected|review|waiting|одобр|отклон|заявк|согласован)/i.test(
          titleText,
        );
      const notificationType = isReviewResult
        ? 'REVIEW_RESULT'
        : row.task?.source === 'LEAGUE_PUBLISHED'
          ? 'LEAGUE_PUBLISH'
          : row.task?.source === 'ORG_REQUEST'
            ? 'ORG_PUBLISH'
            : 'REVIEW_RESULT';

      const org = row.task?.primaryOrg;
      const publisher =
        org != null
          ? { zh: org.nameZh, en: org.nameEn, ru: org.nameRu }
          : row.task?.source === 'LEAGUE_PUBLISHED'
            ? { zh: '校团委', en: 'League Committee', ru: 'Комитет лиги' }
            : { zh: '系统通知', en: 'System', ru: 'Система' };

      return {
        ...row,
        notificationType,
        publisherZh: publisher.zh,
        publisherEn: publisher.en,
        publisherRu: publisher.ru,
      };
    });
  }

  markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }
}
