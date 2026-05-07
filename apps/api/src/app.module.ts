import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from './common/cls/cls.module';
import { DevTenantMiddleware } from './common/cls/dev-tenant.middleware';
import { LoggerModule } from './common/logger/logger.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { DevProbeModule } from './modules/dev-probe/dev-probe.module';
import { loadConfiguration } from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [loadConfiguration],
    }),
    LoggerModule,
    ClsModule,
    PrismaModule,
    HealthModule,
    DevProbeModule,
  ],
  providers: [DevTenantMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(DevTenantMiddleware).forRoutes('*');
  }
}
