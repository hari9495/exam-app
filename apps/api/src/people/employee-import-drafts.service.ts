import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrgSecretsCryptoService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, inCompany } from '../org-structure/org-structure.service';
import { FIELD_KEYS, importFieldList } from './employee-import';

// PPL-07 "Save and exit": one saved import per person, read only by that person (the owner_only RLS policy and the
// user id here). The file's rows, the matching and the fixes are one sealed value; it is gone after DRAFT_DAYS.

export const DRAFT_DAYS = 30;
const SKIP = "Don't import";
const STEPS = ['upload', 'map', 'validate', 'review'] as const;

export interface DraftState {
  legalEntityId: string;
  step: (typeof STEPS)[number];
  file: { name: string; columns: { column: string; sample: string; field: string | null }[]; rows: { row: number; cells: string[] }[] };
  mapping: Record<string, string>;
  edits: Record<string, Record<string, string>>;
}

// A saved import belongs to a signed-in person; without one there is nothing to keep.
const me = (c: CompanyContext) => {
  if (!c.userId) throw new ForbiddenException('Sign in to save an import.');
  return c.userId;
};

@Injectable()
export class EmployeeImportDraftsService {
  private readonly logger = new Logger(EmployeeImportDraftsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  /** The person's saved import, without its rows (the upload step shows it); draft is null when there is none. */
  mine(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const d = await tx.employeeImportDraft.findFirst({ where: { organizationId: c.organizationId, userId: me(c), expiresAt: { gt: new Date() } } });
      if (!d) return { draft: null };
      const entity = await tx.legalEntity.findFirst({ where: { organizationId: c.organizationId, id: d.legalEntityId }, select: { name: true } });
      return { draft: { fileName: d.fileName, rows: d.rowCount, entity: entity?.name ?? '', step: d.step, savedAt: d.savedAt.toISOString(), keptUntil: d.expiresAt.toISOString() } };
    });
  }

  /** The whole saved import, to carry on where the person left off. */
  open(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const d = await tx.employeeImportDraft.findFirst({ where: { organizationId: c.organizationId, userId: me(c), expiresAt: { gt: new Date() } } });
      if (!d) throw new NotFoundException('There is no saved import.');
      const prefix = `${c.organizationId}:${c.userId}:`;
      const plain = this.crypto.decrypt(d.payloadEnc);
      if (!plain.startsWith(prefix)) throw new NotFoundException('There is no saved import.');
      const s = JSON.parse(plain.slice(prefix.length)) as DraftState;
      return { ...s, file: { ...s.file, fields: importFieldList() } };
    });
  }

  /** Saves (or replaces) the person's import; it is kept DRAFT_DAYS from now. */
  save(ctx: TenantContext, s: DraftState) {
    this.check(s);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const entity = await tx.legalEntity.findFirst({ where: { organizationId: c.organizationId, id: s.legalEntityId }, select: { id: true } });
      if (!entity) throw new BadRequestException('Choose a legal entity of this company.');
      const payload = { legalEntityId: s.legalEntityId, step: s.step, file: s.file, mapping: s.mapping, edits: s.edits };
      const data = {
        legalEntityId: s.legalEntityId,
        fileName: s.file.name,
        rowCount: s.file.rows.length,
        step: s.step,
        payloadEnc: this.crypto.encrypt(`${c.organizationId}:${c.userId}:${JSON.stringify(payload)}`),
        savedAt: new Date(),
        expiresAt: new Date(Date.now() + DRAFT_DAYS * 86_400_000),
      };
      const owner = { organizationId: c.organizationId, userId: me(c) };
      const d = await tx.employeeImportDraft.upsert({ where: { organizationId_userId: owner }, create: { ...owner, ...data }, update: data });
      return { keptUntil: d.expiresAt.toISOString() };
    });
  }

  /** Discards the person's saved import (also after it is imported). */
  discard(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await tx.employeeImportDraft.deleteMany({ where: { organizationId: c.organizationId, userId: me(c) } });
      return { ok: true };
    });
  }

  /** The daily sweep: saved imports past their time are deleted, in every company. */
  async prune() {
    const { count } = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.employeeImportDraft.deleteMany({ where: { expiresAt: { lte: new Date() } } }));
    if (count) this.logger.log(`Deleted ${count} expired saved imports`);
    return count;
  }

  // The DTO checks the shape and sizes; this checks that the parts agree.
  private check(s: DraftState) {
    const width = s.file.columns.length;
    if (s.file.rows.some((r) => r.cells.length > width)) throw new BadRequestException('A row has more cells than the file has columns.');
    if (new Set(s.file.rows.map((r) => r.row)).size !== s.file.rows.length) throw new BadRequestException('Each row number appears once.');
    const columns = new Set(s.file.columns.map((c) => c.column));
    const allowed = new Set<string>([...FIELD_KEYS, SKIP]);
    for (const [column, field] of Object.entries(s.mapping)) if (!columns.has(column) || !allowed.has(field)) throw new BadRequestException('A column is matched to a field that does not exist.');
    const rows = new Set(s.file.rows.map((r) => String(r.row)));
    for (const [row, values] of Object.entries(s.edits)) {
      if (!rows.has(row)) throw new BadRequestException('A fix is for a row that is not in the file.');
      for (const [k, v] of Object.entries(values)) if (!(FIELD_KEYS as string[]).includes(k) || typeof v !== 'string' || v.length > 200) throw new BadRequestException('A fix is not valid.');
    }
  }
}
