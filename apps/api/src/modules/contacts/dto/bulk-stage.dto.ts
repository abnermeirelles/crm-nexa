import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { ContactStageDto } from './create-contact.dto';

export class BulkStageDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids!: string[];

  @IsEnum(ContactStageDto)
  stage!: ContactStageDto;
}
