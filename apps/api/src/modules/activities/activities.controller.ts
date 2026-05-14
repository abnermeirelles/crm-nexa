import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ListActivitiesQueryDto } from './dto/list-activities.query';
import { UpdateActivityDto } from './dto/update-activity.dto';

@Controller()
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Post('contacts/:contactId/activities')
  create(
    @Param('contactId', new ParseUUIDPipe()) contactId: string,
    @Body() dto: CreateActivityDto,
  ) {
    return this.activities.create(contactId, dto);
  }

  @Get('contacts/:contactId/activities')
  list(
    @Param('contactId', new ParseUUIDPipe()) contactId: string,
    @Query() query: ListActivitiesQueryDto,
  ) {
    return this.activities.list(contactId, query);
  }

  @Patch('activities/:id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.activities.update(id, dto);
  }

  @Delete('activities/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.activities.softDelete(id);
  }
}
