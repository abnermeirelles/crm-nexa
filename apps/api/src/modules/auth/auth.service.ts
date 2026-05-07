import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from '@crm-nexa/shared';
import { PrismaAdminService } from '../../common/prisma/prisma-admin.service';
import type { JwtAccessPayload } from './types';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends IssuedTokens {
  user: { id: string; email: string; name: string; role: string };
  tenant: { id: string; slug: string; name: string };
}

// Gerado uma vez no boot — usado no fluxo de login para igualar o tempo de
// resposta entre "user nao existe" e "senha errada" (defesa contra timing
// attack / user enumeration).
const DUMMY_HASH_PROMISE = hashPassword('not-a-real-password').catch(() => null);

function parseDurationToMs(value: string): number {
  const match = /^(\d+)\s*([smhd])$/i.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }
  const n = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const factor: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * factor[unit]!;
}

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);
  private readonly accessTtlSec: number;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly admin: PrismaAdminService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.accessTtlSec =
      parseDurationToMs(this.config.get<string>('jwt.accessTtl') ?? '15m') /
      1_000;
    this.refreshTtlMs = parseDurationToMs(
      this.config.get<string>('jwt.refreshTtl') ?? '7d',
    );
  }

  async login(args: {
    email: string;
    password: string;
    tenantSlug?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<LoginResult> {
    const { email, password, tenantSlug, ip, userAgent } = args;

    const candidates = await this.admin.user.findMany({
      where: {
        email,
        deletedAt: null,
        ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}),
      },
      include: { tenant: true },
    });

    if (candidates.length > 1) {
      // Mesmo email em multiplos tenants — exige tenantSlug
      throw new BadRequestException({
        code: 'TENANT_REQUIRED',
        message: 'Multiple tenants match this email; provide tenantSlug',
      });
    }

    const user = candidates[0];

    if (!user) {
      // Verify dummy para igualar tempo de resposta
      const dummy = await DUMMY_HASH_PROMISE;
      if (dummy) await verifyPassword(dummy, password);
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.tenant.deletedAt || user.tenant.status !== 'active') {
      throw new UnauthorizedException('Tenant disabled');
    }

    const tokens = await this.issueTokens({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      ip,
      userAgent,
    });

    await this.admin.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      tenant: {
        id: user.tenant.id,
        slug: user.tenant.slug,
        name: user.tenant.name,
      },
    };
  }

  async refresh(args: {
    refreshToken: string;
    ip?: string;
    userAgent?: string;
  }): Promise<IssuedTokens> {
    const { refreshToken, ip, userAgent } = args;
    const parsed = this.parseRefreshToken(refreshToken);
    if (!parsed) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.admin.userSession.findUnique({
      where: { id: parsed.sessionId },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.revokedAt !== null) {
      // Suspeita de roubo: refresh ja revogado sendo reusado.
      // Revoga TODAS as sessoes do user e forca logout global.
      this.log.warn(
        { userId: session.userId, sessionId: session.id },
        'Refresh token reuse detected — revoking all user sessions',
      );
      await this.admin.userSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const ok = await verifyRefreshToken(session.refreshTokenHash, parsed.secret);
    if (!ok) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.user.deletedAt) {
      throw new UnauthorizedException('User disabled');
    }

    // Rotacao: revoga atual e emite novo par.
    const newTokens = await this.admin.$transaction(async (tx) => {
      await tx.userSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      return this.issueTokens({
        userId: session.userId,
        tenantId: session.tenantId,
        role: session.user.role,
        ip,
        userAgent,
        tx,
      });
    });

    return newTokens;
  }

  async logout(sessionId: string): Promise<void> {
    await this.admin.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(args: {
    userId: string;
    tenantId: string;
    role: string;
    ip?: string;
    userAgent?: string;
    tx?: Pick<PrismaAdminService, 'userSession'>;
  }): Promise<IssuedTokens> {
    const { userId, tenantId, role, ip, userAgent } = args;
    const db = args.tx ?? this.admin;

    const secret = generateRefreshToken();
    const refreshHash = await hashRefreshToken(secret);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);

    const session = await db.userSession.create({
      data: {
        userId,
        tenantId,
        refreshTokenHash: refreshHash,
        expiresAt,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
      },
    });

    const accessPayload: JwtAccessPayload = {
      sub: userId,
      tenantId,
      role,
      sid: session.id,
    };
    const accessToken = await this.jwt.signAsync(accessPayload, {
      expiresIn: this.accessTtlSec,
      algorithm: 'HS256',
    });

    return {
      accessToken,
      refreshToken: `${session.id}.${secret}`,
    };
  }

  private parseRefreshToken(
    token: string,
  ): { sessionId: string; secret: string } | null {
    const dot = token.indexOf('.');
    if (dot < 1 || dot === token.length - 1) return null;
    const sessionId = token.slice(0, dot);
    const secret = token.slice(dot + 1);
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(sessionId)) return null;
    if (secret.length < 16) return null;
    return { sessionId, secret };
  }
}
