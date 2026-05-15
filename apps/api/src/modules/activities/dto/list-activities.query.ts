import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum ActivityTypeFilter {
  note = 'note',
  call = 'call',
  email = 'email',
  meeting = 'meeting',
  system = 'system',
}

export class ListActivitiesQueryDto {
  @IsOptional()
  @IsEnum(ActivityTypeFilter)
  type?: ActivityTypeFilter;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  pageSize: number = 50;
}
