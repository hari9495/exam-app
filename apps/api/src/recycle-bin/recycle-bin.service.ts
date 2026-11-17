import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantPrismaService, TenantContext } from '@exam-platform/shared';
import { BIN_KINDS, isBinKind, keepDays } from './bin';

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

const HIRING_WHAT: Record<EntityType, string> = { candidate: 'Candidate', job: 'Job', pipeline: 'Hiring pipeline', 'walk-in-group': 'Walk-in group' };

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

  // ---- Batch B item 3 (admin B2): the YukthiX-wide recycle bin (recycle_bin_items) plus hiring's soft-deleted rows ----

  /** Everything in the company's bin, newest first, with when it goes for good (deleted day + the company's keep days). */
  async items(context: TenantContext) {
    const org = context.organizationId as string;
    const { days, bin, people } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const days = await keepDays(tx, org);
      const bin = await tx.recycleBinItem.findMany({ where: { organizationId: org }, orderBy: { deletedAt: 'desc' }, take: 500, select: { id: true, kind: true, label: true, deletedAt: true, deletedBy: true } });
      const ids = [...new Set(bin.map((b) => b.deletedBy).filter((x): x is string => Boolean(x)))];
      const people = ids.length ? await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : [];
      return { days, bin, people };
    });
    const hiring = await this.list(context);
    const nameOf = new Map(people.map((p) => [p.id, p.name || p.email]));
    const until = (d: Date) => new Date(d.getTime() + days * 86_400_000);
    const rows = [
      ...bin.map((b) => ({ id: b.id, source: 'bin' as const, kind: b.kind, what: isBinKind(b.kind) ? BIN_KINDS[b.kind].what : b.kind, area: isBinKind(b.kind) ? BIN_KINDS[b.kind].area : 'Other', label: b.label, deletedAt: b.deletedAt, deletedBy: b.deletedBy ? (nameOf.get(b.deletedBy) ?? null) : null, purgeOn: until(b.deletedAt) })),
      // Hiring keeps its own soft delete (30 days, its nightly job); shown here so HR has one place to look.
      ...hiring.map((h) => ({ id: h.id, source: 'hiring' as const, kind: h.entityType, what: HIRING_WHAT[h.entityType], area: 'Hiring', label: h.label, deletedAt: h.deletedAt, deletedBy: null, purgeOn: new Date(h.deletedAt.getTime() + 30 * 86_400_000) })),
    ];
    return { keepDays: days, items: rows.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime()) };
  }

  /** Puts a deleted record back with its own id; 409 when something now holds its name or a record it needs is gone. */
  async restoreItem(context: TenantContext, actorUserId: string, id: string) {
    try {
      return await this.tenantPrisma.forTenant(context, async (tx) => {
        const item = await tx.recycleBinItem.findFirst({ where: { id, organizationId: context.organizationId as string } });
        if (!item || !isBinKind(item.kind)) throw new NotFoundException('That item is not in the recycle bin.');
        await (tx as any)[BIN_KINDS[item.kind].model].create({ data: item.data });
        await tx.recycleBinItem.delete({ where: { id } });
        await AuditService.recordIn(tx, context, { actorUserId, action: `${item.kind}.restored`, entityType: item.kind, entityId: item.entityId, metadata: { name: item.label, from: 'recycle_bin' } });
        return { id, kind: item.kind, entityId: item.entityId, label: item.label };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2003', 'P2025'].includes(error.code)) {
        throw new ConflictException(
          error.code === 'P2002'
            ? 'It cannot come back: a record with the same name or code exists now. Rename or delete that one first.'
            : 'It cannot come back: a record it belongs to is gone. Restore that one first.',
        );
      }
      throw error;
    }
  }

  /** Deletes a bin item for good (a step-up action; audited). */
  async purgeItem(context: TenantContext, actorUserId: string, id: string) {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const item = await tx.recycleBinItem.findFirst({ where: { id, organizationId: context.organizationId as string }, select: { kind: true, entityId: true, label: true } });
      if (!item) throw new NotFoundException('That item is not in the recycle bin.');
      await tx.recycleBinItem.delete({ where: { id } });
      await AuditService.recordIn(tx, context, { actorUserId, action: 'recycle_bin.purged', entityType: item.kind, entityId: item.entityId, metadata: { name: item.label } });
    });
    return { success: true };
  }

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
      await this.tenantPrisma.forTenantIncludingDeleted(context, async (tx) => {
        await (tx as any)[config.delegate].delete({ where: { id, deletedAt: { not: null } } });
        // Job hard-delete only: CustomFieldValue is an EAV table keyed by (entityType, entityId)
        // with no FK to Job (verified in schema.prisma), so nothing else cleans these up --
        // the soft-delete/restore path already correctly leaves them alone (kept for restore),
        // but a final hard-delete must sweep them or they orphan forever. Runs AFTER the job's
        // own delete succeeds (same transaction) so a P2025/P2003 there leaves both the job and
        // its custom-field values untouched. Candidate CFV rows are pre-existing/out of scope --
        // JOB ONLY, per the brief.
        if (entityType === 'job') {
          await tx.customFieldValue.deleteMany({
            where: { organizationId: context.organizationId as string, entityType: 'job', entityId: id },
          });
        }
      });
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
  // regardless in case that changes. P2003 (foreign-key constraint violation) is what `purge`'s
  // hard-delete throws when the row is still referenced by an `onDelete: NoAction` FK (e.g. a
  // Pipeline still referenced by a Job, or a Candidate with CandidateEmail rows) -> 409; we never
  // auto-cascade a hard-delete, so surface a clean conflict telling the admin to restore or clear
  // the referencing records first.
  private mapPrismaError(error: unknown, entityType: EntityType): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return new NotFoundException(`No soft-deleted ${entityType} with id matching this request`);
      if (error.code === 'P2002') return new ConflictException(`Restoring this ${entityType} would collide with an existing record`);
      if (error.code === 'P2003') {
        return new ConflictException(
          `Cannot permanently delete this ${entityType} — it is still referenced by related records. Restore it, or remove those records first.`,
        );
      }
    }
    return error as Error;
  }
}
