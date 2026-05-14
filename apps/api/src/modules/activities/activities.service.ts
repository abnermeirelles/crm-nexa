import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@crm-nexa/database';
import { ClsService } from 'nestjs-cls';
import {
  TENANT_ID_KEY,
  USER_ID_KEY,
} from '../../common/cls/keys';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ListActivitiesQueryDto } from './dto/list-activities.query';
import { UpdateActivityDto } from './dto/update-activity.dto';

const ACTIVITY_SELECT = {
  id: true,
  contactId: true,
  type: true,
  title: true,
  body: true,
  metadata: true,
  actorId: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ActivitySelect;

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly audit: AuditService,
  ) {}

  async create(contactId: string, dto: CreateActivityDto) {
    await this.assertContactInTenant(contactId);

    const created = await this.prisma.client.activity.create({
      data: {
        tenantId: this.requireCls(TENANT_ID_KEY),
        contactId,
        type: dto.type,
        title: dto.title ?? null,
        body: dto.body ?? null,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        actorId: this.cls.get<string>(USER_ID_KEY) ?? null,
      },
      select: ACTIVITY_SELECT,
    });

    await this.audit.write({
      action: 'activity.create',
      entityType: 'activity',
      entityId: created.id,
      after: created as unknown as Prisma.InputJsonValue,
    });
    return created;
  }

  async list(contactId: string, query: ListActivitiesQueryDto) {
    await this.assertContactInTenant(contactId);

    const where: Prisma.ActivityWhereInput = {
      contactId,
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    const [total, data] = await this.prisma.client.$transaction([
      this.prisma.client.activity.count({ where }),
      this.prisma.client.activity.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        select: ACTIVITY_SELECT,
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

  async update(id: string, dto: UpdateActivityDto) {
    const before = await this.findOrThrow(id);
    if (before.type === 'system') {
      throw new ForbiddenException({
        code: 'ACTIVITY_SYSTEM_IMMUTABLE',
        message: 'Atividades do sistema nao podem ser editadas',
      });
    }

    const updated = await this.prisma.client.activity.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title || null }),
        ...(dto.body !== undefined && { body: dto.body || null }),
        ...(dto.metadata !== undefined && {
          metadata: dto.metadata as Prisma.InputJsonValue,
        }),
      },
      select: ACTIVITY_SELECT,
    });

    await this.audit.write({
      action: 'activity.update',
      entityType: 'activity',
      entityId: id,
      before: before as unknown as Prisma.InputJsonValue,
      after: updated as unknown as Prisma.InputJsonValue,
    });
    return updated;
  }

  async softDelete(id: string) {
    const before = await this.findOrThrow(id);
    if (before.type === 'system') {
      throw new ForbiddenException({
        code: 'ACTIVITY_SYSTEM_IMMUTABLE',
        message: 'Atividades do sistema nao podem ser excluidas',
      });
    }
    await this.prisma.client.activity.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.write({
      action: 'activity.delete',
      entityType: 'activity',
      entityId: id,
      before: before as unknown as Prisma.InputJsonValue,
    });
  }

  // Cria activity tipo `system` (chamada por outros services, ex.: stage
  // change no ContactsService). Bypassa validacao de tipo, mas mantem
  // RLS via tenant-scoped client.
  async writeSystem(args: {
    contactId: string;
    title: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.client.activity.create({
        data: {
          tenantId: this.requireCls(TENANT_ID_KEY),
          contactId: args.contactId,
          type: 'system',
          title: args.title,
          metadata: (args.metadata ?? {}) as Prisma.InputJsonValue,
          actorId: this.cls.get<string>(USER_ID_KEY) ?? null,
        },
      });
    } catch {
      // Best-effort: falha aqui nao deve quebrar a operacao pai.
    }
  }

  private async findOrThrow(id: string) {
    const activity = await this.prisma.client.activity.findFirst({
      where: { id, deletedAt: null },
      select: { ...ACTIVITY_SELECT, deletedAt: true },
    });
    if (!activity) {
      throw new NotFoundException({ code: 'ACTIVITY_NOT_FOUND' });
    }
    return activity;
  }

  private async assertContactInTenant(contactId: string): Promise<void> {
    const contact = await this.prisma.client.contact.findFirst({
      where: { id: contactId, deletedAt: null },
      select: { id: true },
    });
    if (!contact) {
      throw new NotFoundException({ code: 'CONTACT_NOT_FOUND' });
    }
  }

  private requireCls(key: string): string {
    const v = this.cls.get<string>(key);
    if (!v) {
      throw new BadRequestException({ code: 'NO_TENANT_CONTEXT' });
    }
    return v;
  }
}
