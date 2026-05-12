import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { parse } from 'csv-parse';
import { createReadStream, promises as fs } from 'node:fs';
import { Prisma } from '@crm-nexa/database';
import { PrismaAdminService } from '../../../common/prisma/prisma-admin.service';
import {
  CONTACT_IMPORT_QUEUE,
  type ContactImportJobData,
  type ImportRowError,
} from './types';

const VALID_STAGES = new Set(['lead', 'prospect', 'customer', 'churned']);
const DOCUMENT_RE = /^\d{11}$|^\d{14}$/;
const EMAIL_RE = /^.+@.+\..+$/;

// Aliases case-insensitive para os campos canonicos.
const COLUMN_ALIASES: Record<string, string> = {
  name: 'name',
  nome: 'name',
  email: 'email',
  'e-mail': 'email',
  phone: 'phone',
  telefone: 'phone',
  document: 'document',
  cpf: 'document',
  cnpj: 'document',
  'cpf/cnpj': 'document',
  companyname: 'companyName',
  company_name: 'companyName',
  empresa: 'companyName',
  stage: 'stage',
  source: 'source',
  origem: 'source',
  tags: 'tags',
};

interface ParsedRow {
  name?: string;
  email?: string;
  phone?: string;
  document?: string;
  companyName?: string;
  stage?: string;
  source?: string;
  tags?: string[];
}

@Processor(CONTACT_IMPORT_QUEUE, { concurrency: 1 })
export class ContactImportsProcessor extends WorkerHost {
  private readonly log = new Logger(ContactImportsProcessor.name);

  constructor(private readonly admin: PrismaAdminService) {
    super();
  }

  async process(job: Job<ContactImportJobData>): Promise<void> {
    const { importId, tenantId, filePath } = job.data;
    this.log.log(
      `Starting import ${importId} (tenant=${tenantId}, file=${filePath})`,
    );

    try {
      await this.admin.contactImport.update({
        where: { id: importId },
        data: { status: 'processing', startedAt: new Date() },
      });

      const result = await this.processFile(filePath, tenantId, importId);

      await this.admin.contactImport.update({
        where: { id: importId },
        data: {
          status: 'done',
          totalRows: result.total,
          processedRows: result.total,
          insertedRows: result.inserted,
          updatedRows: result.updated,
          errorRows: result.errors.length,
          errors: result.errors as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });

      this.log.log(
        `Import ${importId} done: +${result.inserted} new, ~${result.updated} updated, ${result.errors.length} errors`,
      );
    } catch (err) {
      this.log.error(`Import ${importId} failed`, err as Error);
      await this.admin.contactImport.update({
        where: { id: importId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errors: [
            { row: 0, message: (err as Error).message ?? 'unknown error' },
          ] as unknown as Prisma.InputJsonValue,
        },
      });
    } finally {
      // Cleanup do arquivo tmp
      await fs.unlink(filePath).catch(() => undefined);
    }
  }

  private async processFile(
    filePath: string,
    tenantId: string,
    _importId: string,
  ): Promise<{
    total: number;
    inserted: number;
    updated: number;
    errors: ImportRowError[];
  }> {
    let inserted = 0;
    let updated = 0;
    let total = 0;
    const errors: ImportRowError[] = [];
    const MAX_REPORTED_ERRORS = 100;

    const parser = createReadStream(filePath, { encoding: 'utf8' }).pipe(
      parse({
        columns: (headers: string[]) =>
          headers.map((h) => COLUMN_ALIASES[h.trim().toLowerCase()] ?? h),
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        bom: true,
      }),
    );

    for await (const raw of parser) {
      total++;
      const rowNumber = total + 1; // +1 por causa do header
      try {
        const parsed = this.normalizeRow(raw as Record<string, string>);
        if (!parsed.name) {
          errors.push({ row: rowNumber, message: 'name obrigatorio' });
          continue;
        }

        // Upsert por (tenantId, email) quando email existe; senao insert
        // simples (sem dedup).
        if (parsed.email) {
          const existing = await this.admin.contact.findFirst({
            where: {
              tenantId,
              email: parsed.email,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (existing) {
            await this.admin.contact.update({
              where: { id: existing.id },
              data: this.toContactData(parsed),
            });
            updated++;
          } else {
            await this.admin.contact.create({
              data: { tenantId, ...this.toContactData(parsed, true) },
            });
            inserted++;
          }
        } else {
          await this.admin.contact.create({
            data: { tenantId, ...this.toContactData(parsed, true) },
          });
          inserted++;
        }
      } catch (err) {
        if (errors.length < MAX_REPORTED_ERRORS) {
          errors.push({
            row: rowNumber,
            message: (err as Error).message ?? 'erro desconhecido',
          });
        }
      }
    }

    return { total, inserted, updated, errors };
  }

  private normalizeRow(row: Record<string, string>): ParsedRow {
    const get = (k: string) => {
      const v = row[k];
      return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
    };

    const name = get('name');
    const email = get('email')?.toLowerCase();
    if (email && !EMAIL_RE.test(email)) {
      throw new Error('email invalido');
    }
    const document = get('document')?.replace(/\D/g, '');
    if (document && !DOCUMENT_RE.test(document)) {
      throw new Error('document deve ter 11 ou 14 digitos');
    }
    const stageRaw = get('stage')?.toLowerCase();
    const stage = stageRaw && VALID_STAGES.has(stageRaw) ? stageRaw : undefined;

    const tagsRaw = get('tags');
    const tags = tagsRaw
      ? Array.from(
          new Set(
            tagsRaw
              .split(';')
              .map((t) => t.trim())
              .filter((t) => t.length > 0 && t.length <= 64),
          ),
        )
      : undefined;

    return {
      name,
      email,
      phone: get('phone'),
      document,
      companyName: get('companyName'),
      stage,
      source: get('source'),
      tags,
    };
  }

  private toContactData(parsed: ParsedRow, withDefaults = false) {
    return {
      name: parsed.name!,
      email: parsed.email ?? null,
      phone: parsed.phone ?? null,
      document: parsed.document ?? null,
      companyName: parsed.companyName ?? null,
      stage: (parsed.stage ?? (withDefaults ? 'lead' : undefined)) as
        | 'lead'
        | 'prospect'
        | 'customer'
        | 'churned'
        | undefined,
      source: parsed.source ?? (withDefaults ? 'csv-import' : null),
      tags: parsed.tags ?? (withDefaults ? [] : undefined),
    };
  }
}
