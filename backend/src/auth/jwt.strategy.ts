import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { OrganizationMemberRole, UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { resolveEffectiveRole } from '../authorization/permission.policy';

export type JwtPayload = { sub: string; email: string; role: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'dev-secret-change-me',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        memberships: {
          where: { memberRole: OrganizationMemberRole.ORG_ADMIN },
          select: { organizationId: true },
        },
      },
    });
    if (!user) throw new UnauthorizedException();
    const effectiveRole = resolveEffectiveRole(user.role as UserRole, user.memberships.length);
    return {
      id: user.id,
      email: user.email,
      role: effectiveRole,
      platformRole: user.role,
      managedOrgIds: user.memberships.map((m) => m.organizationId),
    };
  }
}
