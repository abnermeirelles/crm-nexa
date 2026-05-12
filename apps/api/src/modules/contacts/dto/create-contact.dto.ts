import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum ContactStageDto {
  lead = 'lead',
  prospect = 'prospect',
  customer = 'customer',
  churned = 'churned',
}

// CPF (11 digitos) ou CNPJ (14 digitos). Apenas digitos — UI deve
// stripar mascaras antes do envio.
const DOCUMENT_RE = /^\d{11}$|^\d{14}$/;

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsOptional()
  @IsEmail({}, { message: 'email invalido' })
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(DOCUMENT_RE, { message: 'document deve conter 11 (CPF) ou 14 (CNPJ) digitos sem formatacao' })
  document?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @IsOptional()
  @IsEnum(ContactStageDto)
  stage?: ContactStageDto;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @Type(() => String)
  tags?: string[];
}
