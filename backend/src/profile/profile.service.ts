import { Injectable, NotFoundException } from '@nestjs/common';
import { ProfileReviewStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService) {}

  async getOrCreate(userId: string) {
    let p = await this.prisma.profile.findUnique({
      where: { userId },
      include: { awards: true, tags: true },
    });
    if (!p) {
      p = await this.prisma.profile.create({
        data: { userId },
        include: { awards: true, tags: true },
      });
    }
    return p;
  }

  async updateMe(
    userId: string,
    dto: { githubUrl?: string; identityZh?: string; identityEn?: string; identityRu?: string },
  ) {
    await this.getOrCreate(userId);
    return this.prisma.profile.update({
      where: { userId },
      data: {
        githubUrl: dto.githubUrl,
        identityZh: dto.identityZh,
        identityEn: dto.identityEn,
        identityRu: dto.identityRu,
        reviewStatus: ProfileReviewStatus.PENDING,
        rejectReason: null,
      },
      include: { awards: true, tags: true },
    });
  }

  addAward(
    userId: string,
    dto: { titleZh: string; titleEn: string; titleRu: string; proofUrl?: string },
  ) {
    return this.prisma.award.create({
      data: {
        profileUserId: userId,
        titleZh: dto.titleZh,
        titleEn: dto.titleEn,
        titleRu: dto.titleRu,
        proofUrl: dto.proofUrl,
      },
    });
  }

  async removeAward(userId: string, awardId: string) {
    await this.prisma.award.deleteMany({ where: { id: awardId, profileUserId: userId } });
    return { ok: true };
  }

  addTag(
    userId: string,
    dto: {
      categoryZh: string;
      categoryEn: string;
      categoryRu: string;
      nameZh: string;
      nameEn: string;
      nameRu: string;
    },
  ) {
    return this.prisma.skillTag.create({
      data: { profileUserId: userId, ...dto },
    });
  }

  async removeTag(userId: string, tagId: string) {
    await this.prisma.skillTag.deleteMany({ where: { id: tagId, profileUserId: userId } });
    return { ok: true };
  }

  listPendingReviews() {
    return this.prisma.profile.findMany({
      where: { reviewStatus: ProfileReviewStatus.PENDING },
      include: {
        user: { select: { id: true, name: true, email: true, studentId: true } },
        awards: true,
        tags: true,
      },
    });
  }

  async review(userId: string, dto: { approve: boolean; reason?: string }) {
    const exists = await this.prisma.profile.findUnique({ where: { userId } });
    if (!exists) throw new NotFoundException();
    return this.prisma.profile.update({
      where: { userId },
      data: {
        reviewStatus: dto.approve ? ProfileReviewStatus.APPROVED : ProfileReviewStatus.REJECTED,
        rejectReason: dto.approve ? null : dto.reason ?? 'Rejected',
      },
    });
  }
}
