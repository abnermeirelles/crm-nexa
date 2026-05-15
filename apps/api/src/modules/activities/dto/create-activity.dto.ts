import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum ActivityTypeDto {
  note = 'note',
  call = 'call',
  email = 'email',
  meeting = 'meeting',
  // system nao e criavel via API — apenas pelo proprio backend
  // (ex.: stage change). Removido do enum exposto ao cliente.
}

export class CreateActivityDto {
  @IsEnum(ActivityTypeDto)
  type!: ActivityTypeDto;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  body?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
