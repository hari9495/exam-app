import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { FileStore } from '../documents/file-store';
import { settingFor } from './probation';

// Founder 30 Oct 2026 (people follow-up 12): Special data is deleted when privacy.retention.special_years (per legal
// entity, default 1) has passed since the person's last day. Special data here is what the setting names, nothing more:
//   the Aadhaar number on the record (sealed value, keyed hash, last four) -> cleared;
//   documents of the Special types "aadhaar" (masked copy) and "bgv_report" (background check report) -> the file in
//   storage, its versions and the document are deleted (re-verification asks on them go too);
//   background checks of the person's joining -> the free-text note and the report link are cleared (type and status stay).
// Not touched: pay records (payslips, filings, Form 16) keep payroll's own period; disability declarations and consent
// records wait for the founder (see people-design-map, Q12). A person still working, or joining again, is skipped.
// Safe to re-run: erased data is gone, so the next run finds nothing; each company is locked while it runs.
// Off by default (privacy.erasure.enabled): HR reads the dry run first.
export const SPECIAL_DOCUMENT_TYPES = ['aadhaar', 'bgv_report'] as const;

export type ErasureCounts = { people: number; aadhaar: number; documents: number; backgroundChecks: number };
type Due = { personId: string; years: number; aadhaar: number; documents: number; backgroundChecks: number };
type Candidate = { person_id: string; employee_id: string; last_day: string; entity_id: string; aadhaar: number; documents: number; bgv: number };

const zero = (): ErasureCounts => ({ people: 0, aadhaar: 0, documents: 0, backgroundChecks: 0 });

@Injectable()
export class ErasureService {
  private readonly logger = new Logger(ErasureService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly store: FileStore,
  ) {}

  /** People who have left, hold Special data, and are past their entity's period on `today` (one person with `only`). */
  private async due(tx: Tx, c: CompanyContext, today: string, only?: string): Promise<Due[]> {
    const org = c.organizationId;
    const rows = await tx.$queryRaw<Candidate[]>(Prisma.sql`
      SELECT e.person_id::text AS person_id, e.id::text AS employee_id, last.exited_on::text AS last_day, last.legal_entity_id::text AS entity_id,
        (SELECT count(*)::int FROM employee_identifiers i WHERE i.organization_id = e.organization_id AND i.employee_id = e.id
           AND (i.aadhaar_enc IS NOT NULL OR i.aadhaar_hash IS NOT NULL OR i.aadhaar_last4 IS NOT NULL)) AS aadhaar,
        (SELECT count(*)::int FROM documents d WHERE d.organization_id = e.organization_id AND d.person_id = e.person_id
           AND d.type_key IN (${Prisma.join([...SPECIAL_DOCUMENT_TYPES])})) AS documents,
        (SELECT count(*)::int FROM bgv_checks b JOIN preboardings p ON p.organization_id = b.organization_id AND p.id = b.preboarding_id
           WHERE b.organization_id = e.organization_id AND p.person_id = e.person_id AND (b.note IS NOT NULL OR b.result_document_id IS NOT NULL)) AS bgv
      FROM employees e
      JOIN LATERAL (SELECT m.exited_on, m.legal_entity_id FROM employments m WHERE m.organization_id = e.organization_id AND m.employee_id = e.id
                    ORDER BY m.exited_on DESC NULLS FIRST, m.joined_on DESC LIMIT 1) last ON true
      WHERE e.organization_id = ${org}::uuid
        ${only ? Prisma.sql`AND e.person_id = ${only}::uuid` : Prisma.empty}
        AND last.exited_on IS NOT NULL AND last.exited_on < ${today}::date
        AND NOT EXISTS (SELECT 1 FROM employments m WHERE m.organization_id = e.organization_id AND m.employee_id = e.id AND m.exited_on IS NULL)
        AND NOT EXISTS (SELECT 1 FROM preboardings p WHERE p.organization_id = e.organization_id AND p.person_id = e.person_id AND p.status = 'invited')`);
    const out: Due[] = [];
    const years = new Map<string, number>();
    for (const r of rows) {
      if (!r.aadhaar && !r.documents && !r.bgv) continue;
      if (!years.has(r.entity_id)) years.set(r.entity_id, Number(await settingFor(tx, c, 'privacy.retention.special_years', { legalEntityId: r.entity_id })));
      const n = years.get(r.entity_id)!;
      // Kept through the day n years after the last day; 0 means deleted the day after they leave.
      const [{ ends }] = await tx.$queryRaw<{ ends: string }[]>`SELECT (${r.last_day}::date + make_interval(years => ${n}::int))::date::text AS ends`;
      if (ends < today) out.push({ personId: r.person_id, years: n, aadhaar: r.aadhaar, documents: r.documents, backgroundChecks: r.bgv });
    }
    return out;
  }

  private sum(due: Due[]): ErasureCounts {
    return due.reduce((t, d) => ({ people: t.people + 1, aadhaar: t.aadhaar + d.aadhaar, documents: t.documents + d.documents, backgroundChecks: t.backgroundChecks + d.backgroundChecks }), zero());
  }

