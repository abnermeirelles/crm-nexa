import { Module } from '@nestjs/common';
import { DevProbeController } from './dev-probe.controller';

@Module({
  controllers: [DevProbeController],
})
export class DevProbeModule {}
