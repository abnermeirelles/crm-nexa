import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@crm-nexa/database';
import { ClsService } from 'nestjs-cls';
import {
  TENANT_ID_KEY,
  USER_ID_KEY,
} from '../../common/cls/keys';
import { PrismaAdminService } from '../../common/prisma/prisma-admin.service';

export interface AuditEntry {
  tenantId?: string;
  actorType?: 'user' | 'system';
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly log = new Logger(AuditService.name);

  constructor(
    private readonly admin: PrismaAdminService,
    private readonly cls: ClsService,
  ) {}

  // Write best-effort. Falhas em audit nao podem derrubar a operacao
  // pai — apenas logam. Em LGPD o ideal e never-fail, mas tambem nunca
  // silenciar: log estruturado garante visibilidade em DEV.
  async write(entry: AuditEntry): Promise<void> {
    try {
      const tenantId = entry.tenantId ?? this.cls.get<string>(TENANT_ID_KEY);
      const actorId =
        entry.actorId !== undefined
          ? entry.actorId
          : this.cls.get<string>(USER_ID_KEY) ?? null;
      const actorType = entry.actorType ?? (actorId ? 'user' : 'system');

      if (!tenantId) {
        this.log.warn(
          `[audit] skip ${entry.action}: tenantId nao resolvido`,
        );
        return;
      }

      await this.admin.auditLog.create({
        data: {
          tenantId,
          actorType,
          actorId: actorId ?? null,
          action: entry.action,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          before: (entry.before ?? null) as Prisma.InputJsonValue,
          after: (entry.after ?? null) as Prisma.InputJsonValue,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch (err) {
      this.log.error(`[audit] failed ${entry.action}`, err as Error);
    }
  }
}
