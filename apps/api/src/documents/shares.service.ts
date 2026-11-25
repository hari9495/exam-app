import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { ScopeUser, buildViewer } from '../access/scope';
import { FileStore, sha256 } from './file-store';
import { FilesService } from './files.service';
import { ownOf } from './person-access';

// PPL-30 "Share an expiring link" (founder 26 Oct 2026). An employee shares one of their OWN issued letters or pay
// documents (never an upload, never someone else's, never Special-class data) with an outsider:
//   - the token is 32 random bytes; only its SHA-256 is stored, so the table never holds a usable link;
//   - the employee picks 1, 7 or 30 days (the database refuses more); "Stop sharing" revokes it at once;
//   - the public route opens exactly that one document read-only, checks it is still issued, and audits every open.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const gone = () => new NotFoundException('This link has expired or was stopped. Ask the person who shared it for a new one.');

@Injectable()
export class DocumentSharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FilesService,
    private readonly store: FileStore,
  ) {}

  private async me(user: ScopeUser) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, []);
    if (!v.userId || v.actingForOther) throw new ForbiddenException('Only you can share your own documents.');
    return v;
  }

  /** Creates a link to one of the caller's own issued documents. The token is returned once and never stored. */
  async create(ctx: TenantContext, user: ScopeUser, dto: { source: 'letter' | 'pay'; id: string; days: 1 | 7 | 30 }) {
    const v = await this.me(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await ownOf(tx, c, v);
      if (!own.personId) throw new ForbiddenException('Only you can share your own documents.');
      const org = c.organizationId;
      let title: string;
      let employeeId: string | null = null;
      if (dto.source === 'letter') {
        const l = await tx.letterIssue.findFirst({ where: { organizationId: org, id: dto.id, personId: own.personId, status: 'issued', fileId: { not: null } } });
        if (!l) throw new NotFoundException('No such letter.');
        title = l.title;
      } else {
        const mine = await tx.employee.findMany({ where: { organizationId: org, userId: v.userId! }, select: { id: true } });
        const d = await tx.payDocument.findFirst({ where: { organizationId: org, id: dto.id, employeeId: { in: mine.map((e) => e.id) }, status: 'issued', purgedAt: null } });
        if (!d) throw new NotFoundException('No such document.');
        title = d.title;
        employeeId = d.employeeId;
      }
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + dto.days * 86_400_000);
      const s = await tx.documentShare.create({ data: { organizationId: org, userId: v.userId!, personId: own.personId, source: dto.source, sourceId: dto.id, employeeId, title: title.slice(0, 200), tokenHash: hash(token), expiresAt } });
      await audit(tx, c, 'document.share.created', 'document_share', s.id, { source: dto.source, sourceId: dto.id, days: dto.days });
      return { id: s.id, path: `/public/shares/${org}/${token}`, expiresAt: expiresAt.toISOString() };
    });
  }

  /** The caller's links that still work. */
  async mine(ctx: TenantContext, user: ScopeUser) {
    const v = await this.me(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.documentShare.findMany({ where: { organizationId: c.organizationId, userId: v.userId!, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, take: 200 });
      return rows.map((s) => ({ id: s.id, source: s.source, sourceId: s.sourceId, title: s.title, expiresAt: s.expiresAt.toISOString(), opens: s.opens, lastOpenedAt: s.lastOpenedAt?.toISOString() ?? null }));
    });
  }

  /** Stops one of the caller's links now. */
  async revoke(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.me(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const done = await tx.documentShare.updateMany({ where: { organizationId: c.organizationId, id, userId: v.userId!, revokedAt: null }, data: { revokedAt: new Date() } });
      if (!done.count) throw new NotFoundException('No such link.');
      await audit(tx, c, 'document.share.revoked', 'document_share', id);
      return { ok: true };
    });
  }

  /** Public, no sign-in: the one shared document, while the link works and the document is still issued. */
  async open(org: string, token: string, ip: string | null): Promise<{ file: Buffer; name: string }> {
    if (!UUID.test(org) || !TOKEN.test(token)) throw gone();
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const s = await tx.documentShare.findFirst({ where: { organizationId: org, tokenHash: hash(token) } });
      if (!s || s.revokedAt || s.expiresAt <= new Date()) throw gone();
      const file = s.source === 'letter' ? await this.letterBytes(tx, s) : await this.payBytes(tx, s);
      await tx.documentShare.update({ where: { id: s.id }, data: { opens: { increment: 1 }, lastOpenedAt: new Date() } });
      await audit(tx, c, 'document.share.opened', 'document_share', s.id, { source: s.source, sourceId: s.sourceId, ip });
      return { file, name: `${s.title.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 80)}.pdf` };
    });
  }

  private async letterBytes(tx: Tx, s: { organizationId: string; sourceId: string; personId: string }) {
    const l = await tx.letterIssue.findFirst({ where: { organizationId: s.organizationId, id: s.sourceId, personId: s.personId, status: 'issued' } });
    if (!l?.fileId) throw gone();
    return this.files.bytes(await tx.file.findFirstOrThrow({ where: { organizationId: s.organizationId, id: l.fileId } }));
  }

  private async payBytes(tx: Tx, s: { organizationId: string; sourceId: string; employeeId: string | null }) {
    // The pay guard opens only this employee's rows, the way the alumni portal does.
    await tx.$executeRaw`SELECT set_config('app.pay_portal_employee', ${s.employeeId}, true)`;
    const d = await tx.payDocument.findFirst({ where: { organizationId: s.organizationId, id: s.sourceId, employeeId: s.employeeId!, status: 'issued', purgedAt: null } });
    if (!d?.fileRef) throw gone();
    const file = await this.store.get(d.fileRef);
    if (sha256(file) !== d.sha256) throw new ConflictException('This file does not match the document that was issued, so it is not shown.');
    return file;
  }
}
