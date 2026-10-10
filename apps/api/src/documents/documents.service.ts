import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { FilesService } from './files.service';
import { CLASS_KEY, ownOf, reachesDocument } from './person-access';

// LIFE-1.03 person documents (P05 §4.2; YX-DOC-04/05/06/17): typed documents of a person (an employee or a joiner:
// they follow the person from before day one into the record), with versions, a verification queue and expiry.
//   - the person uploads their own (types that allow it), HR uploads for them (document.manage + the type's class);
//   - verification-required types wait in the queue; HR verifies or rejects with a reason, never their own document,
//     and only once the file passed the virus check;
//   - a re-upload is a new version and goes back to the queue (YX-DOC-05);
//   - expiring types remind the person at the type's days and turn "expired" on the day (P04 scheduler).

const KEYS = ['document.view', 'document.manage', 'employee.personal.view', 'employee.identity.view'] as const;
type DocType = Prisma.DocumentTypeGetPayload<object>;
type Doc = Prisma.DocumentGetPayload<object>;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const addDays = (d: string, n: number) => new Date(asDate(d).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** Payroll pre-flight (YX-DOC-17, M03 PAY pre-flight): people whose verification-required documents are not verified. */
export async function documentsBlockingPay(tx: Tx, organizationId: string, employmentIds: readonly string[]): Promise<{ employmentId: string; typeKey: string; status: string }[]> {
  if (!employmentIds.length) return [];
  return tx.$queryRaw<{ employmentId: string; typeKey: string; status: string }[]>`
    SELECT em.id::text AS "employmentId", d.type_key AS "typeKey", d.status
    FROM employments em
    JOIN employees e ON e.organization_id = em.organization_id AND e.id = em.employee_id
    JOIN documents d ON d.organization_id = e.organization_id AND d.person_id = e.person_id
    JOIN document_types t ON t.key = d.type_key AND (t.organization_id IS NULL OR t.organization_id = d.organization_id)
    WHERE em.organization_id = ${organizationId}::uuid AND em.id = ANY(${[...employmentIds]}::uuid[])
      AND t.requires_verification AND d.status <> 'verified'
    ORDER BY 1, 2`;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, KEYS);
  }

  private async types(tx: Tx, org: string): Promise<DocType[]> {
    return tx.documentType.findMany({ where: { active: true, OR: [{ organizationId: null }, { organizationId: org }] }, orderBy: [{ organizationId: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }] });
  }

  private async type(tx: Tx, org: string, key: string): Promise<DocType> {
    const t = (await this.types(tx, org)).find((x) => x.key === key);
    if (!t) throw new BadRequestException('No such document type.');
    return t;
  }

  private async personName(tx: Tx, org: string, personId: string) {
    const p = await tx.person.findFirst({ where: { organizationId: org, id: personId } });
    if (!p) throw new NotFoundException('No such person.');
    return [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ');
  }

  /** Can the viewer see (or, with manage, act on) this person's documents of this class? Self always sees their own. */
  private async may(tx: Tx, c: CompanyContext, v: Viewer, action: 'view' | 'manage', t: DocType, personId: string) {
    const own = await ownOf(tx, c, v);
    if (action === 'view' && own.personId === personId) return { self: true, own };
    if (!(await reachesDocument(tx, c, v, action === 'view' ? 'document.view' : 'document.manage', t.sensitivity, personId, own))) {
      // Managing implies viewing (a verifier must open the file).
      if (action === 'view' && (await reachesDocument(tx, c, v, 'document.manage', t.sensitivity, personId, own))) return { self: false, own };
      throw new ForbiddenException('You cannot see this document.');
    }
    return { self: false, own };
  }

  private view(d: Doc, t: DocType, extra: { person?: string; file?: { name: string; scanStatus: string; size: number } | null; versions?: number } = {}) {
    return {
      id: d.id,
      personId: d.personId,
      person: extra.person,
      typeKey: d.typeKey,
      typeName: t.name,
      sensitivity: t.sensitivity,
      requiresVerification: t.requiresVerification,
      status: d.status,
      expiresOn: iso(d.expiresOn),
      rejectReason: d.rejectReason,
      verifiedAt: d.verifiedAt?.toISOString() ?? null,
      file: extra.file ?? null,
      versions: extra.versions ?? 0,
      version: d.version,
    };
  }

  private async fileOf(tx: Tx, org: string, d: Doc) {
    if (!d.currentVersionId) return null;
    const v = await tx.documentVersion.findFirstOrThrow({ where: { organizationId: org, id: d.currentVersionId } });
    return tx.file.findFirstOrThrow({ where: { organizationId: org, id: v.fileId } });
  }

  // ------------------------------------------------------------------------------------------ reads

  async typeList(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) =>
      (await this.types(tx, c.organizationId)).map((t) => ({ key: t.key, name: t.name, sensitivity: t.sensitivity, requiresVerification: t.requiresVerification, allowedMime: t.allowedMime, maxMb: t.maxMb, expiryTracked: t.expiryTracked, uploadBy: t.uploadBy, system: t.organizationId === null })),
    );
  }

  /** A person's documents the viewer may see, plus the types HR could still ask for. */
  async forPerson(ctx: TenantContext, user: ScopeUser, personId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const person = await this.personName(tx, org, personId);
      const types = await this.types(tx, org);
      const docs = await tx.document.findMany({ where: { organizationId: org, personId } });
      const out = [];
      const askable: { key: string; name: string }[] = [];
      let canManage = false;
      for (const t of types) {
        const seen = await this.may(tx, c, v, 'view', t, personId).then(
          () => true,
          () => false,
        );
        const manage = await this.may(tx, c, v, 'manage', t, personId).then(
          (r) => !r.self,
          () => false,
        );
        canManage ||= manage;
        const d = docs.find((x) => x.typeKey === t.key);
        if (d && seen) {
          const f = await this.fileOf(tx, org, d);
          out.push(this.view(d, t, { person, file: f && { name: f.fileName, scanStatus: f.scanStatus, size: f.size }, versions: await tx.documentVersion.count({ where: { organizationId: org, documentId: d.id } }) }));
        } else if (!d && manage) askable.push({ key: t.key, name: t.name });
      }
      return { person, personId, documents: out, askable, canManage };
    });
  }

  /** My own documents (Me › Documents). */
  async mine(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    const personId = await inCompany(this.tenantPrisma, ctx, async (tx, c) => (await ownOf(tx, c, v)).personId);
    if (!personId) return { person: null, personId: null, documents: [], askable: [], canManage: false };
    return this.forPerson(ctx, user, personId);
  }

  /** The verification queue: uploaded documents of verification-required types the viewer may verify. */
  async queue(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has('document.manage')) throw new ForbiddenException('You cannot verify documents.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const types = new Map((await this.types(tx, org)).filter((t) => t.requiresVerification).map((t) => [t.key, t]));
      const rows = await tx.document.findMany({ where: { organizationId: org, status: 'uploaded', typeKey: { in: [...types.keys()] } }, orderBy: { updatedAt: 'asc' }, take: 500 });
      const out = [];
      for (const d of rows) {
        const t = types.get(d.typeKey)!;
        const r = await this.may(tx, c, v, 'manage', t, d.personId).catch(() => null);
        if (!r || r.self || r.own.personId === d.personId) continue;
        const f = await this.fileOf(tx, org, d);
        out.push({ ...this.view(d, t, { person: await this.personName(tx, org, d.personId), file: f && { name: f.fileName, scanStatus: f.scanStatus, size: f.size } }), uploadedAt: d.updatedAt.toISOString() });
      }
      return out;
    });
  }

  // ------------------------------------------------------------------------------------------ writes

  /** HR asks people for a document type (a checklist line they see in Me › Documents). */
  async request(ctx: TenantContext, user: ScopeUser, dto: { personIds: string[]; typeKey: string }) {
    const v = await this.viewer(user);
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const t = await this.type(tx, c.organizationId, dto.typeKey);
      const asked: string[] = [];
      for (const personId of [...new Set(dto.personIds)]) {
        const r = await this.may(tx, c, v, 'manage', t, personId);
        if (r.self) throw new ForbiddenException('You cannot ask yourself for a document.');
        const exists = await tx.document.findFirst({ where: { organizationId: c.organizationId, personId, typeKey: t.key } });
        if (exists && exists.status !== 'rejected' && exists.status !== 'expired') continue;
        if (exists) await tx.document.update({ where: { id: exists.id }, data: { status: 'requested', requestedBy: c.userId ?? null, version: { increment: 1 } } });
        else await tx.document.create({ data: { organizationId: c.organizationId, personId, typeKey: t.key, status: 'requested', requestedBy: c.userId ?? null } });
        await audit(tx, c, 'document.requested', 'person', personId, { typeKey: t.key });
        asked.push(personId);
      }
      const users = await tx.employee.findMany({ where: { organizationId: c.organizationId, personId: { in: asked }, userId: { not: null } }, select: { userId: true } });
      return { asked: asked.length, users: users.map((u) => u.userId!), typeName: t.name };
    });
    if (res.users.length) void this.notifications.notify(ctx, user.userId!, res.users, 'document.requested', { entityType: 'document', entityId: ctx.organizationId as string, contextText: `Please upload: ${res.typeName}`, linkPath: '/yx/me/documents' }).catch(() => undefined);
    return { asked: res.asked };
  }

  /** The person (own, types that allow it) or HR (document.manage + class) uploads; a re-upload is a new version. */
  async upload(ctx: TenantContext, user: ScopeUser, personId: string, typeKey: string, file: { originalname: string; buffer: Buffer } | undefined, expiresOn: string | undefined) {
    if (!file) throw new BadRequestException('Choose a file.');
    if (expiresOn !== undefined && (!ISO.test(expiresOn) || expiresOn <= todayIst())) throw new BadRequestException('The expiry date must be a future date.');
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const t = await this.type(tx, c.organizationId, typeKey);
      const own = await ownOf(tx, c, v);
      const self = own.personId === personId;
      if (self ? !t.uploadBy.includes('person') : !(t.uploadBy.includes('hr') && (await reachesDocument(tx, c, v, 'document.manage', t.sensitivity, personId, own)))) {
        throw new ForbiddenException(self ? 'HR uploads this document for you.' : 'You cannot upload this document for this person.');
      }
      return this.storeVersion(tx, c, personId, t, file, expiresOn, self ? 'self' : 'staff');
    });
    const clean = await this.files.scan(out.org, out.fileId);
    return { ...this.view(out.d, out.t), scanStatus: clean ? 'clean' : 'pending' };
  }

  /** A joiner's own upload from the pre-boarding portal (the portal session already proved who they are). */
  async uploadAsPreboarder(tx: Tx, c: CompanyContext, personId: string, typeKey: string, file: { originalname: string; buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException('Choose a file.');
    const t = await this.type(tx, c.organizationId, typeKey);
    if (!t.uploadBy.includes('person') || t.expiryTracked) throw new ForbiddenException('HR collects this document from you.');
    return this.storeVersion(tx, c, personId, t, file, undefined, 'preboarder');
  }

  /** A background-check report (Special class), stored by HR for the person (lifecycle BGV, 6b). */
  async storeReport(tx: Tx, c: CompanyContext, personId: string, file: { originalname: string; buffer: Buffer }) {
    return this.storeVersion(tx, c, personId, await this.type(tx, c.organizationId, 'bgv_report'), file, undefined, 'staff');
  }

  async scanUpload(org: string, fileId: string) {
    return this.files.scan(org, fileId);
  }

  private async storeVersion(tx: Tx, c: CompanyContext, personId: string, t: DocType, file: { originalname: string; buffer: Buffer }, expiresOn: string | undefined, via: 'self' | 'staff' | 'preboarder') {
    const org = c.organizationId;
    if (t.expiryTracked && !expiresOn) throw new BadRequestException(`Give the expiry date of the ${t.name}.`);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`doc:${org}:${personId}:${t.key}`}))`;
    const stored = await this.files.storeIn(tx, c, { area: 'documents', name: file.originalname, data: file.buffer, allowedMime: t.allowedMime, maxMb: t.maxMb, via });
    let d = await tx.document.findFirst({ where: { organizationId: org, personId, typeKey: t.key } });
    if (!d) d = await tx.document.create({ data: { organizationId: org, personId, typeKey: t.key, status: 'requested' } });
    const n = (await tx.documentVersion.count({ where: { organizationId: org, documentId: d.id } })) + 1;
    const ver = await tx.documentVersion.create({ data: { organizationId: org, documentId: d.id, fileId: stored.id, version: n, uploadedBy: c.userId ?? null } });
    // A type without verification is final on upload; anything needing verification waits in the queue.
    const status = t.requiresVerification ? 'uploaded' : 'verified';
    d = await tx.document.update({
      where: { id: d.id },
      data: { currentVersionId: ver.id, status, expiresOn: expiresOn ? asDate(expiresOn) : null, rejectReason: null, verifiedBy: status === 'verified' ? (c.userId ?? null) : null, verifiedAt: status === 'verified' ? new Date() : null, remindedOn: null, version: { increment: 1 } },
    });
    await audit(tx, c, 'document.uploaded', 'document', d.id, { typeKey: t.key, version: n, via, fileId: stored.id });
    await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'document.uploaded', payload: { documentId: d.id, personId, typeKey: t.key } } });
    return { d, t, fileId: stored.id, org };
  }

  /** Statuses of a person's documents of the given types (the portal's checklist). */
  async statusesFor(tx: Tx, org: string, personId: string, typeKeys: string[]) {
    const types = (await this.types(tx, org)).filter((t) => typeKeys.includes(t.key));
    const docs = await tx.document.findMany({ where: { organizationId: org, personId, typeKey: { in: typeKeys } } });
    return types.map((t) => {
      const d = docs.find((x) => x.typeKey === t.key);
      return { typeKey: t.key, name: t.name, status: d?.status ?? 'requested', rejectReason: d?.rejectReason ?? null, personUploads: t.uploadBy.includes('person') && !t.expiryTracked };
    });
  }

  async verify(ctx: TenantContext, user: ScopeUser, id: string, dto: { decision: 'verify' | 'reject'; reason?: string; version: number }) {
    const v = await this.viewer(user);
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const d = await tx.document.findFirst({ where: { organizationId: org, id } });
      if (!d) throw new NotFoundException('No such document.');
      const t = await this.type(tx, org, d.typeKey);
      const r = await this.may(tx, c, v, 'manage', t, d.personId);
      if (r.self || r.own.personId === d.personId) throw new ForbiddenException('You cannot verify your own document.');
      if (d.status !== 'uploaded') throw new ConflictException('This document is not waiting for verification.');
      const f = await this.fileOf(tx, org, d);
      if (f?.scanStatus !== 'clean') throw new ConflictException('The file has not passed the virus check yet.');
      if (dto.decision === 'reject' && !dto.reason?.trim()) throw new BadRequestException('Say why it is rejected; the person sees it.');
      const n = await tx.document.updateMany({
        where: { organizationId: org, id, version: dto.version, status: 'uploaded' },
        data: dto.decision === 'verify' ? { status: 'verified', verifiedBy: c.userId ?? null, verifiedAt: new Date(), version: { increment: 1 } } : { status: 'rejected', rejectReason: dto.reason!.trim().slice(0, 500), version: { increment: 1 } },
      });
      if (!n.count) throw new ConflictException('Someone else changed this document. Reload it.');
      await audit(tx, c, dto.decision === 'verify' ? 'document.verified' : 'document.rejected', 'document', id, { typeKey: d.typeKey });
      await tx.eventOutbox.create({ data: { organizationId: org, eventType: dto.decision === 'verify' ? 'document.verified' : 'document.rejected', payload: { documentId: id, personId: d.personId, typeKey: d.typeKey } } });
      const owner = await tx.employee.findFirst({ where: { organizationId: org, personId: d.personId, userId: { not: null } }, select: { userId: true } });
      return { owner: owner?.userId ?? null, typeName: t.name };
    });
    if (dto.decision === 'reject' && res.owner) void this.notifications.notify(ctx, user.userId!, [res.owner], 'document.rejected', { entityType: 'document', entityId: id, contextText: `${res.typeName} was not accepted. Please upload it again.`, linkPath: '/yx/me/documents' }).catch(() => undefined);
    return { ok: true };
  }

  /** The current file (or one version) for the person or HR in scope; others' Confidential / Special views are audited. */
  async file(ctx: TenantContext, user: ScopeUser, id: string, versionNo?: number) {
    const v = await this.viewer(user);
    const row = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const d = await tx.document.findFirst({ where: { organizationId: org, id } });
      if (!d) throw new NotFoundException('No such document.');
      const t = await this.type(tx, org, d.typeKey);
      const r = await this.may(tx, c, v, 'view', t, d.personId);
      const ver = versionNo ? await tx.documentVersion.findFirst({ where: { organizationId: org, documentId: id, version: versionNo } }) : d.currentVersionId ? await tx.documentVersion.findFirst({ where: { organizationId: org, id: d.currentVersionId } }) : null;
      if (!ver) throw new NotFoundException('No file uploaded yet.');
      // Earlier versions are for HR only (YX-DOC-05).
      if (r.self && ver.id !== d.currentVersionId) throw new ForbiddenException('Earlier versions are kept for HR.');
      const f = await tx.file.findFirstOrThrow({ where: { organizationId: org, id: ver.fileId } });
      if (!r.self && CLASS_KEY[t.sensitivity] === 'employee.identity.view') await audit(tx, c, 'document.viewed', 'document', id, { typeKey: t.key, version: ver.version });
      return f;
    });
    return { file: await this.files.bytes(row), name: row.fileName, contentType: row.mime };
  }

  // ------------------------------------------------------------------------------------------ expiry (daily)

  /** YX-DOC-06: reminders at the type's days before expiry, "expired" on the day. */
  async expirySweep(today = todayIst()): Promise<{ expired: number; reminded: number }> {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.document.findMany({ where: { expiresOn: { not: null, lte: asDate(addDays(today, 90)) }, status: { in: ['uploaded', 'verified'] } }, distinct: ['organizationId'], select: { organizationId: true } }),
    );
    let expired = 0;
    let reminded = 0;
    for (const { organizationId } of orgs) {
      const ctx = { organizationId, isSuperAdmin: false };
      const notices = await this.tenantPrisma.forTenant(ctx, async (tx) => {
        const c = { ...ctx, organizationId } as CompanyContext;
        expired += (await tx.document.updateMany({ where: { organizationId, expiresOn: { lte: asDate(today) }, status: { in: ['uploaded', 'verified'] } }, data: { status: 'expired', version: { increment: 1 } } })).count;
        const out: { userId: string; text: string; id: string }[] = [];
        const types = new Map((await this.types(tx, organizationId)).map((t) => [t.key, t]));
        const soon = await tx.document.findMany({ where: { organizationId, expiresOn: { gt: asDate(today) }, status: { in: ['uploaded', 'verified'] } } });
        for (const d of soon) {
          const t = types.get(d.typeKey);
          const left = Math.round((d.expiresOn!.getTime() - asDate(today).getTime()) / 86_400_000);
          if (!t?.reminderDays.includes(left) || iso(d.remindedOn) === today) continue;
          await tx.document.update({ where: { id: d.id }, data: { remindedOn: asDate(today) } });
          const owner = await tx.employee.findFirst({ where: { organizationId, personId: d.personId, userId: { not: null } }, select: { userId: true } });
          if (owner) out.push({ userId: owner.userId!, text: `Your ${t.name} expires in ${left} days. Upload the new one.`, id: d.id });
          await audit(tx, c, 'document.expiry_reminded', 'document', d.id, { daysLeft: left });
        }
        return out;
      });
      for (const n of notices) {
        reminded++;
        await this.notifications.notifySystem(ctx, [n.userId], 'document.expiring', { entityType: 'document', entityId: n.id, contextText: n.text, linkPath: '/yx/me/documents' }, { subject: 'A document of yours expires soon', html: `<p>${n.text} Open YukthiX to upload it.</p>` }).catch(() => undefined);
      }
    }
    return { expired, reminded };
  }
}
