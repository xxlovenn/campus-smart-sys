import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Simulated school timetable API: merges DB rows with a static mock slice. */
@Injectable()
export class TimetableService {
  constructor(private prisma: PrismaService) {}

  async getMerged(userId: string) {
    const db = await this.prisma.scheduleEntry.findMany({
      where: { userId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
    const mock = [
      {
        id: 'mock-1',
        userId,
        courseZh: '校园智慧系统（模拟接口）',
        courseEn: 'Campus smart system (mock API)',
        courseRu: 'Умный кампус (mock API)',
        weekday: 5,
        startTime: '10:00',
        endTime: '11:40',
        locationZh: '线上 / 实验室',
        locationEn: 'Online / Lab',
        locationRu: 'Онлайн / лаб.',
        source: 'MOCK_API' as const,
      },
    ];
    return { entries: [...db.map((e) => ({ ...e, source: 'DB' as const })), ...mock] };
  }

  /** Pull mock school API and persist as optional sync */
  async syncFromMock(userId: string) {
    const rows = [
      {
        userId,
        courseZh: '创新创业实践（同步）',
        courseEn: 'Innovation practice (synced)',
        courseRu: 'Инновационная практика',
        weekday: 2,
        startTime: '16:00',
        endTime: '17:40',
        locationZh: '创客空间',
        locationEn: 'Maker space',
        locationRu: 'Мейкерспейс',
      },
    ];
    for (const r of rows) {
      await this.prisma.scheduleEntry.create({ data: r });
    }
    return this.getMerged(userId);
  }
}
