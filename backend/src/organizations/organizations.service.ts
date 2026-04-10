import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  listForUser(userId: string, role: UserRole) {
    if (role === UserRole.LEAGUE_ADMIN) {
      return this.prisma.organization.findMany({ orderBy: { createdAt: 'desc' } });
    }
    return this.prisma.organization.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: {
    nameZh: string;
    nameEn: string;
    nameRu: string;
    typeZh: string;
    typeEn: string;
    typeRu: string;
  }) {
    return this.prisma.organization.create({ data });
  }
}
