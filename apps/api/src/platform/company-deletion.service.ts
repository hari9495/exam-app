import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { FileStore } from '../documents/file-store';
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

  /** Answer 1973: the deletion certificate exactly as stored (its text and SHA-256), for the console to download. */
  async certificate(actorUserId: string, organizationId: string) {
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const row = await tx.companyDeletion.findFirst({ where: { organizationId, status: 'done' }, orderBy: { deletedAt: 'desc' }, select: { id: true, companySlug: true, certificate: true, certificateSha256: true } });
      if (!row?.certificate) throw new NotFoundException('This company’s data has not been deleted: there is no certificate.');
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, actor, action: 'platform.company.deletion_certificate_downloaded', entityType: 'company_deletion', entityId: row.id, metadata: { organizationId } });
      return { fileName: `yukthix-deletion-certificate-${row.companySlug}.json`, certificate: row.certificate, certificateSha256: row.certificateSha256 };
    });
  }

  async list(actorUserId: string) {
    await staffActor(this.tenantPrisma, actorUserId);
    const rows = await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.companyDeletion.findMany({ orderBy: { requestedAt: 'desc' }, take: 100 }));
    return rows.map((r) => ({ id: r.id, organizationId: r.organizationId, company: r.companyName, status: r.status, reason: r.reason, requestedBy: r.requestedBy, requestedAt: r.requestedAt, approvedBy: r.approvedBy, deletedAt: r.deletedAt, certificate: r.certificate ? (JSON.parse(r.certificate) as unknown) : null, certificateSha256: r.certificateSha256 }));
  }
}
