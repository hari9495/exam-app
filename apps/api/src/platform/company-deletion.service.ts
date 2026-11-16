import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { FileStore } from '../documents/file-store';
import { EmailService } from '../email/email.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { companyStoredFiles } from './stored-files';
import { addDays, todayIst } from '../org-structure/org-validation';
import { PLATFORM, staffActor } from './platform.service';

const KEEP_KEY = 'account.closure.keep_days';

/** The database's own refusals (P0001) are a conflict, in its words; anything else stays an error. */
function refused(e: unknown): never {
  // Prisma words it as: Raw query failed. Code: `P0001`. Message: `ERROR: <the database's message>`
  const m = e instanceof Error ? /Message: `(?:ERROR: )?([^`]+)`/.exec(e.message) : null;
  if (m && e instanceof Error && /P0001/.test(e.message)) throw new ConflictException(m[1]);
  throw e;
}

/** What purge_company returns: the certificate as stored, and its SHA-256. */
type Purged = { id: string; certificate: Record<string, unknown> & { rows: number; recordsKeptUntil: string }; sha256: string };

/** What release_company_records returns (answer 1976). */
export type Released = { released: { group: string; rows: number; sha256: string }[]; waiting: string[]; companyRemoved: boolean };

/**
 * Answer 1882: deleting a closed company's data after its kept days (account.closure.keep_days, 30). One YukthiX staff
 * member asks, a second confirms (both with the security key, at the controller); the database deletes the company's
 * rows only (purge_company), keeping its statutory records read-only for their legal period (answer 1975), and refuses
 * an open company or one under a legal hold; the stored files are dropped after; a deletion certificate is kept with a
 * SHA-256 of its text. Every step is audited outside the company (it is gone).
 */
@Injectable()
export class CompanyDeletionService {
  private readonly logger = new Logger(CompanyDeletionService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FileStore,
    private readonly email: EmailService,
  ) {}

  /** The day the company's data may be deleted from: its closure request's kept-until day, else the close day + kept days. */
  private async keptUntil(organizationId: string): Promise<{ org: { name: string; slug: string; lifecycle: string; lifecycleChangedAt: Date; recordsKeptUntil: Date | null }; keepUntil: string }> {
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { name: true, slug: true, lifecycle: true, lifecycleChangedAt: true, recordsKeptUntil: true } });
      if (!org) throw new NotFoundException('Company not found');
      if (org.lifecycle !== 'closed') throw new ConflictException('Only a closed company’s data can be deleted.');
      if (org.recordsKeptUntil) throw new ConflictException('This company’s data was already deleted; its statutory records are kept.');
      if (await tx.auditLegalHold.findFirst({ where: { organizationId, releasedAt: null, toAt: { gt: new Date() } }, select: { id: true } })) throw new ConflictException('A legal hold is in place for this company: its data stays.');
      const asked = await tx.accountClosureRequest.findFirst({ where: { organizationId, status: 'closed' }, orderBy: { decidedAt: 'desc' }, select: { keepUntil: true } });
      const v = Number((await tx.platformSetting.findUnique({ where: { key: KEEP_KEY } }))?.value);
      const days = Number.isInteger(v) && v > 0 ? v : 30;
      const keepUntil = asked?.keepUntil ? asked.keepUntil.toISOString().slice(0, 10) : addDays(org.lifecycleChangedAt.toISOString().slice(0, 10), days);
      return { org, keepUntil };
    });
  }

  private async ready(organizationId: string) {
    const k = await this.keptUntil(organizationId);
    if (todayIst() <= k.keepUntil) throw new ConflictException(`The data is kept until ${k.keepUntil}; it can be deleted after that day.`);
    return k;
  }

  async request(actorUserId: string, organizationId: string, reason: string) {
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    const { org, keepUntil } = await this.ready(organizationId);
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      if (await tx.companyDeletion.findFirst({ where: { organizationId, status: 'requested' } })) throw new ConflictException('Deleting this company’s data is already asked for; a second staff member confirms it.');
      const row = await tx.companyDeletion.create({ data: { organizationId, companyName: org.name, companySlug: org.slug, reason: reason.trim(), requestedBy: actorUserId } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, actor, action: 'platform.company.deletion_requested', entityType: 'company_deletion', entityId: row.id, metadata: { organizationId, company: org.name, keepUntil, reason: reason.trim() } });
      return { id: row.id, status: row.status };
    });
  }

  async withdraw(actorUserId: string, organizationId: string) {
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const row = await tx.companyDeletion.findFirst({ where: { organizationId, status: 'requested' } });
      if (!row) throw new NotFoundException('There is no deletion to withdraw.');
      await tx.companyDeletion.update({ where: { id: row.id }, data: { status: 'withdrawn' } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, actor, action: 'platform.company.deletion_withdrawn', entityType: 'company_deletion', entityId: row.id, metadata: { organizationId } });
    });
  }

  /**
   * The second staff member confirms. In one transaction: the request records the second person, the stored files are
   * listed, and purge_company deletes everything but the statutory records (answer 1975), checking the request, the
   * second person and the kept days itself, and marks the request done with the certificate. The files follow.
   */
  async confirm(actorUserId: string, organizationId: string) {
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    await this.ready(organizationId);
    const asked = await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.companyDeletion.findFirst({ where: { organizationId, status: 'requested' } }));
    if (!asked) throw new NotFoundException('Nobody has asked to delete this company’s data yet.');
    if (asked.requestedBy === actorUserId) throw new ForbiddenException('You asked for this deletion: a second staff member confirms it.');
    const { out, files } = await this.tenantPrisma.forTenant(
      PLATFORM,
      async (tx) => {
        await tx.companyDeletion.update({ where: { id: asked.id }, data: { approvedBy: actorUserId } });
        const files = await companyStoredFiles(tx, organizationId);
        const extra = { storedFiles: { dropped: files.drop.length, keptWithRecords: files.kept.length } };
        const [r] = await tx.$queryRaw<{ out: Purged }[]>`SELECT purge_company(${organizationId}::uuid, ${JSON.stringify(extra)}::jsonb) AS out`.catch(refused);
        const out = r!.out;
        await AuditService.recordIn(tx, PLATFORM, { actorUserId, actor, action: 'platform.company.deleted', entityType: 'company_deletion', entityId: asked.id, metadata: { organizationId, company: asked.companyName, rows: out.certificate.rows, recordsKeptUntil: out.certificate.recordsKeptUntil, storedFiles: extra.storedFiles, certificateSha256: out.sha256, askedBy: asked.requestedBy } });
        return { out, files };
      },
      { timeout: 300_000 },
    );
    // The rows are gone; their stored files follow (a file that cannot be dropped is logged, never brought back).
    let dropped = 0;
    for (const ref of files.drop) {
      try {
        await this.files.drop(ref);
        dropped++;
      } catch (e) {
        this.logger.warn(`Stored file not dropped after deleting ${organizationId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { id: out.id, certificate: out.certificate, certificateSha256: out.sha256, storedFilesDropped: dropped };
  }

  /**
   * Answer 1976: one purged company's kept records whose day has passed are removed (release_company_records decides
   * and refuses on its own: day not passed, a legal hold, an open or never-purged company), with a certificate per
   * group, audited in the same transaction. Two workers at once: an advisory lock per company, and the function locks
   * the company row; a removed group stays removed. The stored files the removed records held are dropped after.
   * Returns null when nothing was due (the database's refusal, in its words, is logged at debug level).
   */
  async releaseExpired(organizationId: string): Promise<Released | null> {
    let res: { out: Released; drop: string[] };
    try {
      res = await this.tenantPrisma.forTenant(
        PLATFORM,
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`retention-release:${organizationId}`}))`;
          const before = await companyStoredFiles(tx, organizationId);
          const [r] = await tx.$queryRaw<{ out: Released }[]>`SELECT release_company_records(${organizationId}::uuid) AS out`;
          const out = r!.out;
          if (!out.released.length) return { out, drop: [] };
          const after = await companyStoredFiles(tx, organizationId);
          const still = new Set([...after.kept, ...after.drop]);
          await AuditService.recordIn(tx, PLATFORM, { actorUserId: null, action: 'platform.company.kept_records_removed', entityType: 'company', entityId: organizationId, metadata: { organizationId, released: out.released, waiting: out.waiting, companyRemoved: out.companyRemoved } });
          return { out, drop: before.kept.filter((f) => !still.has(f)) };
        },
        { timeout: 300_000 },
      );
    } catch (e) {
      const m = e instanceof Error ? /Message: `(?:ERROR: )?([^`]+)`/.exec(e.message) : null;
      if (m && e instanceof Error && /P0001/.test(e.message)) {
        this.logger.debug(`Kept records of ${organizationId} not removed: ${m[1]}`);
        return null;
      }
      throw e;
    }
    for (const ref of res.drop) await this.files.drop(ref).catch((e: unknown) => this.logger.warn(`Stored file not dropped after removing kept records of ${organizationId}: ${e instanceof Error ? e.message : String(e)}`));
    if (res.out.released.length) await this.tellDeleters(organizationId, res.out);
    return res.out;
  }

  /**
   * Answer 2084: the two staff members who asked for and confirmed the deletion hear of each removal (the company's
   * own people are gone). A notice that cannot be sent is logged; the removal stands.
   */
  private async tellDeleters(organizationId: string, out: Released) {
    try {
      const { d, to } = await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
        const d = await tx.companyDeletion.findFirst({ where: { organizationId, status: 'done' }, orderBy: { deletedAt: 'asc' }, select: { companyName: true, requestedBy: true, approvedBy: true } });
        const ids = [d?.requestedBy, d?.approvedBy].filter((x): x is string => Boolean(x));
        const to = (await tx.user.findMany({ where: { id: { in: ids }, organizationId: null, status: 'active' }, select: { email: true } })).map((u) => u.email);
        return { d, to };
      });
      if (!d || !to.length) return;
      const words: Record<string, string> = { audit: 'the audit log', pay: 'the payroll records', filings: 'the statutory filings', company: 'the company and its people' };
      const lines = out.released.map((r) => `<li>${escapeHtml(words[r.group] ?? r.group)}: ${r.rows} rows, certificate SHA-256 ${r.sha256}</li>`).join('');
      const subject = `Kept records removed: ${d.companyName}`.slice(0, 150);
      const html = `<p>The kept statutory records of ${escapeHtml(d.companyName)} reached their day and were removed:</p><ul>${lines}</ul><p>${out.companyRemoved ? 'Nothing of the company is left; the certificates stay in the console list of deletions.' : 'Open the company in the console to see each removal and its certificate.'}</p>`;
      for (const email of to) await this.email.send({ to: email, subject, html }).catch((e: unknown) => this.logger.warn(`Removal notice to staff failed: ${e instanceof Error ? e.message : String(e)}`));
    } catch (e) {
      this.logger.warn(`Removal notice for ${organizationId} not sent: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Answer 2083: a legal hold staff set on a deleted company; until it ends, the nightly removal leaves its kept records. */
  async setHold(actorUserId: string, organizationId: string, input: { caseRef: string; reason: string; until: string }) {
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    if (input.until <= todayIst()) throw new ConflictException('Choose a last day after today.');
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { name: true, recordsKeptUntil: true } });
      if (!org) throw new NotFoundException('Company not found');
      if (!org.recordsKeptUntil) throw new ConflictException('Only a deleted company’s kept records take a hold here; a company in use sets its own legal holds.');
      const hold = await tx.auditLegalHold.create({ data: { organizationId, caseRef: input.caseRef, reason: input.reason, fromAt: new Date(), toAt: new Date(`${input.until}T23:59:59.999+05:30`), setBy: actorUserId } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, actor, action: 'platform.company.legal_hold_set', entityType: 'company', entityId: organizationId, metadata: { organizationId, company: org.name, holdId: hold.id, caseRef: input.caseRef, until: input.until, reason: input.reason } });
      return { id: hold.id };
    });
  }

  /** Answer 2083: ending a hold on a deleted company, with a reason (audited). */
  async endHold(actorUserId: string, organizationId: string, holdId: string, reason: string) {
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const hold = await tx.auditLegalHold.findFirst({ where: { id: holdId, organizationId, releasedAt: null } });
      if (!hold) throw new NotFoundException('There is no such hold in force.');
      const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { recordsKeptUntil: true } });
      if (!org?.recordsKeptUntil) throw new ConflictException('Only a deleted company’s holds are ended here.');
      await tx.auditLegalHold.update({ where: { id: hold.id }, data: { releasedAt: new Date(), releasedBy: actorUserId } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, actor, action: 'platform.company.legal_hold_ended', entityType: 'company', entityId: organizationId, metadata: { organizationId, holdId, caseRef: hold.caseRef, reason } });
      return { ended: true };
    });
  }

  /** Answer 1976, the nightly sweep: every purged company (its kept records are only ever removed here). */
  async releaseSweep(): Promise<{ companies: number; released: number }> {
    const orgs = await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.organization.findMany({ where: { lifecycle: 'closed', recordsKeptUntil: { not: null } }, select: { id: true } }));
    let released = 0;
    for (const { id } of orgs) {
      try {
        released += (await this.releaseExpired(id))?.released.length ?? 0;
      } catch (e) {
        this.logger.error(`Removing the kept records of ${id} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { companies: orgs.length, released };
  }

  /** Answer 1973: the deletion certificate exactly as stored (its text and SHA-256), for the console to download. */
  async certificate(actorUserId: string, organizationId: string) {
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const row = await tx.companyDeletion.findFirst({ where: { organizationId, status: 'done' }, orderBy: { deletedAt: 'desc' }, select: { id: true, companySlug: true, certificate: true, certificateSha256: true } });
      if (!row?.certificate) throw new NotFoundException('This company’s data has not been deleted: there is no certificate.');
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, actor, action: 'platform.company.deletion_certificate_downloaded', entityType: 'company_deletion', entityId: row.id, metadata: { organizationId } });
      // Answer 1976: the second certificates, one per kept group removed after its day.
      const removals = await tx.companyRecordGroup.findMany({ where: { organizationId, releasedAt: { not: null } }, orderBy: { releasedAt: 'asc' }, select: { recordGroup: true, releasedAt: true, certificate: true, certificateSha256: true } });
      return { fileName: `yukthix-deletion-certificate-${row.companySlug}.json`, certificate: row.certificate, certificateSha256: row.certificateSha256, removals };
    });
  }

  async list(actorUserId: string) {
    await staffActor(this.tenantPrisma, actorUserId);
    const rows = await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.companyDeletion.findMany({ orderBy: { requestedAt: 'desc' }, take: 100 }));
    return rows.map((r) => ({ id: r.id, organizationId: r.organizationId, company: r.companyName, status: r.status, reason: r.reason, requestedBy: r.requestedBy, requestedAt: r.requestedAt, approvedBy: r.approvedBy, deletedAt: r.deletedAt, certificate: r.certificate ? (JSON.parse(r.certificate) as unknown) : null, certificateSha256: r.certificateSha256 }));
  }
}
