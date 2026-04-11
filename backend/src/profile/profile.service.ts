import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProfileItemAction, ProfileItemRequestStatus, ProfileReviewStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { DEFAULT_GRADE_OPTIONS, DEFAULT_MAJOR_OPTIONS } from './meta-options.defaults';

@Injectable()
export class ProfileService {
  constructor(
    private prisma: PrismaService,
    private authorization: AuthorizationService,
  ) {}

  private maskIdCard(value?: string | null) {
    if (!value) return null;
    if (value.length <= 8) return `${value.slice(0, 2)}****${value.slice(-2)}`;
    return `${value.slice(0, 4)}********${value.slice(-4)}`;
  }

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
    dto: {
      name?: string;
      studentId?: string;
      phone?: string;
      email?: string;
      grade?: string;
      major?: string;
      githubUrl?: string;
      identityZh?: string;
      identityEn?: string;
      identityRu?: string;
    },
  ) {
    await this.getOrCreate(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        studentId: dto.studentId,
        phone: dto.phone,
        email: dto.email,
      },
    });
    return this.prisma.profile.update({
      where: { userId },
      data: {
        githubUrl: dto.githubUrl,
        identityZh: dto.identityZh,
        identityEn: dto.identityEn,
        identityRu: dto.identityRu,
      },
      include: { awards: true, tags: true },
    });
  }

  addAward(
    userId: string,
    dto: { titleZh: string; titleEn: string; titleRu: string; proofUrl?: string },
  ) {
    return this.prisma.awardChangeRequest.create({
      data: {
        userId,
        action: ProfileItemAction.ADD,
        titleZh: dto.titleZh,
        titleEn: dto.titleEn,
        titleRu: dto.titleRu,
        proofUrl: dto.proofUrl,
        status: ProfileItemRequestStatus.PENDING,
      },
    });
  }

  async removeAward(userId: string, awardId: string) {
    const award = await this.prisma.award.findFirst({ where: { id: awardId, profileUserId: userId } });
    if (!award) throw new NotFoundException('Award not found');
    const dup = await this.prisma.awardChangeRequest.findFirst({
      where: {
        userId,
        awardId,
        action: ProfileItemAction.DELETE,
        status: ProfileItemRequestStatus.PENDING,
      },
      select: { id: true },
    });
    if (dup) throw new BadRequestException('Delete request already pending');
    await this.prisma.awardChangeRequest.create({
      data: {
        userId,
        awardId,
        action: ProfileItemAction.DELETE,
        titleZh: award.titleZh,
        titleEn: award.titleEn,
        titleRu: award.titleRu,
        proofUrl: award.proofUrl,
      },
    });
    return { ok: true, pending: true };
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
    return this.prisma.tagChangeRequest.create({
      data: {
        userId,
        action: ProfileItemAction.ADD,
        categoryZh: dto.categoryZh,
        categoryEn: dto.categoryEn,
        categoryRu: dto.categoryRu,
        nameZh: dto.nameZh,
        nameEn: dto.nameEn,
        nameRu: dto.nameRu,
        status: ProfileItemRequestStatus.PENDING,
      },
    });
  }

  async removeTag(userId: string, tagId: string) {
    const tag = await this.prisma.skillTag.findFirst({ where: { id: tagId, profileUserId: userId } });
    if (!tag) throw new NotFoundException('Tag not found');
    const dup = await this.prisma.tagChangeRequest.findFirst({
      where: {
        userId,
        tagId,
        action: ProfileItemAction.DELETE,
        status: ProfileItemRequestStatus.PENDING,
      },
      select: { id: true },
    });
    if (dup) throw new BadRequestException('Delete request already pending');
    await this.prisma.tagChangeRequest.create({
      data: {
        userId,
        tagId,
        action: ProfileItemAction.DELETE,
        categoryZh: tag.categoryZh,
        categoryEn: tag.categoryEn,
        categoryRu: tag.categoryRu,
        nameZh: tag.nameZh,
        nameEn: tag.nameEn,
        nameRu: tag.nameRu,
      },
    });
    return { ok: true, pending: true };
  }

  async myItemRequests(userId: string) {
    const [awardRequests, tagRequests] = await Promise.all([
      this.prisma.awardChangeRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tagChangeRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { awardRequests, tagRequests };
  }

  async listPendingItemRequests() {
    const [awardRequests, tagRequests] = await Promise.all([
      this.prisma.awardChangeRequest.findMany({
        where: { status: ProfileItemRequestStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { id: true, name: true, email: true, studentId: true } },
        },
      }),
      this.prisma.tagChangeRequest.findMany({
        where: { status: ProfileItemRequestStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { id: true, name: true, email: true, studentId: true } },
        },
      }),
    ]);
    return { awardRequests, tagRequests };
  }

  async submitGradeMajorRequest(userId: string, grade?: string, major?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, grade: true, major: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const toGrade = grade?.trim() || null;
    const toMajor = major?.trim() || null;
    if (toGrade === (user.grade ?? null) && toMajor === (user.major ?? null)) {
      throw new BadRequestException('No grade/major changes detected');
    }

    const pending = await this.prisma.gradeMajorChangeRequest.findFirst({
      where: { userId, status: ProfileItemRequestStatus.PENDING },
      select: { id: true },
    });
    if (pending) throw new BadRequestException('A grade/major change request is already pending');

    return this.prisma.gradeMajorChangeRequest.create({
      data: {
        userId,
        fromGrade: user.grade,
        fromMajor: user.major,
        toGrade,
        toMajor,
      },
    });
  }

  async myGradeMajorRequests(userId: string) {
    return this.prisma.gradeMajorChangeRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async pendingGradeMajorRequests() {
    return this.prisma.gradeMajorChangeRequest.findMany({
      where: { status: ProfileItemRequestStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true, studentId: true } },
      },
    });
  }

  async reviewGradeMajorRequest(
    requestId: string,
    dto: { approve: boolean; reason?: string },
    reviewerId: string,
  ) {
    const req = await this.prisma.gradeMajorChangeRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== ProfileItemRequestStatus.PENDING) {
      throw new BadRequestException('Request already reviewed');
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.approve) {
        await tx.user.update({
          where: { id: req.userId },
          data: {
            grade: req.toGrade ?? null,
            major: req.toMajor ?? null,
          },
        });
      }
      await tx.gradeMajorChangeRequest.update({
        where: { id: requestId },
        data: {
          status: dto.approve ? ProfileItemRequestStatus.APPROVED : ProfileItemRequestStatus.REJECTED,
          reason: dto.approve ? null : dto.reason ?? 'Rejected',
          reviewerId,
          reviewedAt: new Date(),
        },
      });
    });
    return { ok: true };
  }

  async reviewAwardRequest(
    requestId: string,
    dto: { approve: boolean; reason?: string },
    reviewerId: string,
  ) {
    const req = await this.prisma.awardChangeRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== ProfileItemRequestStatus.PENDING) {
      throw new BadRequestException('Request already reviewed');
    }
    await this.prisma.$transaction(async (tx) => {
      if (dto.approve) {
        if (req.action === ProfileItemAction.ADD) {
          await tx.award.create({
            data: {
              profileUserId: req.userId,
              titleZh: req.titleZh,
              titleEn: req.titleEn,
              titleRu: req.titleRu,
              proofUrl: req.proofUrl ?? '',
            },
          });
        } else if (req.action === ProfileItemAction.DELETE && req.awardId) {
          await tx.award.deleteMany({
            where: { id: req.awardId, profileUserId: req.userId },
          });
        }
      }
      await tx.awardChangeRequest.update({
        where: { id: requestId },
        data: {
          status: dto.approve ? ProfileItemRequestStatus.APPROVED : ProfileItemRequestStatus.REJECTED,
          reason: dto.approve ? null : dto.reason ?? 'Rejected',
          reviewerId,
          reviewedAt: new Date(),
        },
      });
    });
    return { ok: true };
  }

  async reviewTagRequest(
    requestId: string,
    dto: { approve: boolean; reason?: string },
    reviewerId: string,
  ) {
    const req = await this.prisma.tagChangeRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== ProfileItemRequestStatus.PENDING) {
      throw new BadRequestException('Request already reviewed');
    }
    await this.prisma.$transaction(async (tx) => {
      if (dto.approve) {
        if (req.action === ProfileItemAction.ADD) {
          await tx.skillTag.create({
            data: {
              profileUserId: req.userId,
              categoryZh: req.categoryZh,
              categoryEn: req.categoryEn,
              categoryRu: req.categoryRu,
              nameZh: req.nameZh,
              nameEn: req.nameEn,
              nameRu: req.nameRu,
            },
          });
        } else if (req.action === ProfileItemAction.DELETE && req.tagId) {
          await tx.skillTag.deleteMany({
            where: { id: req.tagId, profileUserId: req.userId },
          });
        }
      }
      await tx.tagChangeRequest.update({
        where: { id: requestId },
        data: {
          status: dto.approve ? ProfileItemRequestStatus.APPROVED : ProfileItemRequestStatus.REJECTED,
          reason: dto.approve ? null : dto.reason ?? 'Rejected',
          reviewerId,
          reviewedAt: new Date(),
        },
      });
    });
    return { ok: true };
  }

  listPendingReviews() {
    return this.prisma.profile.findMany({
      where: {
        reviewStatus: ProfileReviewStatus.PENDING,
        user: { isOrgAccount: false },
      },
      include: {
        user: { select: { id: true, name: true, email: true, studentId: true } },
        awards: true,
        tags: true,
      },
    });
  }

  async reviewStats() {
    const grouped = await this.prisma.profile.groupBy({
      by: ['reviewStatus'],
      where: {
        user: { isOrgAccount: false },
      },
      _count: { _all: true },
    });

    const countByStatus = (status: ProfileReviewStatus) =>
      grouped.find((row) => row.reviewStatus === status)?._count?._all ?? 0;

    const pending = countByStatus(ProfileReviewStatus.PENDING);
    const approved = countByStatus(ProfileReviewStatus.APPROVED);
    const rejected = countByStatus(ProfileReviewStatus.REJECTED);

    return {
      pending,
      approved,
      rejected,
      total: pending + approved + rejected,
    };
  }

  listReviewRecords(limit = 20) {
    return this.prisma.profile.findMany({
      where: {
        reviewStatus: { in: [ProfileReviewStatus.APPROVED, ProfileReviewStatus.REJECTED] },
        user: { isOrgAccount: false },
      },
      include: {
        user: { select: { id: true, name: true, email: true, studentId: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.max(1, Math.min(50, Number(limit) || 20)),
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

  async searchStudents(
    keyword: string,
    mode: 'name' | 'studentId' | 'idCard',
    operatorUserId: string,
    operatorRole: UserRole,
  ) {
    if (operatorRole === UserRole.ORG_ADMIN && mode === 'idCard') {
      throw new ForbiddenException('Org admin can only search by name or studentId');
    }

    const value = keyword.trim();
    const where =
      mode === 'name'
        ? { name: { contains: value, mode: 'insensitive' as const } }
        : mode === 'studentId'
          ? { studentId: { contains: value } }
          : { idCard: { contains: value } };

    const managedOrgIds = operatorRole === UserRole.ORG_ADMIN
      ? await this.authorization.managedOrgIds(operatorUserId)
      : [];

    const users = await this.prisma.user.findMany({
      where: {
        role: { not: UserRole.LEAGUE_ADMIN },
        isOrgAccount: false,
        ...(operatorRole === UserRole.ORG_ADMIN
          ? { memberships: { some: { organizationId: { in: managedOrgIds } } } }
          : {}),
        ...(value ? where : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        isOrgAccount: true,
        studentId: true,
        idCard: true,
        phone: true,
        grade: true,
        major: true,
        className: true,
        profile: {
          select: {
            reviewStatus: true,
            updatedAt: true,
          },
        },
      },
    });

    return users.filter((u) => !u.isOrgAccount).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      studentId: u.studentId,
      idCardMasked: this.maskIdCard(u.idCard),
      phone: u.phone,
      grade: u.grade,
      major: u.major,
      className: u.className,
      reviewStatus: u.profile?.reviewStatus ?? ProfileReviewStatus.PENDING,
      updatedAt: u.profile?.updatedAt ?? null,
    }));
  }

  async getAdminUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        isOrgAccount: true,
        studentId: true,
        idCard: true,
        phone: true,
        grade: true,
        major: true,
        className: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.isOrgAccount) throw new ForbiddenException('Organization account is not a student profile');
    const profile = await this.getOrCreate(userId);
    return { user, profile };
  }

  async adminUpdateUserProfile(
    userId: string,
    dto: {
      name?: string;
      studentId?: string;
      idCard?: string;
      phone?: string;
      grade?: string;
      major?: string;
      className?: string;
      githubUrl?: string;
      identityZh?: string;
      identityEn?: string;
      identityRu?: string;
    },
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.isOrgAccount) {
      throw new ForbiddenException('Organization account is not a student profile');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        studentId: dto.studentId,
        idCard: dto.idCard,
        phone: dto.phone,
        grade: dto.grade,
        major: dto.major,
        className: dto.className,
      },
    });

    await this.getOrCreate(userId);
    await this.prisma.profile.update({
      where: { userId },
      data: {
        githubUrl: dto.githubUrl,
        identityZh: dto.identityZh,
        identityEn: dto.identityEn,
        identityRu: dto.identityRu,
        reviewStatus: ProfileReviewStatus.APPROVED,
        rejectReason: null,
      },
    });

    return this.getAdminUserProfile(userId);
  }

  async listMetaOptions() {
    const [grades, majors] = await Promise.all([
      this.prisma.gradeOption.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.majorOption.findMany({ orderBy: { createdAt: 'asc' } }),
    ]);

    // Hook point for future real upstream API integration:
    // replace/merge these preset defaults with remote options here.
    const gradeMap = new Map<string, { id: string; name: string }>();
    for (const g of grades) gradeMap.set(g.name, { id: g.id, name: g.name });
    for (const name of DEFAULT_GRADE_OPTIONS) {
      if (!gradeMap.has(name)) gradeMap.set(name, { id: `preset-grade-${name}`, name });
    }

    const majorMap = new Map<string, { id: string; name: string }>();
    for (const m of majors) majorMap.set(m.name, { id: m.id, name: m.name });
    for (const name of DEFAULT_MAJOR_OPTIONS) {
      if (!majorMap.has(name)) majorMap.set(name, { id: `preset-major-${name}`, name });
    }

    return {
      grades: Array.from(gradeMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      majors: Array.from(majorMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async addGrade(name: string) {
    const value = name.trim();
    if (!value) throw new BadRequestException('Grade is required');
    return this.prisma.gradeOption.upsert({
      where: { name: value },
      update: {},
      create: { name: value },
    });
  }

  async addMajor(name: string) {
    const value = name.trim();
    if (!value) throw new BadRequestException('Major is required');
    return this.prisma.majorOption.upsert({
      where: { name: value },
      update: {},
      create: { name: value },
    });
  }
}
