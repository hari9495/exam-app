import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomFieldDefinition } from '@prisma/client';
import { AuditService, TenantPrismaService, TenantContext } from '@exam-platform/shared';
import { CF_ENTITY_TYPES, CreateCustomFieldDto, type CustomFieldEntityType } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

/** Answer 2425 (Settings › Custom fields): what an audit row keeps of a field definition. */
const look = (d: CustomFieldDefinition) => ({ entityType: d.entityType, label: d.label, fieldType: d.fieldType, options: d.optionsJson ? (JSON.parse(d.optionsJson) as string[]) : null, required: d.required, showOnApply: d.showOnApply, dataClass: d.dataClass, archivedAt: d.archivedAt });

export function slugify(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 90) || 'field';
}

@Injectable()
export class CustomFieldsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(context: TenantContext, entityType: CustomFieldEntityType, includeArchived = false): Promise<CustomFieldDefinition[]> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.customFieldDefinition.findMany({
        where: {
          organizationId: context.organizationId as string,
          entityType,
          ...(includeArchived ? {} : { archivedAt: null }),
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
    );
  }

  async create(context: TenantContext, dto: CreateCustomFieldDto): Promise<CustomFieldDefinition> {
    if (dto.fieldType === 'select' && (!dto.options || dto.options.length === 0)) {
      throw new BadRequestException('A select field needs at least one option');
    }
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const base = slugify(dto.label);
      let key = base;
      for (let i = 2; ; i++) {
        const clash = await tx.customFieldDefinition.findFirst({
          where: { organizationId: orgId, entityType: dto.entityType, key },
          select: { id: true },
        });
        if (!clash) break;
        key = `${base}-${i}`;
      }
      const made = await tx.customFieldDefinition.create({
        data: {
          organizationId: orgId,
          entityType: dto.entityType,
          key,
          label: dto.label,
          fieldType: dto.fieldType,
          optionsJson: dto.fieldType === 'select' ? JSON.stringify(dedupe(dto.options ?? [])) : null,
          required: dto.required ?? false,
          showOnApply: dto.entityType === 'candidate' ? (dto.showOnApply ?? false) : false,
          dataClass: dto.entityType === 'employee' ? (dto.dataClass ?? 'internal') : 'internal',
          position: dto.position ?? 0,
        },
      });
      await AuditService.recordIn(tx, context, { actorUserId: context.userId ?? null, action: 'custom_field.created', entityType: 'custom_field', entityId: made.id, metadata: { before: null, after: look(made) } });
      return made;
    });
  }

  /** `kinds`: the entity types the caller's route manages (hiring settings never reach employee fields). */
  async update(context: TenantContext, id: string, dto: UpdateCustomFieldDto, kinds: readonly CustomFieldEntityType[] = CF_ENTITY_TYPES): Promise<CustomFieldDefinition> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.customFieldDefinition.findFirst({ where: { id, organizationId: orgId, entityType: { in: [...kinds] } } });
      if (!existing) throw new NotFoundException(`Custom field ${id} not found`);
      if (existing.fieldType === 'select' && dto.options !== undefined && dto.options.length === 0) {
        throw new BadRequestException('A select field needs at least one option');
      }
      const saved = await tx.customFieldDefinition.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.required !== undefined ? { required: dto.required } : {}),
          ...(dto.position !== undefined ? { position: dto.position } : {}),
          ...(existing.entityType === 'employee' && dto.dataClass !== undefined ? { dataClass: dto.dataClass } : {}),
          ...(existing.entityType === 'candidate' && dto.showOnApply !== undefined ? { showOnApply: dto.showOnApply } : {}),
          ...(existing.fieldType === 'select' && dto.options !== undefined ? { optionsJson: JSON.stringify(dedupe(dto.options)) } : {}),
          // entityType, key, fieldType are immutable — never written here.
        },
      });
      await AuditService.recordIn(tx, context, { actorUserId: context.userId ?? null, action: 'custom_field.updated', entityType: 'custom_field', entityId: id, metadata: { before: look(existing), after: look(saved) } });
      return saved;
    });
  }

  async archive(context: TenantContext, id: string, kinds: readonly CustomFieldEntityType[] = CF_ENTITY_TYPES): Promise<{ id: string; archivedAt: Date }> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.customFieldDefinition.findFirst({ where: { id, organizationId: orgId, entityType: { in: [...kinds] } } });
      if (!existing) throw new NotFoundException(`Custom field ${id} not found`);
      const archivedAt = new Date();
      const saved = await tx.customFieldDefinition.update({ where: { id }, data: { archivedAt } });
      await AuditService.recordIn(tx, context, { actorUserId: context.userId ?? null, action: 'custom_field.archived', entityType: 'custom_field', entityId: id, metadata: { before: look(existing), after: look(saved) } });
      return { id, archivedAt };
    });
  }
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}
