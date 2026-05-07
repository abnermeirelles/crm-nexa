import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@crm-nexa/database';
import { ClsService } from 'nestjs-cls';
import { TENANT_ID_KEY } from '../cls/keys';

export type ExtendedPrismaClient = ReturnType<PrismaService['extend']>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly base: PrismaClient;
  public readonly client: ExtendedPrismaClient;

  constructor(private readonly cls: ClsService) {
    const runtimeUrl = process.env.DATABASE_URL;
    if (!runtimeUrl) {
      throw new Error('DATABASE_URL is required at runtime (crm_app role)');
    }
    this.base = new PrismaClient({
      datasourceUrl: runtimeUrl,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
    this.client = this.extend();
  }

  async onModuleInit(): Promise<void> {
    await this.base.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }

  // Raw, non-tenant-scoped client. Use only for ops that legitimately bypass
  // tenant context (cross-tenant login lookups, infra health probes). Most
  // request-bound code should use `client` instead.
  unscoped(): PrismaClient {
    return this.base;
  }

  private extend() {
    const base = this.base;
    const cls = this.cls;
    return base.$extends({
      name: 'tenant-rls',
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            const tenantId = cls.get<string>(TENANT_ID_KEY);
            if (!tenantId) {
              return query(args);
            }
            const [, result] = await base.$transaction([
              base.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
              query(args),
            ]);
            return result;
          },
        },
      },
    });
  }
}
