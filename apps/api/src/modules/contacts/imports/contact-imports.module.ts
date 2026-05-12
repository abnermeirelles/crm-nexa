import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ContactImportsController } from './contact-imports.controller';
import { ContactImportsService } from './contact-imports.service';
import { ContactImportsProcessor } from './contact-imports.processor';
import { CONTACT_IMPORT_QUEUE } from './types';

@Module({
  imports: [BullModule.registerQueue({ name: CONTACT_IMPORT_QUEUE })],
  controllers: [ContactImportsController],
  providers: [ContactImportsService, ContactImportsProcessor],
})
export class ContactImportsModule {}
