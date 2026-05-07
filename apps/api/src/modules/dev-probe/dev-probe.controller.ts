import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CurrentTenant,
} from '../../common/decorators/current-tenant.decorator';

// DEV-ONLY: comprova que o tenant_id da CLS chega corretamente ao Postgres
// e que RLS (FORCE ROW LEVEL SECURITY) isola tenants. Sera removido na 0.4.C
// quando o JwtAuthGuard popular a CLS via JWT.
@Controller('_dev')
export class DevProbeController {
  constructor(private readonly prisma: PrismaService) {}

  private assertDev(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException();
    }
  }

  @Get('tenants')
  async listTenants(@CurrentTenant() tenantId?: string) {
    this.assertDev();
    const tenants = await this.prisma.client.tenant.findMany({
      select: { id: true, slug: true, name: true },
    });
    return { currentTenant: tenantId ?? null, count: tenants.length, tenants };
  }
}
