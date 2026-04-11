import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { resolveEffectiveRole } from '../authorization/permission.policy';
import { PrismaService } from '../prisma/prisma.service';

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
      const rows = await this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      return Promise.all(rows.map(async (row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        role: resolveEffectiveRole(row.role, (await this.authorization.managedOrgIds(row.id)).length),
      })));
    }

    const managedOrgIds = await this.authorization.managedOrgIds(userId);
    if (managedOrgIds.length === 0) {
      const me = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true },
      });
      return me ? [{ ...me, role: UserRole.STUDENT }] : [];
    }

    const rows = await this.prisma.user.findMany({
      where: {
        memberships: {
          some: { organizationId: { in: managedOrgIds } },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return Promise.all(rows.map(async (row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
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
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          studentId: true,
          phone: true,
          createdAt: true,
        },
      }),
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