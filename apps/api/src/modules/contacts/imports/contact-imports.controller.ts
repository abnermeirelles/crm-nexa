import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import 'multer';
import { ContactImportsService } from './contact-imports.service';

@Controller('contacts/imports')
export class ContactImportsController {
  constructor(private readonly imports: ContactImportsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    }),
  )
  start(@UploadedFile() file: Express.Multer.File) {
    return this.imports.startImport(file);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.imports.findOne(id);
  }
}
