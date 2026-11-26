import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, buildViewer, tenantWide } from '../access/scope';
import { settingFor } from '../people/probation';
import { FilesService } from '../documents/files.service';
import { NotificationsService } from '../notifications/notifications.service';

// G4 (item 21, answers 2695-2697 as suggested): company documents in folders. Document managers
// (company.documents.manage, company-wide) make folders and upload, replace and remove documents; everyone in the
// company reads and downloads the documents of "everyone" folders; a "managers" folder is for key holders only.
// A document may expire: the uploader and the managers are told once, company_docs.expiry_reminder_days before.
// Policies with acknowledgement stay in Policies (2697).
const ANY_ENTITY = { legalEntityId: '00000000-0000-0000-0000-000000000000' };
const KEY = 'company.documents.manage';
const MIME = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png'] as const;
const MAX_MB = 25;
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const addDays = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

@Injectable()
export class CompanyDocsService {
  private readonly logger = new Logger(CompanyDocsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
  ) {}

  private async manager(user: ScopeUser) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, [KEY]);
    return tenantWide(v, KEY) && !v.actingForOther;
  }

  private async must(user: ScopeUser) {
    if (!(await this.manager(user))) throw new NotFoundException('Not found');
  }

  private async folder(tx: Tx, c: CompanyContext, id: string, manager: boolean) {
    const f = await tx.companyDocFolder.findFirst({ where: { organizationId: c.organizationId, id, removedAt: null } });
    if (!f || (f.audience === 'managers' && !manager)) throw new NotFoundException('No such folder.');
    return f;
  }

  /** The folders I may see with their document counts, and the documents of one of them (or the first). */
  async list(ctx: TenantContext, user: ScopeUser, folderId?: string) {
    const manager = await this.manager(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const today = todayIst();
      const remindDays = Number(await settingFor(tx, c, 'company_docs.expiry_reminder_days', ANY_ENTITY)) || 30;
      const folders = await tx.companyDocFolder.findMany({ where: { organizationId: c.organizationId, removedAt: null, ...(manager ? {} : { audience: 'everyone' }) }, orderBy: { name: 'asc' } });
      const counts = await tx.companyDocument.groupBy({ by: ['folderId'], where: { organizationId: c.organizationId, removedAt: null, folderId: { in: folders.map((f) => f.id) } }, _count: { _all: true } });
      const open = folderId ? folders.find((f) => f.id === folderId) : folders[0];
      if (folderId && !open) throw new NotFoundException('No such folder.');
      const docs = open ? await tx.companyDocument.findMany({ where: { organizationId: c.organizationId, folderId: open.id, removedAt: null }, orderBy: { title: 'asc' } }) : [];
      const files = await tx.file.findMany({ where: { organizationId: c.organizationId, id: { in: docs.map((d) => d.fileId) } }, select: { id: true, fileName: true, size: true, scanStatus: true } });
      const people = await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: docs.map((d) => d.uploadedBy) } }, select: { id: true, name: true, email: true } });
      return {
        canManage: manager,
        remindDays,
        folders: folders.map((f) => ({ id: f.id, name: f.name, audience: f.audience as 'everyone' | 'managers', count: counts.find((x) => x.folderId === f.id)?._count._all ?? 0 })),
        folderId: open?.id ?? null,
        documents: docs.map((d) => {
          const f = files.find((x) => x.id === d.fileId);
          const exp = iso(d.expiresOn);
          const u = people.find((p) => p.id === d.uploadedBy);
          return {
            id: d.id,
            title: d.title,
            fileName: f?.fileName ?? '',
            size: f?.size ?? 0,
            scan: f?.scanStatus ?? 'pending',
            expiresOn: exp,
            status: !exp ? 'No expiry' : exp < today ? 'Expired' : exp <= addDays(today, remindDays) ? 'Expiring soon' : 'Valid',
            updatedAt: d.updatedAt.toISOString(),
            updatedBy: u?.name ?? u?.email ?? 'Former user',
          };
        }),
      };
    });
  }

  async addFolder(ctx: TenantContext, user: ScopeUser, dto: { name: string; audience: 'everyone' | 'managers' }) {
    await this.must(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      try {
        const f = await tx.companyDocFolder.create({ data: { organizationId: c.organizationId, name: dto.name.trim(), audience: dto.audience, createdBy: c.userId! } });
        await audit(tx, c, 'company_docs.folder_added', 'company_doc_folder', f.id, { name: f.name, audience: f.audience });
        return { id: f.id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A folder with this name exists.');
        throw e;
      }
    });
  }

  /** A folder is removed only when it is empty (documents are removed one by one, audited). */
  async removeFolder(ctx: TenantContext, user: ScopeUser, id: string) {
    await this.must(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const f = await this.folder(tx, c, id, true);
      if (await tx.companyDocument.count({ where: { organizationId: c.organizationId, folderId: f.id, removedAt: null } })) throw new ConflictException('Remove or move the documents in this folder first.');
      await tx.companyDocFolder.update({ where: { id: f.id }, data: { removedAt: new Date() } });
      await audit(tx, c, 'company_docs.folder_removed', 'company_doc_folder', f.id, { name: f.name });
      return { removed: true };
    });
  }

  private checkExpiry(expiresOn?: string | null) {
    if (expiresOn && expiresOn.slice(0, 10) < todayIst()) throw new BadRequestException('The expiry date is in the past.');
  }

  /** Upload a document (or a new version of one: `replaceId`); the file is virus-checked before anyone can open it. */
  async upload(ctx: TenantContext, user: ScopeUser, dto: { folderId: string; title: string; expiresOn?: string | null; replaceId?: string }, file?: { originalname: string; buffer: Buffer }) {
    await this.must(user);
    if (!file) throw new BadRequestException('Choose the file to upload.');
    this.checkExpiry(dto.expiresOn);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const f = await this.folder(tx, c, dto.folderId, true);
      const stored = await this.files.storeIn(tx, c, { area: 'company-docs', name: file.originalname, data: file.buffer, allowedMime: MIME, maxMb: MAX_MB, via: 'staff' });
      const expiresOn = dto.expiresOn ? day(dto.expiresOn.slice(0, 10)) : null;
      if (dto.replaceId) {
        const cur = await tx.companyDocument.findFirst({ where: { organizationId: c.organizationId, id: dto.replaceId, removedAt: null } });
        if (!cur) throw new NotFoundException('No such document.');
        await tx.companyDocument.update({ where: { id: cur.id }, data: { folderId: f.id, title: dto.title.trim(), fileId: stored.id, expiresOn, remindedAt: null, uploadedBy: c.userId!, updatedAt: new Date() } });
        await audit(tx, c, 'company_docs.document_replaced', 'company_document', cur.id, { title: dto.title.trim(), folder: f.name, expiresOn: iso(expiresOn) });
        return { id: cur.id, fileId: stored.id };
      }
      const d = await tx.companyDocument.create({ data: { organizationId: c.organizationId, folderId: f.id, title: dto.title.trim(), fileId: stored.id, expiresOn, uploadedBy: c.userId! } });
      await audit(tx, c, 'company_docs.document_added', 'company_document', d.id, { title: d.title, folder: f.name, expiresOn: iso(expiresOn) });
      return { id: d.id, fileId: stored.id };
    });
    void this.files.scan(ctx.organizationId!, out.fileId).catch((e: Error) => this.logger.warn(`company doc scan: ${e.message}`));
    return { id: out.id };
  }

  async remove(ctx: TenantContext, user: ScopeUser, id: string) {
    await this.must(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const d = await tx.companyDocument.findFirst({ where: { organizationId: c.organizationId, id, removedAt: null } });
      if (!d) throw new NotFoundException('No such document.');
      await tx.companyDocument.update({ where: { id: d.id }, data: { removedAt: new Date(), removedBy: c.userId } });
      await audit(tx, c, 'company_docs.document_removed', 'company_document', d.id, { title: d.title });
      return { removed: true };
    });
  }

  /** The file, for someone who may see its folder; only a clean file opens; each download is audited. */
  async download(ctx: TenantContext, user: ScopeUser, id: string) {
    const manager = await this.manager(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const d = await tx.companyDocument.findFirst({ where: { organizationId: c.organizationId, id, removedAt: null } });
      if (!d) throw new NotFoundException('No such document.');
      await this.folder(tx, c, d.folderId, manager);
      const file = await tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: d.fileId } });
      const data = await this.files.bytes(file);
      await audit(tx, c, 'company_docs.document_downloaded', 'company_document', d.id, { title: d.title });
      return { name: file.fileName, mime: file.mime, data };
    });
  }

  /** Daily: documents expiring within the company's days; the uploader and the document managers hear once. */
  async remindExpiring(): Promise<number> {
    const today = todayIst();
    const rows = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.companyDocument.findMany({ where: { removedAt: null, remindedAt: null, expiresOn: { gte: day(today), lte: day(addDays(today, 90)) } }, take: 1000 }),
    );
    let sent = 0;
    for (const org of [...new Set(rows.map((r) => r.organizationId))]) {
      try {
        const out = await inCompany(this.tenantPrisma, { organizationId: org, isSuperAdmin: false }, async (tx, c) => {
          const days = Number(await settingFor(tx, c, 'company_docs.expiry_reminder_days', ANY_ENTITY)) || 30;
          const due = rows.filter((r) => r.organizationId === org && iso(r.expiresOn)! <= addDays(today, days));
          if (!due.length) return [];
          const like = `%"${KEY}"%`;
          // Company-wide holders: the System Admins, profiles with the key, and active company-wide grants.
          const managers = await tx.$queryRaw<{ id: string }[]>`
            SELECT u.id::text FROM users u WHERE u.organization_id = ${org}::uuid AND u.status = 'active' AND u.role = 'org_admin'
            UNION
            SELECT u.id::text FROM users u JOIN permission_profiles p ON p.organization_id = u.organization_id AND p.id = u.permission_profile_id
            WHERE u.organization_id = ${org}::uuid AND u.status = 'active' AND p.permissions_json LIKE ${like}
            UNION
            SELECT g.user_id::text FROM role_grants g JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
            JOIN users u ON u.organization_id = g.organization_id AND u.id = g.user_id AND u.status = 'active'
            WHERE g.organization_id = ${org}::uuid AND g.status = 'active' AND g.scope_type = 'tenant' AND p.permissions_json LIKE ${like}
              AND g.valid_from <= ${today}::date AND (g.valid_to IS NULL OR g.valid_to >= ${today}::date)
            LIMIT 50`;
          await tx.companyDocument.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { remindedAt: new Date() } });
          return due.map((d) => ({ id: d.id, to: [...new Set([d.uploadedBy, ...managers.map((m) => m.id)])], text: `${d.title} expires on ${iso(d.expiresOn)}. Upload the renewed document.` }));
        });
        for (const n of out) {
          await this.notifications.notifySystem({ organizationId: org, isSuperAdmin: false }, n.to, 'people.company_doc.expiring', { entityType: 'company_document', entityId: n.id, contextText: n.text, linkPath: '/yx/people/company-documents' }, { subject: 'A company document expires soon', html: `<p>${n.text}</p>` }).catch((e: Error) => this.logger.warn(`company doc notice: ${e.message}`));
          sent++;
        }
      } catch (e) {
        this.logger.error(`Company document reminders for ${org} failed: ${(e as Error).message}`);
      }
    }
    return sent;
  }
}
