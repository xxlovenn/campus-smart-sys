import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  private normalizeEmail(value: string) {
    return value.trimEnd().toLowerCase();
  }

  private normalizePassword(value: string) {
    return value.trimEnd();
  }

  async login(email: string, password: string) {
    const normalizedEmail = this.normalizeEmail(email);
    const normalizedPassword = this.normalizePassword(password);
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(normalizedPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const token = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        studentId: user.studentId,
      },
    };
  }

  async register(email: string, password: string) {
    const normalizedEmail = this.normalizeEmail(email);
    const normalizedPassword = this.normalizePassword(password);
    if (normalizedPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    const exists = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (exists) {
      throw new BadRequestException('Account already exists');
    }

    const passwordHash = await bcrypt.hash(normalizedPassword, 10);
    const nameSeed = normalizedEmail.split('@')[0] || 'student';
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: `${nameSeed}同学`,
        role: UserRole.STUDENT,
        isOrgAccount: false,
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });
    return {
      ok: true,
      user,
    };
  }
}
