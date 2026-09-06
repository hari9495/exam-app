import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';

// Single source for the four recycle-bin-eligible entities (T1's soft-delete columns / T2's
// SOFT_DELETE_MODELS list) -- entityType is the stable, url-safe string used on the wire;
// `delegate` is the Prisma client property to call ((tx as any)[delegate]); `labelField` is
// the obvious display field per model, verified against schema.prisma.
export const ENTITY_TYPES = {
  candidate: { delegate: 'candidate', labelField: 'name' },
  job: { delegate: 'job', labelField: 'title' },
  pipeline: { delegate: 'pipeline', labelField: 'name' },
  'walk-in-group': { delegate: 'walkInGroup', labelField: 'name' },
} as const;

export type EntityType = keyof typeof ENTITY_TYPES;

export function isEntityType(value: string): value is EntityType {
  return Object.prototype.hasOwnProperty.call(ENTITY_TYPES, value);
}

export interface RecycleBinEntry {
  entityType: EntityType;
  id: string;
  label: string;
  deletedAt: Date;
  deletedByUserId: string | null;
}

@Injectable()
export class RecycleBinService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(context: TenantContext): Promise<RecycleBinEntry[]> {
    const entries = await this.tenantPrisma.forTenantIncludingDeleted(context, async (tx) => {
      const perType = await Promise.all(
        (Object.keys(ENTITY_TYPES) as EntityType[]).map(async (entityType) => {
          const config = ENTITY_TYPES[entityType];
          const rows: any[] = await (tx as any)[config.delegate].findMany({
            where: { deletedAt: { not: null } },
            select: { id: true, deletedAt: true, deletedByUserId: true, [config.labelField]: true },
          });
          return rows.map((row) => ({
            entityType,
            id: row.id as string,
            label: row[config.labelField] as string,
            deletedAt: row.deletedAt as Date,
            deletedByUserId: row.deletedByUserId as string | null,
          }));
        }),
      );
      return perType.flat();
    });

    return entries.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
  }

  async restore(context: TenantContext, entityType: EntityType, id: string): Promise<RecycleBinEntry> {
    const config = this.getConfig(entityType);
    try {
      const updated: any = await this.tenantPrisma.forTenantIncludingDeleted(context, (tx) =>
        (tx as any)[config.delegate].update({
          where: { id, deletedAt: { not: null } },
          data: { deletedAt: null, deletedByUserId: null },
        }),
      );
      return {
        entityType,
        id: updated.id,
        label: updated[config.labelField],
        deletedAt: updated.deletedAt,
        deletedByUserId: updated.deletedByUserId,
      };
    } catch (error) {
      throw this.mapPrismaError(error, entityType);
    }
  }

  async purge(context: TenantContext, entityType: EntityType, id: string): Promise<void> {
    const config = this.getConfig(entityType);
    try {
      await this.tenantPrisma.forTenantIncludingDeleted(context, (tx) =>
        (tx as any)[config.delegate].delete({ where: { id, deletedAt: { not: null } } }),
      );
    } catch (error) {
      throw this.mapPrismaError(error, entityType);
    }
  }

  private getConfig(entityType: EntityType) {
    const config = ENTITY_TYPES[entityType];
    if (!config) throw new BadRequestException(`entityType must be one of: ${Object.keys(ENTITY_TYPES).join(', ')}`);
    return config;
  }

  // P2025 ("An operation failed because it depends on one or more records that were required but
  // not found") is what the extended-where-unique `{ id, deletedAt: { not: null } }` throws when
  // the id doesn't exist or exists but isn't soft-deleted -- either way, from the recycle-bin's
  // perspective that's "no such soft-deleted row" -> 404. P2002 (unique-constraint collision) ->
  // 409 per the brief; this is defensive/forward-compatible -- against today's schema the
  // organizationId+name/email indexes are plain (non-partial), so a live row can never occupy the
  // same key a soft-deleted row already holds (see recycle-bin.e2e-spec.ts), but map it correctly
  // regardless in case that changes.
  private mapPrismaError(error: unknown, entityType: EntityType): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return new NotFoundException(`No soft-deleted ${entityType} with id matching this request`);
      if (error.code === 'P2002') return new ConflictException(`Restoring this ${entityType} would collide with an existing record`);
    }
    return error as Error;
  }
}
