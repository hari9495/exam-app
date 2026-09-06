import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomFieldDefinition } from '@prisma/client';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

export function slugify(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 90) || 'field';
}

@Injectable()
export class CustomFieldsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(context: TenantContext, entityType: 'candidate' | 'job', includeArchived = false): Promise<CustomFieldDefinition[]> {
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
      return tx.customFieldDefinition.create({
        data: {
          organizationId: orgId,
          entityType: dto.entityType,
          key,
          label: dto.label,
          fieldType: dto.fieldType,
          optionsJson: dto.fieldType === 'select' ? JSON.stringify(dedupe(dto.options ?? [])) : null,
          required: dto.required ?? false,
          showOnApply: dto.entityType === 'candidate' ? (dto.showOnApply ?? false) : false,
          position: dto.position ?? 0,
        },
      });
    });
  }

  async update(context: TenantContext, id: string, dto: UpdateCustomFieldDto): Promise<CustomFieldDefinition> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.customFieldDefinition.findFirst({ where: { id, organizationId: orgId } });
      if (!existing) throw new NotFoundException(`Custom field ${id} not found`);
      if (existing.fieldType === 'select' && dto.options !== undefined && dto.options.length === 0) {
        throw new BadRequestException('A select field needs at least one option');
      }
      return tx.customFieldDefinition.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.required !== undefined ? { required: dto.required } : {}),
          ...(dto.position !== undefined ? { position: dto.position } : {}),
          ...(existing.entityType === 'candidate' && dto.showOnApply !== undefined ? { showOnApply: dto.showOnApply } : {}),
          ...(existing.fieldType === 'select' && dto.options !== undefined ? { optionsJson: JSON.stringify(dedupe(dto.options)) } : {}),
          // entityType, key, fieldType are immutable — never written here.
        },
      });
    });
  }

  async archive(context: TenantContext, id: string): Promise<{ id: string; archivedAt: Date }> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.customFieldDefinition.findFirst({ where: { id, organizationId: orgId }, select: { id: true } });
      if (!existing) throw new NotFoundException(`Custom field ${id} not found`);
      const archivedAt = new Date();
      await tx.customFieldDefinition.update({ where: { id }, data: { archivedAt } });
      return { id, archivedAt };
    });
  }
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}
