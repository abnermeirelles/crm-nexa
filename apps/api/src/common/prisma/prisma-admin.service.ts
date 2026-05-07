import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@crm-nexa/database';

// Cliente Prisma com BYPASSRLS (role crm_admin / DATABASE_ADMIN_URL).
// USO RESTRITO: apenas para fluxos que legitimamente precisam ignorar tenant
// (login lookup cross-tenant, validacao de refresh antes de saber tenantId,
// audit writes administrativos). Codigo de runtime normal usa PrismaService.
@Injectable()
export class PrismaAdminService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_ADMIN_URL;
    if (!url) {
      throw new Error('DATABASE_ADMIN_URL is required (crm_admin role)');
    }
    super({
      datasourceUrl: url,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
