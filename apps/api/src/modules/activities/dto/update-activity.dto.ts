import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateActivityDto } from './create-activity.dto';

// Update nao permite mudar `type` — atividade muda de natureza
// quebraria timeline. Apenas title/body/metadata sao editaveis.
export class UpdateActivityDto extends PartialType(
  OmitType(CreateActivityDto, ['type'] as const),
) {}
