import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { resolveEffectiveRole } from '../authorization/permission.policy';
import { PrismaService } from '../prisma/prisma.service';

type UserListRow = {
  id: string;
  email: string;
  name: string;
  grade: string | null;
  major: string | null;
  className: string | null;
  role: UserRole;
};

type CurrentUserRow = {
  id: string;
  email: string;
  name: string;
  studentId: string | null;
  phone: string | null;
  grade: string | null;
  major: string | null;
  className: string | null;
  createdAt: Date;
};

@Controller('users')
export class UsersController {
  constructor(
    private prisma: PrismaService,
    private authorization: AuthorizationService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(
    @Req() req: { user: { id: string; role: UserRole; platformRole?: UserRole } },
  ) {
    const userId = req.user.id;
    const platformRole = req.user.platformRole ?? req.user.role;

    if (platformRole === UserRole.LEAGUE_ADMIN) {
      const rows = await (this.prisma.user as any).findMany({
        select: {
          id: true,
          email: true,
          name: true,
          grade: true,
          major: true,
          className: true,
          role: true,
        },
        orderBy: { createdAt: 'asc' },
      }) as UserListRow[];
      return Promise.all(rows.map(async (row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        grade: row.grade,
        major: row.major,
        className: row.className,
        role: resolveEffectiveRole(row.role, (await this.authorization.managedOrgIds(row.id)).length),
      })));
    }

    const managedOrgIds = await this.authorization.managedOrgIds(userId);
    if (managedOrgIds.length === 0) {
      const me = await (this.prisma.user as any).findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, grade: true, major: true, className: true },
      }) as Omit<UserListRow, 'role'> | null;
      return me ? [{ ...me, role: UserRole.STUDENT }] : [];
    }

    const rows = await (this.prisma.user as any).findMany({
      where: {
        memberships: {
          some: { organizationId: { in: managedOrgIds } },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        grade: true,
        major: true,
        className: true,
        role: true,
      },
      orderBy: { createdAt: 'asc' },
    }) as UserListRow[];

    return Promise.all(rows.map(async (row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      grade: row.grade,
      major: row.major,
      className: row.className,
      role: resolveEffectiveRole(row.role, (await this.authorization.managedOrgIds(row.id)).length),
    })));
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: { user: { id: string; role: UserRole; platformRole?: UserRole } }) {
    const userId = req.user.id;
    const platformRole = req.user.platformRole ?? req.user.role;
    const [managedOrgIds, memberOrgIds, user] = await Promise.all([
      this.authorization.managedOrgIds(userId),
      this.authorization.memberOrgIds(userId),
      (this.prisma.user as any).findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          studentId: true,
          phone: true,
          grade: true,
          major: true,
          className: true,
          createdAt: true,
        },
      }) as Promise<CurrentUserRow | null>,
    ]);

    if (!user) return null;
    return {
      ...user,
      role: resolveEffectiveRole(platformRole, managedOrgIds.length),
      platformRole,
      managedOrgIds,
      memberOrgIds,
    };
  }
}