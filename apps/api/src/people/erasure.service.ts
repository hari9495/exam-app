import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { displayName } from '../employee-history/employee-history.service';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { FileStore } from '../documents/file-store';
import { settingFor } from './probation';

// Founder 30 Oct 2026 (people follow-up 12, and "what Special data erasure deletes"): Special data is deleted when
// privacy.retention.special_years (per legal entity, default 1) has passed since the person's last day, or, for an offer
// that never joined, since the day the joining was cancelled. Special data here is what the setting names, nothing more:
//   the Aadhaar number on the record (sealed value, keyed hash, last four), and in their pre-boarding answers -> cleared;
//   documents of the Special types "aadhaar" (masked copy), "bgv_report" (background check report) and
//   "disability_certificate" -> the file in storage, its versions and the document are deleted;
//   background checks of their joining -> the free-text note and the report link are cleared (type and the result,
//   clear or discrepancy, stay);
//   a disability declaration -> the sealed details and the certificate go; the yes/no answer stays (erased_at).
// Kept: consent records (they prove the checks were lawful); pay records and filings, Aadhaar included (payroll keeps
// its own period). A person still working or serving notice, or joining again, is skipped.
// Safe to re-run: erased data is gone, so the next run finds nothing; each company is locked while it runs.
// Off by default (privacy.erasure.enabled): HR reads the dry run first. The dry run names people; it is never audited.
export const SPECIAL_DOCUMENT_TYPES = ['aadhaar', 'bgv_report', 'disability_certificate'] as const;

export type ErasureCounts = { people: number; aadhaar: number; documents: number; backgroundChecks: number; disability: number };
/** One person in the dry run: the employee code is null for an offer that never joined; `day` is the last day or the cancellation day. */
export type ErasurePerson = { name: string; employeeCode: string | null; day: string; neverJoined: boolean };
type Due = ErasurePerson & { personId: string; years: number; aadhaar: number; documents: number; backgroundChecks: number; disability: number; answers: string[] };
type Candidate = {
  person_id: string; given_name: string; family_name: string | null; preferred_name: string | null; code: string | null; last_day: string; entity_id: string;
  never: boolean; aadhaar: number; documents: number; bgv: number; disability: number; answers: string[];
};
type Answers = { identity?: { aadhaar?: string | null } };

const zero = (): ErasureCounts => ({ people: 0, aadhaar: 0, documents: 0, backgroundChecks: 0, disability: 0 });

