import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import 'multer';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ClsService } from 'nestjs-cls';
import { TENANT_ID_KEY, USER_ID_KEY } from '../../../common/cls/keys';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  CONTACT_IMPORT_QUEUE,
  type ContactImportJobData,
} from './types';

const MAX_CSV_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class ContactImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    @InjectQueue(CONTACT_IMPORT_QUEUE)
    private readonly queue: Queue<ContactImportJobData>,
  ) {}

  async startImport(file: Express.Multer.File): Promise<{ importId: string }> {
    if (!file) {
      throw new BadRequestException({ code: 'NO_FILE' });
    }
    if (file.size > MAX_CSV_BYTES) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: 'CSV maior que 10 MB nao suportado nesta fase',
      });
    }

    const tenantId = this.requireCls(TENANT_ID_KEY);
    const userId = this.requireCls(USER_ID_KEY);

    // Persiste o arquivo num diretorio tmp por job (worker le do mesmo
    // processo nesta fase; MinIO entra em fase posterior).
    const tmpName = `contact-import-${randomBytes(8).toString('hex')}.csv`;
    const filePath = join(tmpdir(), tmpName);
    await fs.writeFile(filePath, file.buffer);

    const created = await this.prisma.client.contactImport.create({
      data: {
        tenantId,
        createdBy: userId,
        filename: file.originalname || tmpName,
        status: 'queued',
      },
      select: { id: true },
    });

    await this.queue.add('process', {
      importId: created.id,
      tenantId,
      filePath,
      filename: file.originalname || tmpName,
    });

    return { importId: created.id };
  }

  async findOne(id: string) {
    const job = await this.prisma.client.contactImport.findFirst({
      where: { id },
      select: {
        id: true,
        filename: true,
        status: true,
        totalRows: true,
        processedRows: true,
        insertedRows: true,
        updatedRows: true,
        errorRows: true,
        errors: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
    });
    if (!job) {
      throw new NotFoundException({ code: 'IMPORT_NOT_FOUND' });
    }
    return job;
  }

  private requireCls(key: string): string {
    const v = this.cls.get<string>(key);
    if (!v) {
      throw new BadRequestException({ code: 'NO_TENANT_CONTEXT' });
    }
    return v;
  }
}