  /** The dry run and the last real run (the caller checked org.settings.manage company-wide). Counts only, never values. */
  report(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const enabled = (await settingFor(tx, c, 'privacy.erasure.enabled', { legalEntityId: '' })) === 'on';
      const last = await tx.auditLog.findFirst({ where: { organizationId: c.organizationId, action: 'privacy.erasure.run' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, metadataJson: true } });
      const m = (last?.metadataJson ? JSON.parse(last.metadataJson) : {}) as Partial<ErasureCounts & { failed: number }>;
      return {
        enabled,
        due: this.sum(await this.due(tx, c, todayIst())),
        lastRun: last ? { at: last.createdAt.toISOString(), people: m.people ?? 0, aadhaar: m.aadhaar ?? 0, documents: m.documents ?? 0, backgroundChecks: m.backgroundChecks ?? 0, failed: m.failed ?? 0 } : null,
      };
    });
  }

  /** Nightly: every company that turned the job on, each in its own context. */
  async sweep(today = todayIst()): Promise<number> {
    const on = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.setting.findMany({ where: { key: 'privacy.erasure.enabled', scopeType: 'tenant' }, select: { organizationId: true, value: true } }),
    );
    let people = 0;
    for (const s of on.filter((r) => String(r.value) === 'on')) {
      try {
        people += (await this.run({ organizationId: s.organizationId, isSuperAdmin: false, userId: null }, today)).people;
      } catch (e) {
        this.logger.error(`Special data erasure failed for ${s.organizationId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return people;
  }

  /** One company: each person in their own transaction under the company lock; one failure never stops the rest. */
  async run(ctx: TenantContext, today = todayIst()): Promise<ErasureCounts & { failed: number }> {
    const plan = await inCompany(this.tenantPrisma, ctx, async (tx, c) =>
      (await settingFor(tx, c, 'privacy.erasure.enabled', { legalEntityId: '' })) === 'on' ? this.due(tx, c, today) : null,
    );
    if (!plan) return { ...zero(), failed: 0 };
    const done = zero();
    let failed = 0;
    for (const p of plan) {
      try {
        const n = await this.erase(ctx, p.personId, today);
        if (!n) continue;
        done.people++;
        done.aadhaar += n.aadhaar;
        done.documents += n.documents;
        done.backgroundChecks += n.backgroundChecks;
      } catch (e) {
        failed++;
        this.logger.error(`Special data erasure failed for person ${p.personId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await inCompany(this.tenantPrisma, ctx, (tx, c) => audit(tx, c, 'privacy.erasure.run', 'organization', c.organizationId, { ...done, failed, class: 'special' }));
    return { ...done, failed };
  }

  /** Re-checks the person under the lock (another server may have done it), then deletes. Null when nothing is due. */
  private erase(ctx: TenantContext, personId: string, today: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`privacy-erasure:${org}`}))`;
      const [d] = await this.due(tx, c, today, personId);
      if (!d) return null;
      const employees = await tx.employee.findMany({ where: { organizationId: org, personId }, select: { id: true } });
      const aadhaar = await tx.employeeIdentifiers.updateMany({
        where: { organizationId: org, employeeId: { in: employees.map((e) => e.id) }, OR: [{ aadhaarEnc: { not: null } }, { aadhaarHash: { not: null } }, { aadhaarLast4: { not: null } }] },
        data: { aadhaarEnc: null, aadhaarHash: null, aadhaarLast4: null },
      });
      const bgv = await tx.$executeRaw`UPDATE bgv_checks b SET note = NULL, result_document_id = NULL, updated_at = now()
        FROM preboardings p WHERE p.organization_id = b.organization_id AND p.id = b.preboarding_id AND b.organization_id = ${org}::uuid
          AND p.person_id = ${personId}::uuid AND (b.note IS NOT NULL OR b.result_document_id IS NOT NULL)`;
      const refs = await tx.$queryRaw<{ ref: string }[]>`SELECT f.storage_ref AS ref FROM documents d
        JOIN document_versions v ON v.organization_id = d.organization_id AND v.document_id = d.id
        JOIN files f ON f.organization_id = v.organization_id AND f.id = v.file_id
        WHERE d.organization_id = ${org}::uuid AND d.person_id = ${personId}::uuid AND d.type_key IN (${Prisma.join([...SPECIAL_DOCUMENT_TYPES])})`;
      // Stored bytes go first: if the transaction then fails, the next run finds the rows and finishes (drop is idempotent).
      for (const r of refs) await this.store.drop(r.ref);
      // The app may not delete documents (kept as uploaded); the owner's function does it for these two types only.
      const [{ n: documents }] = await tx.$queryRaw<{ n: number }[]>`SELECT erase_special_documents(${org}::uuid, ${personId}::uuid) AS n`;
      const n = { aadhaar: aadhaar.count, documents, backgroundChecks: bgv };
      // Counts and the period only: the audit never carries the values it deleted.
      await audit(tx, c, 'privacy.special.erased', 'person', personId, { ...n, keptYears: d.years });
      return n;
    });
  }
}
