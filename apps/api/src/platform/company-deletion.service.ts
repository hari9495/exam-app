import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { FileStore } from '../documents/file-store';
import { addDays, todayIst } from '../org-structure/org-validation';
import { PLATFORM, staffActor } from './platform.service';

const KEEP_KEY = 'account.closure.keep_days';

/**
 * Answer 1882: deleting a closed company's data after its kept days (account.closure.keep_days, 30). One YukthiX staff
 * member asks, a second confirms (both with the security key, at the controller); the database deletes the company's
 * rows only (purge_company) and refuses an open company or one under a legal hold; the stored files are dropped after;
 * a deletion certificate is kept with a SHA-256 of its text. Every step is audited outside the company (it is gone).
 */
@Injectable()
export class CompanyDeletionService {
  private readonly logger = new Logger(CompanyDeletionService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FileStore,
  ) {}

  /** The day the company's data may be deleted from: its closure request's kept-until day, else the close day + kept days. */
  private async keptUntil(organizationId: string): Promise<{ org: { name: string; slug: string; lifecycle: string; lifecycleChangedAt: Date }; keepUntil: string }> {
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { name: true, slug: true, lifecycle: true, lifecycleChangedAt: true } });
      if (!org) throw new NotFoundException('Company not found');
      if (org.lifecycle !== 'closed') throw new ConflictException('Only a closed company’s data can be deleted.');
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

  /** The second staff member confirms: the company's rows are deleted in one transaction, then its stored files. */
  async confirm(actorUserId: string, organizationId: string) {
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    const { org, keepUntil } = await this.ready(organizationId);
    const asked = await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.companyDeletion.findFirst({ where: { organizationId, status: 'requested' } }));
    if (!asked) throw new NotFoundException('Nobody has asked to delete this company’s data yet.');
    if (asked.requestedBy === actorUserId) throw new ForbiddenException('You asked for this deletion: a second staff member confirms it.');
    const refs = await this.tenantPrisma.forTenant(PLATFORM, async (tx) => [
      ...(await tx.file.findMany({ where: { organizationId }, select: { storageRef: true } })).map((f) => f.storageRef),
      ...(await tx.companyExport.findMany({ where: { organizationId }, select: { fileRef: true } })).map((f) => f.fileRef),
    ]);
    const deletedAt = new Date();
    const { certificate, sha } = await this.tenantPrisma.forTenant(
      PLATFORM,
      async (tx) => {
        const r = await tx.$queryRaw<{ counts: Record<string, number> }[]>`SELECT purge_company(${organizationId}::uuid) AS counts`;
        const tables = Object.fromEntries(Object.entries(r[0]!.counts).sort(([a], [b]) => a.localeCompare(b)));
        const cert = {
          title: 'YukthiX deletion certificate',
          company: { id: organizationId, name: org.name, code: org.slug },
          closedOn: org.lifecycleChangedAt.toISOString().slice(0, 10),
          keptUntil: keepUntil,
          deletedAt: deletedAt.toISOString(),
          askedBy: asked.requestedBy,
          confirmedBy: actorUserId,
          reason: asked.reason,
          rows: Object.values(tables).reduce((a, b) => a + Number(b), 0),
          tables,
          storedFiles: refs.length,
        };
        const text = JSON.stringify(cert);
        const hash = createHash('sha256').update(text).digest('hex');
        await tx.companyDeletion.update({ where: { id: asked.id }, data: { status: 'done', approvedBy: actorUserId, deletedAt, certificate: text, certificateSha256: hash } });
        await AuditService.recordIn(tx, PLATFORM, { actorUserId, actor, action: 'platform.company.deleted', entityType: 'company_deletion', entityId: asked.id, metadata: { organizationId, company: org.name, rows: cert.rows, storedFiles: refs.length, certificateSha256: hash, askedBy: asked.requestedBy } });
        return { certificate: cert, sha: hash };
      },
      { timeout: 300_000 },
    );
    // The rows are gone; the stored files follow (a file that cannot be dropped is logged, never brought back).
    let dropped = 0;
    for (const ref of refs) {
      try {
        await this.files.drop(ref);
        dropped++;
      } catch (e) {
        this.logger.warn(`Stored file not dropped after deleting ${organizationId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { id: asked.id, certificate, certificateSha256: sha, storedFilesDropped: dropped };
  }

  async list(actorUserId: string) {
    await staffActor(this.tenantPrisma, actorUserId);
    const rows = await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.companyDeletion.findMany({ orderBy: { requestedAt: 'desc' }, take: 100 }));
    return rows.map((r) => ({ id: r.id, organizationId: r.organizationId, company: r.companyName, status: r.status, reason: r.reason, requestedBy: r.requestedBy, requestedAt: r.requestedAt, approvedBy: r.approvedBy, deletedAt: r.deletedAt, certificate: r.certificate ? (JSON.parse(r.certificate) as unknown) : null, certificateSha256: r.certificateSha256 }));
  }
}
