import { Module } from '@nestjs/common';
import { ClsModule as BaseClsModule } from 'nestjs-cls';

@Module({
  imports: [
    BaseClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
  ],
})
export class ClsModule {}
