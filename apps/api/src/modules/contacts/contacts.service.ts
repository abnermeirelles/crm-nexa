import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@crm-nexa/database';
import { ClsService } from 'nestjs-cls';
import { TENANT_ID_KEY } from '../../common/cls/keys';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { AuditService } from '../audit/audit.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { ListContactsQueryDto } from './dto/list-contacts.query';
import { UpdateContactDto } from './dto/update-contact.dto';

// Subset de campos publicos do Contact que retornamos ao cliente.
// tenantId e deletedAt sao mantidos no banco mas nao expostos.
const CONTACT_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  document: true,
  companyName: true,
  stage: true,
  source: true,
  ownerId: true,
  tags: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ContactSelect;

function csvEscape(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Wrap em aspas duplas + escapa aspas duplas internas (RFC 4180)
  // quando contem virgula, aspa dupla, ou newline.
  if (/[,"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly audit: AuditService,
    private readonly activities: ActivitiesService,
  ) {}

  async create(dto: CreateContactDto) {
    await this.assertOwnerInTenant(dto.ownerId);
    let created;
    try {
      created = await this.prisma.client.contact.create({
        data: {
          name: dto.name,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          document: dto.document ?? null,
          companyName: dto.companyName ?? null,
          stage: dto.stage ?? 'lead',
          source: dto.source ?? null,
          ownerId: dto.ownerId ?? null,
          tags: dto.tags ?? [],
          // tenantId injetado automaticamente pelo Prisma extension
          // via set_config('app.current_tenant_id') do CLS. Aqui
          // setamos via Prisma porque o RLS faz CHECK de igualdade.
          tenantId: this.currentTenantId(),
        },
        select: CONTACT_SELECT,
      });
    } catch (err) {
      throw this.translatePrismaError(err);
    }
    await this.audit.write({
      action: 'contact.create',
      entityType: 'contact',
      entityId: created.id,
      before: null,
      after: created as unknown as Prisma.InputJsonValue,
    });
    return created;
  }

  async list(query: ListContactsQueryDto) {
    const where: Prisma.ContactWhereInput = {
      deletedAt: null,
    };

    if (query.q && query.q.length > 0) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.stage) where.stage = query.stage;
    if (query.ownerId) where.ownerId = query.ownerId;
    if (query.tag) where.tags = { has: query.tag };

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const skip = (page - 1) * pageSize;

    const [total, data] = await this.prisma.client.$transaction([
      this.prisma.client.contact.count({ where }),
      this.prisma.client.contact.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        select: CONTACT_SELECT,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        hasMore: skip + data.length < total,
      },
    };
  }

  async findOne(id: string) {
    const contact = await this.prisma.client.contact.findFirst({
      where: { id, deletedAt: null },
      select: CONTACT_SELECT,
    });
    if (!contact) throw new NotFoundException({ code: 'CONTACT_NOT_FOUND' });
    return contact;
  }

  // Export CSV — respeita os mesmos filtros do list. Hard limit de 10k
  // linhas para evitar OOM no servidor (acima vira job assincrono no
  // futuro). Sem paginacao: retorna tudo em uma resposta.
  async exportCsv(query: ListContactsQueryDto): Promise<string> {
    const where: Prisma.ContactWhereInput = { deletedAt: null };
    if (query.q && query.q.length > 0) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.stage) where.stage = query.stage;
    if (query.ownerId) where.ownerId = query.ownerId;
    if (query.tag) where.tags = { has: query.tag };

    const EXPORT_HARD_LIMIT = 10_000;
    const rows = await this.prisma.client.contact.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: EXPORT_HARD_LIMIT,
      select: CONTACT_SELECT,
    });

    const header = [
      'name',
      'email',
      'phone',
      'document',
      'companyName',
      'stage',
      'source',
      'tags',
    ].join(',');

    const body = rows
      .map((c) =>
        [
          csvEscape(c.name),
          csvEscape(c.email),
          csvEscape(c.phone),
          csvEscape(c.document),
          csvEscape(c.companyName),
          csvEscape(c.stage),
          csvEscape(c.source),
          // tags juntas por ';' para nao confundir com separador CSV
          csvEscape(c.tags.join(';')),
        ].join(','),
      )
      .join('\n');

    await this.audit.write({
      action: 'contact.export',
      entityType: 'contact',
      after: {
        filter: {
          q: query.q,
          stage: query.stage,
          ownerId: query.ownerId,
          tag: query.tag,
        },
        rowsExported: rows.length,
        truncated: rows.length === EXPORT_HARD_LIMIT,
      },
    });

    return `${header}\n${body}`;
  }

  async update(id: string, dto: UpdateContactDto) {
    // findOne ja valida tenant (RLS) e nao-deletado
    const before = await this.findOne(id);

    if (dto.ownerId !== undefined && dto.ownerId !== null) {
      await this.assertOwnerInTenant(dto.ownerId);
    }

    let updated;
    try {
      updated = await this.prisma.client.contact.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.email !== undefined && { email: dto.email || null }),
          ...(dto.phone !== undefined && { phone: dto.phone || null }),
          ...(dto.document !== undefined && { document: dto.document || null }),
          ...(dto.companyName !== undefined && {
            companyName: dto.companyName || null,
          }),
          ...(dto.stage !== undefined && { stage: dto.stage }),
          ...(dto.source !== undefined && { source: dto.source || null }),
          ...(dto.ownerId !== undefined && { ownerId: dto.ownerId || null }),
          ...(dto.tags !== undefined && { tags: dto.tags }),
        },
        select: CONTACT_SELECT,
      });
    } catch (err) {
      throw this.translatePrismaError(err);
    }
    await this.audit.write({
      action: 'contact.update',
      entityType: 'contact',
      entityId: id,
      before: before as unknown as Prisma.InputJsonValue,
      after: updated as unknown as Prisma.InputJsonValue,
    });

    // Stage change gera entry visivel na timeline. Outras mudancas
    // podem ser inferidas via audit_log, mas stage merece destaque
    // porque e a metrica principal de funil.
    if (dto.stage !== undefined && before.stage !== updated.stage) {
      await this.activities.writeSystem({
        contactId: id,
        title: `Stage alterado: ${before.stage} → ${updated.stage}`,
        metadata: { field: 'stage', from: before.stage, to: updated.stage },
      });
    }

    return updated;
  }

  async softDelete(id: string) {
    const before = await this.findOne(id); // valida tenant
    await this.prisma.client.contact.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.write({
      action: 'contact.delete',
      entityType: 'contact',
      entityId: id,
      before: before as unknown as Prisma.InputJsonValue,
      after: null,
    });
  }

  // Bulk update de stage. Limite de 500 ids enforced no DTO.
  // RLS garante que so contacts do tenant atual sao tocados (RLS faz
  // CHECK no UPDATE). Cria system activity para cada contact em que
  // o stage realmente mudou.
  async bulkUpdateStage(ids: string[], stage: 'lead' | 'prospect' | 'customer' | 'churned') {
    if (ids.length === 0) {
      return { matched: 0, updated: 0 };
    }

    // Le os estados anteriores para emitir system activity so quando
    // realmente muda. Tambem confirma que pertencem ao tenant (RLS).
    const before = await this.prisma.client.contact.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, stage: true },
    });

    const matched = before.length;
    const idsToUpdate = before
      .filter((c) => c.stage !== stage)
      .map((c) => c.id);

    if (idsToUpdate.length === 0) {
      await this.audit.write({
        action: 'contact.bulk.stage',
        entityType: 'contact',
        after: { ids, stage, matched, updated: 0 },
      });
      return { matched, updated: 0 };
    }

    const result = await this.prisma.client.contact.updateMany({
      where: { id: { in: idsToUpdate } },
      data: { stage },
    });

    // System activity por contact (best-effort, em paralelo).
    await Promise.all(
      before
        .filter((c) => c.stage !== stage)
        .map((c) =>
          this.activities.writeSystem({
            contactId: c.id,
            title: `Stage alterado: ${c.stage} → ${stage}`,
            metadata: {
              field: 'stage',
              from: c.stage,
              to: stage,
              source: 'bulk',
            },
          }),
        ),
    );

    await this.audit.write({
      action: 'contact.bulk.stage',
      entityType: 'contact',
      after: { ids, stage, matched, updated: result.count },
    });

    return { matched, updated: result.count };
  }

  // Garante que o ownerId (se fornecido) pertence ao tenant atual.
  // Usa o client tenant-scoped — se o user e de outro tenant, RLS
  // retorna null e levantamos 400.
  private async assertOwnerInTenant(ownerId: string | undefined): Promise<void> {
    if (!ownerId) return;
    const owner = await this.prisma.client.user.findFirst({
      where: { id: ownerId, deletedAt: null },
      select: { id: true },
    });
    if (!owner) {
      throw new BadRequestException({
        code: 'INVALID_OWNER',
        message: 'ownerId nao pertence ao tenant',
      });
    }
  }

  private currentTenantId(): string {
    const id = this.cls.get<string>(TENANT_ID_KEY);
    if (!id) {
      throw new BadRequestException({ code: 'NO_TENANT_CONTEXT' });
    }
    return id;
  }

  private translatePrismaError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return new ConflictException({
          code: 'CONTACT_DUPLICATE_EMAIL',
          message: 'Ja existe um contato com este e-mail neste tenant',
        });
      }
      if (err.code === 'P2003') {
        return new BadRequestException({
          code: 'INVALID_REFERENCE',
          message: 'Referencia (owner) invalida',
        });
      }
    }
    return err as Error;
  }
}
