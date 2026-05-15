import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

@Module({
  imports: [ActivitiesModule],
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}