@Injectable()
export class ErasureService {
  private readonly logger = new Logger(ErasureService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly store: FileStore,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  /** Pre-boarding answers (sealed with the platform key) that still hold an Aadhaar number. */
  private withAadhaar(answers: string[]): string[] {
    return answers.filter((a) => Boolean((JSON.parse(this.crypto.decrypt(a)) as Answers).identity?.aadhaar));
  }

  /**
   * People with Special data past their entity's period on `today` (one person with `only`): those who left (no job
   * today or later), and offers that never joined (a cancelled joining, no employment). Nobody joining again.
   */
  private async due(tx: Tx, c: CompanyContext, today: string, only?: string): Promise<Due[]> {
    const org = c.organizationId;
    const rows = await tx.$queryRaw<Candidate[]>(Prisma.sql`
      WITH former AS (
        SELECT DISTINCT ON (e.person_id) e.person_id, last.employee_code::text AS code, last.exited_on AS last_day, last.legal_entity_id AS entity_id, false AS never
        FROM employees e
        JOIN LATERAL (SELECT m.exited_on, m.legal_entity_id, m.employee_code FROM employments m WHERE m.organization_id = e.organization_id AND m.employee_id = e.id
                      ORDER BY m.exited_on DESC NULLS FIRST, m.joined_on DESC LIMIT 1) last ON true
        WHERE e.organization_id = ${org}::uuid AND last.exited_on IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM employees e2 JOIN employments m ON m.organization_id = e2.organization_id AND m.employee_id = e2.id
                          WHERE e2.organization_id = e.organization_id AND e2.person_id = e.person_id AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date))
        ORDER BY e.person_id, last.exited_on DESC
      ), never AS (
        SELECT DISTINCT ON (p.person_id) p.person_id, NULL::text AS code, p.cancelled_on AS last_day, p.legal_entity_id AS entity_id, true AS never
        FROM preboardings p
        WHERE p.organization_id = ${org}::uuid AND p.status = 'cancelled' AND p.cancelled_on IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM employees e JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id
                          WHERE e.organization_id = p.organization_id AND e.person_id = p.person_id)
        ORDER BY p.person_id, p.cancelled_on DESC
      ), x AS (SELECT * FROM former UNION ALL SELECT * FROM never)
      SELECT x.person_id::text AS person_id, pr.given_name, pr.family_name, pr.preferred_name, x.code, x.last_day::text AS last_day, x.entity_id::text AS entity_id, x.never,
        (SELECT count(*)::int FROM employee_identifiers i JOIN employees e ON e.organization_id = i.organization_id AND e.id = i.employee_id
           WHERE i.organization_id = pr.organization_id AND e.person_id = x.person_id
           AND (i.aadhaar_enc IS NOT NULL OR i.aadhaar_hash IS NOT NULL OR i.aadhaar_last4 IS NOT NULL)) AS aadhaar,
        (SELECT count(*)::int FROM documents d WHERE d.organization_id = pr.organization_id AND d.person_id = x.person_id
           AND d.type_key IN (${Prisma.join([...SPECIAL_DOCUMENT_TYPES])})) AS documents,
        (SELECT count(*)::int FROM bgv_checks b JOIN preboardings p ON p.organization_id = b.organization_id AND p.id = b.preboarding_id
           WHERE b.organization_id = pr.organization_id AND p.person_id = x.person_id AND (b.note IS NOT NULL OR b.result_document_id IS NOT NULL)) AS bgv,
        (SELECT count(*)::int FROM disability_declarations dd JOIN employees e ON e.organization_id = dd.organization_id AND e.id = dd.employee_id
           WHERE dd.organization_id = pr.organization_id AND e.person_id = x.person_id AND (dd.details_enc IS NOT NULL OR dd.certificate_document_id IS NOT NULL)) AS disability,
        ARRAY(SELECT p.answers_enc FROM preboardings p WHERE p.organization_id = pr.organization_id AND p.person_id = x.person_id AND p.answers_enc IS NOT NULL) AS answers
      FROM x
      JOIN persons pr ON pr.organization_id = ${org}::uuid AND pr.id = x.person_id
      WHERE x.last_day < ${today}::date
        ${only ? Prisma.sql`AND x.person_id = ${only}::uuid` : Prisma.empty}
        AND NOT EXISTS (SELECT 1 FROM preboardings p WHERE p.organization_id = pr.organization_id AND p.person_id = x.person_id AND p.status = 'invited')
      ORDER BY x.last_day, pr.given_name`);
    const out: Due[] = [];
    const years = new Map<string, number>();
    for (const r of rows) {
      const answers = this.withAadhaar(r.answers);
      if (!r.aadhaar && !answers.length && !r.documents && !r.bgv && !r.disability) continue;
      if (!years.has(r.entity_id)) years.set(r.entity_id, Number(await settingFor(tx, c, 'privacy.retention.special_years', { legalEntityId: r.entity_id })));
      const n = years.get(r.entity_id)!;
      // Kept through the day n years after the last day; 0 means deleted the day after they leave.
      const [{ ends }] = await tx.$queryRaw<{ ends: string }[]>`SELECT (${r.last_day}::date + make_interval(years => ${n}::int))::date::text AS ends`;
      if (ends >= today) continue;
      out.push({
        personId: r.person_id,
        name: displayName({ givenName: r.given_name, familyName: r.family_name, preferredName: r.preferred_name }),
        employeeCode: r.code,
        day: r.last_day,
        neverJoined: r.never,
        years: n,
        aadhaar: r.aadhaar + answers.length,
        documents: r.documents,
        backgroundChecks: r.bgv,
        disability: r.disability,
        answers,
      });
    }
    return out;
  }

  private sum(due: Due[]): ErasureCounts {
    return due.reduce(
      (t, d) => ({ people: t.people + 1, aadhaar: t.aadhaar + d.aadhaar, documents: t.documents + d.documents, backgroundChecks: t.backgroundChecks + d.backgroundChecks, disability: t.disability + d.disability }),
      zero(),
    );
  }

  /**
   * The dry run (counts, and who: name, employee code, last day; never a value) and the last real run. The caller
   * checked org.settings.manage company-wide. Reading it is not audited (founder 30 Oct 2026).
   */
  report(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const enabled = (await settingFor(tx, c, 'privacy.erasure.enabled', { legalEntityId: '' })) === 'on';
      const last = await tx.auditLog.findFirst({ where: { organizationId: c.organizationId, action: 'privacy.erasure.run' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, metadataJson: true } });
      const m = (last?.metadataJson ? JSON.parse(last.metadataJson) : {}) as Partial<ErasureCounts & { failed: number }>;
      const due = await this.due(tx, c, todayIst());
      return {
        enabled,
        due: this.sum(due),
        who: due.map(({ name, employeeCode, day, neverJoined }): ErasurePerson => ({ name, employeeCode, day, neverJoined })),
        lastRun: last
          ? { at: last.createdAt.toISOString(), people: m.people ?? 0, aadhaar: m.aadhaar ?? 0, documents: m.documents ?? 0, backgroundChecks: m.backgroundChecks ?? 0, disability: m.disability ?? 0, failed: m.failed ?? 0 }
          : null,
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
        done.disability += n.disability;
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
      const employees = (await tx.employee.findMany({ where: { organizationId: org, personId }, select: { id: true } })).map((e) => e.id);
      const aadhaar = await tx.employeeIdentifiers.updateMany({
        where: { organizationId: org, employeeId: { in: employees }, OR: [{ aadhaarEnc: { not: null } }, { aadhaarHash: { not: null } }, { aadhaarLast4: { not: null } }] },
        data: { aadhaarEnc: null, aadhaarHash: null, aadhaarLast4: null },
      });
      // The Aadhaar typed in the pre-boarding portal: only that field goes; the other answers stay sealed as they were.
      const sealed = await tx.preboarding.findMany({ where: { organizationId: org, personId, answersEnc: { in: d.answers } }, select: { id: true, answersEnc: true } });
      for (const p of sealed) {
        const a = JSON.parse(this.crypto.decrypt(p.answersEnc!)) as Answers;
        delete a.identity!.aadhaar;
        await tx.preboarding.update({ where: { id: p.id }, data: { answersEnc: this.crypto.encrypt(JSON.stringify(a)) } });
      }
      const bgv = await tx.$executeRaw`UPDATE bgv_checks b SET note = NULL, result_document_id = NULL, updated_at = now()
        FROM preboardings p WHERE p.organization_id = b.organization_id AND p.id = b.preboarding_id AND b.organization_id = ${org}::uuid
          AND p.person_id = ${personId}::uuid AND (b.note IS NOT NULL OR b.result_document_id IS NOT NULL)`;
      // Disability: the yes/no answer stays for the HR diversity list; the sealed details and the certificate link go.
      const disability = await tx.disabilityDeclaration.updateMany({
        where: { organizationId: org, employeeId: { in: employees }, OR: [{ detailsEnc: { not: null } }, { certificateDocumentId: { not: null } }] },
        data: { detailsEnc: null, certificateDocumentId: null, erasedAt: new Date() },
      });
      const refs = await tx.$queryRaw<{ ref: string }[]>`SELECT f.storage_ref AS ref FROM documents d
        JOIN document_versions v ON v.organization_id = d.organization_id AND v.document_id = d.id
        JOIN files f ON f.organization_id = v.organization_id AND f.id = v.file_id
        WHERE d.organization_id = ${org}::uuid AND d.person_id = ${personId}::uuid AND d.type_key IN (${Prisma.join([...SPECIAL_DOCUMENT_TYPES])})`;
      // Stored bytes go first: if the transaction then fails, the next run finds the rows and finishes (drop is idempotent).
      for (const r of refs) await this.store.drop(r.ref);
      // The app may not delete documents (kept as uploaded); the owner's function does it for the Special types only.
      const [{ n: documents }] = await tx.$queryRaw<{ n: number }[]>`SELECT erase_special_documents(${org}::uuid, ${personId}::uuid) AS n`;
      const n = { aadhaar: aadhaar.count + sealed.length, documents, backgroundChecks: bgv, disability: disability.count };
      // Counts and the period only: the audit never carries the values it deleted, nor the name.
      await audit(tx, c, 'privacy.special.erased', 'person', personId, { ...n, keptYears: d.years });
      return n;
    });
  }
}
