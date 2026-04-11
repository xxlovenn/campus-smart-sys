import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProfileReviewStatus, UserRole } from '@prisma/client';
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
