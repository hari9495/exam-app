import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, TenantPrismaService } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { Tx } from '../org-structure/org-structure.service';
import { AttachmentsService } from './attachments.service';
import { isInternal } from './customers.service';
import { DeskActor, audit, deskSystem, has } from './desk-access';
import { DecideDto, PrivacyRequestDto, PrivacySettingsDto } from './dto-ops';
import { PortalSession } from './portal.service';
import { Requester, RequesterService } from './requester.service';

// SD-1.30 requester privacy requests, retention and the recycle bin (US-B-115, US-G-218, §14.5, P02 YX-SEC-30).
// A requester asks (in the app or the portal) for their data or its erasure; the Service Desk admin decides. Access: the
// person downloads every ticket and message of theirs (replies and system messages only, never internal notes).
// Erasure: the words they wrote become "[Removed]", files they sent are deleted, and an outside contact's name and
// contact details become "Erased requester"; the tickets' facts stay for reports. A legal hold stops erasure and
// retention. Every step is audited. The retention job blanks closed tickets' words and files after the company's period.

// DECISION NEEDED: an employee's erasure only blanks their words and files here; their name stays because HR (P01)
// owns the person record. Confirm that is enough, or route desk erasure through the HR erasure flow.

export const REMOVED_HTML = '<p>[Removed]</p>';
export const REMOVED_TEXT = '[Removed]';
const ERASED = 'Erased requester';

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly requesters: RequesterService,
    private readonly files: AttachmentsService,
    private readonly notifications: NotificationsService,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  private requireAdmin(a: DeskActor) {
    if (!has(a, 'desk.desk.create')) throw new ForbiddenException('The Service Desk admin handles privacy requests.');
  }

  // ------------------------------------------------------------------------------------------ the requester's side

  private async ask(tx: Tx, org: string, personId: string, dto: PrivacyRequestDto, source: 'app' | 'portal') {
    try {
      const r = await tx.sdPrivacyRequest.create({ data: { organizationId: org, personId, kind: dto.kind, source, note: dto.note ?? null } });
      await audit(tx, { ctx: { organizationId: org, isSuperAdmin: false }, userId: null as unknown as string }, 'desk.privacy.requested', 'sd_privacy_request', r.id, { kind: dto.kind, source, personId });
      return r;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('You already have an open request of this kind.');
      throw e;
    }
  }

  private async tellAdmins(org: string, id: string, kind: string) {
    const admins = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active' }, select: { id: true } }));
    await this.notifications
      .notifySystem({ organizationId: org, isSuperAdmin: false }, admins.map((u) => u.id), 'helpdesk.privacy.request', { entityType: 'sd_privacy_request', entityId: id, contextText: `A ${kind} request about Service Desk data`, linkPath: '/yx/desk/privacy' }, { subject: 'A privacy request is waiting', html: `<p>Someone asked for ${kind === 'access' ? 'a copy of' : 'the erasure of'} their Service Desk data. Please decide within 30 days.</p>` })
      .catch((e) => this.logger.warn(`Admins not told: ${(e as Error).message}`));
  }

  async askMine(r: Requester, dto: PrivacyRequestDto) {
    if (r.acting) throw new ForbiddenException('Not available while acting for someone else');
    const row = await this.tenantPrisma.forTenant(r.ctx, async (tx) => this.ask(tx, r.ctx.organizationId, (await this.requesters.personOf(tx, r, true))!, dto, 'app'));
    await this.tellAdmins(r.ctx.organizationId, row.id, dto.kind);
    return { id: row.id };
  }

  async askPortal(s: PortalSession, dto: PrivacyRequestDto) {
    const row = await this.tenantPrisma.forTenant({ organizationId: s.organizationId, isSuperAdmin: false }, (tx) => this.ask(tx, s.organizationId, s.personId, dto, 'portal'));
    await this.tellAdmins(s.organizationId, row.id, dto.kind);
    return { id: row.id };
  }

  private view(r: Prisma.SdPrivacyRequestGetPayload<object>) {
    return { id: r.id, kind: r.kind, source: r.source, note: r.note, status: r.status, decisionNote: r.decisionNote, result: r.result, createdAt: r.createdAt, doneAt: r.doneAt };
  }

  async mine(r: Requester) {
    return this.tenantPrisma.forTenant(r.ctx, async (tx) => {
      const personId = await this.requesters.personOf(tx, r, false);
      if (!personId) return [];
      return (await tx.sdPrivacyRequest.findMany({ where: { organizationId: r.ctx.organizationId, personId }, orderBy: { createdAt: 'desc' } })).map((x) => this.view(x));
    });
  }

  async minePortal(s: PortalSession) {
    return this.tenantPrisma.forTenant({ organizationId: s.organizationId, isSuperAdmin: false }, async (tx) => (await tx.sdPrivacyRequest.findMany({ where: { organizationId: s.organizationId, personId: s.personId }, orderBy: { createdAt: 'desc' } })).map((x) => this.view(x)));
  }

  /** The person's own copy once an access request is done: every ticket of theirs with replies and system messages. */
  async myExport(r: Requester, id: string) {
    return this.tenantPrisma.forTenant(r.ctx, async (tx) => {
      const personId = await this.requesters.personOf(tx, r, false);
      const req = personId ? await tx.sdPrivacyRequest.findFirst({ where: { organizationId: r.ctx.organizationId, id, personId, kind: 'access', status: 'done' } }) : null;
      if (!req) throw new NotFoundException('No such finished request.');
      return deskSystem(this.tenantPrisma, r.ctx, (sys) => this.exportOf(sys, r.ctx.organizationId, personId!));
    });
  }

  async portalExport(s: PortalSession, id: string) {
    const ok = await this.tenantPrisma.forTenant({ organizationId: s.organizationId, isSuperAdmin: false }, (tx) => tx.sdPrivacyRequest.findFirst({ where: { organizationId: s.organizationId, id, personId: s.personId, kind: 'access', status: 'done' } }));
    if (!ok) throw new NotFoundException('No such finished request.');
    return deskSystem(this.tenantPrisma, { organizationId: s.organizationId, isSuperAdmin: false }, (sys) => this.exportOf(sys, s.organizationId, s.personId));
  }

  /** Read as the desk (their sensitive tickets too): only what was said to or by them, never internal notes. */
  private async exportOf(tx: Tx, org: string, personId: string) {
    const person = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: personId }, select: { givenName: true, familyName: true, primaryEmail: true, primaryPhone: true } });
    const tickets = await tx.sdTicket.findMany({ where: { organizationId: org, OR: [{ requesterPersonId: personId }, { requestedForPersonId: personId }] }, orderBy: { createdAt: 'asc' } });
    const messages = await tx.sdTicketMessage.findMany({ where: { organizationId: org, ticketId: { in: tickets.map((t) => t.id) }, kind: { in: ['reply', 'system'] } }, orderBy: { createdAt: 'asc' } });
    const files = await tx.sdAttachment.findMany({ where: { organizationId: org, ticketId: { in: tickets.map((t) => t.id) }, OR: [{ side: 'requester' }, { messageId: { in: messages.map((m) => m.id) } }] }, select: { ticketId: true, fileName: true, sizeBytes: true, createdAt: true } });
    const ratings = await tx.sdRating.findMany({ where: { organizationId: org, personId }, select: { ticketId: true, score: true, comment: true, createdAt: true } });
    const nps = await tx.sdSurveyResponse.findMany({ where: { organizationId: org, personId }, select: { score: true, comment: true, createdAt: true } });
    return {
      person: { name: [person.givenName, person.familyName].filter(Boolean).join(' '), email: person.primaryEmail, phone: person.primaryPhone },
      tickets: tickets.map((t) => ({
        number: t.number,
        subject: t.subject,
        state: t.systemState,
        raisedAt: t.createdAt,
        solvedAt: t.resolvedAt,
        messages: messages.filter((m) => m.ticketId === t.id).map((m) => ({ from: m.side === 'agent' ? 'Support' : m.authorPersonId === personId ? 'You' : 'Someone else', at: m.createdAt, text: m.bodyText })),
        files: files.filter((f) => f.ticketId === t.id).map((f) => ({ name: f.fileName, bytes: f.sizeBytes, at: f.createdAt })),
        rating: ratings.find((x) => x.ticketId === t.id) ?? null,
      })),
      surveys: nps,
      madeAt: new Date(),
    };
  }

  // ------------------------------------------------------------------------------------------ the admin's side

  async list(a: DeskActor, status?: string) {
    this.requireAdmin(a);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const rows = await tx.sdPrivacyRequest.findMany({ where: { organizationId: a.ctx.organizationId, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
      const people = new Map((await tx.person.findMany({ where: { organizationId: a.ctx.organizationId, id: { in: rows.map((r) => r.personId) } }, select: { id: true, givenName: true, familyName: true, primaryEmail: true } })).map((p) => [p.id, p]));
      const hold = (await tx.sdPrivacySettings.findUnique({ where: { organizationId: a.ctx.organizationId } }))?.legalHold ?? false;
      return { legalHold: hold, requests: rows.map((r) => ({ ...this.view(r), person: { id: r.personId, name: [people.get(r.personId)?.givenName, people.get(r.personId)?.familyName].filter(Boolean).join(' '), email: people.get(r.personId)?.primaryEmail ?? null } })) };
    });
  }

  /** Done (access: the person can download; erasure: carried out now) or refused, with a note. Legal hold refuses erasure. */
  async decide(a: DeskActor, id: string, dto: DecideDto) {
    this.requireAdmin(a);
    const org = a.ctx.organizationId;
    const req = await this.tenantPrisma.forTenant(a.ctx, (tx) => tx.sdPrivacyRequest.findFirst({ where: { organizationId: org, id, status: 'open' } }));
    if (!req) throw new NotFoundException('No such open request.');
    if (dto.action === 'refuse' && !dto.note) throw new BadRequestException('Say why the request is refused.');
    let result: Record<string, unknown> | null = null;
    if (dto.action === 'complete' && req.kind === 'erasure') {
      const hold = await this.tenantPrisma.forTenant(a.ctx, (tx) => tx.sdPrivacySettings.findUnique({ where: { organizationId: org } }));
      if (hold?.legalHold) throw new ConflictException('A legal hold is on, so nothing can be erased now. Refuse with a note, or lift the hold first.');
      result = await this.erase(org, req.personId, a.userId);
    }
    if (dto.action === 'complete' && req.kind === 'access') {
      const copy = await deskSystem(this.tenantPrisma, a.ctx, (tx) => this.exportOf(tx, org, req.personId));
      result = { tickets: copy.tickets.length };
    }
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const n = await tx.sdPrivacyRequest.updateMany({ where: { id, status: 'open' }, data: { status: dto.action === 'complete' ? 'done' : 'refused', decidedBy: a.userId, decisionNote: dto.note ?? null, result: (result ?? undefined) as Prisma.InputJsonValue | undefined, doneAt: new Date() } });
      if (!n.count) throw new ConflictException('Someone already decided this request.');
      await audit(tx, a, dto.action === 'complete' ? 'desk.privacy.completed' : 'desk.privacy.refused', 'sd_privacy_request', id, { kind: req.kind, note: dto.note ?? null, result });
      return { ok: true, result };
    });
  }

  /** Blanks the words the person wrote and deletes their files; an outside contact's own details are erased too. */
  private async erase(org: string, personId: string, by: string) {
    const ctx = { organizationId: org, isSuperAdmin: false };
    const out = await deskSystem(
      this.tenantPrisma,
      ctx,
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.sd_redact', 'on', true)`;
        const msgs = await tx.sdTicketMessage.updateMany({ where: { organizationId: org, authorPersonId: personId }, data: { bodyHtml: REMOVED_HTML, bodyText: REMOVED_TEXT } });
        const files = await tx.sdAttachment.findMany({ where: { organizationId: org, uploadedByPersonId: personId, NOT: { fileName: 'removed' } } });
        await tx.sdAttachment.updateMany({ where: { id: { in: files.map((f) => f.id) } }, data: { scanStatus: 'blocked', scanDetail: 'Removed at the person’s request', fileName: 'removed' } });
        await tx.sdRating.updateMany({ where: { organizationId: org, personId }, data: { comment: null } });
        await tx.sdSurveyResponse.updateMany({ where: { organizationId: org, personId }, data: { comment: null } });
        // The masked originals in their words go too (kept rows, emptied values).
        const theirs = (await tx.sdTicketMessage.findMany({ where: { organizationId: org, authorPersonId: personId }, select: { id: true } })).map((m) => m.id);
        await tx.sdSensitiveValue.updateMany({ where: { organizationId: org, messageId: { in: theirs } }, data: { valueEncrypted: this.crypto.encrypt(REMOVED_TEXT) } });
        // An outside contact is erased as a person; an employee's person belongs to HR and stays (only their words go).
        const outside = !(await isInternal(tx, org, personId));
        if (outside) {
          await tx.person.update({ where: { id: personId }, data: { givenName: ERASED, familyName: null, preferredName: null, primaryEmail: null, primaryPhone: null, status: 'erased' } });
          await tx.sdCustomerContact.updateMany({ where: { organizationId: org, personId }, data: { status: 'inactive' } });
          await tx.sdPortalSession.updateMany({ where: { organizationId: org, personId, endedAt: null }, data: { endedAt: new Date() } });
          await tx.sdTicketWatcher.deleteMany({ where: { organizationId: org, personId } });
        }
        await audit(tx, { ctx, userId: by }, 'desk.privacy.erased', 'person', personId, { messages: msgs.count, files: files.length, outside });
        return { messages: msgs.count, files, outside };
      },
      { timeout: 120_000 },
    );
    for (const f of out.files) await this.files.drop(f.blobKey).catch((e) => this.logger.warn(`File not dropped: ${(e as Error).message}`));
    return { messages: out.messages, files: out.files.length, personErased: out.outside };
  }

  // ------------------------------------------------------------------------------------------ retention and legal hold

  async settings(a: DeskActor) {
    this.requireAdmin(a);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const s = await tx.sdPrivacySettings.findUnique({ where: { organizationId: a.ctx.organizationId } });
      return { retentionMonths: s?.retentionMonths ?? null, legalHold: s?.legalHold ?? false, binDays: s?.binDays ?? 30, updatedAt: s?.updatedAt ?? null };
    });
  }

  async saveSettings(a: DeskActor, dto: PrivacySettingsDto) {
    this.requireAdmin(a);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const data = { retentionMonths: dto.retentionMonths ?? null, legalHold: dto.legalHold, binDays: dto.binDays, updatedBy: a.userId, updatedAt: new Date() };
      await tx.sdPrivacySettings.upsert({ where: { organizationId: a.ctx.organizationId }, update: data, create: { organizationId: a.ctx.organizationId, ...data } });
      await audit(tx, a, 'desk.privacy.settings_changed', 'organization', a.ctx.organizationId, { retentionMonths: data.retentionMonths, legalHold: data.legalHold, binDays: data.binDays });
      return { ok: true };
    });
  }

  /** Job: blanks the words and files of tickets closed longer ago than the company's retention; none under legal hold. */
  async retention(now = new Date()): Promise<number> {
    const due = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.$queryRaw<{ id: string; organization_id: string }[]>`
        SELECT t.id, t.organization_id FROM sd_tickets t JOIN sd_privacy_settings s ON s.organization_id = t.organization_id
        WHERE s.retention_months IS NOT NULL AND NOT s.legal_hold AND t.content_removed_at IS NULL AND t.system_state = 'closed'
          AND t.closed_at < ${now}::timestamptz - make_interval(months => s.retention_months::int)
        ORDER BY t.closed_at LIMIT 500`,
    );
    let n = 0;
    for (const r of due) {
      const ctx = { organizationId: r.organization_id, isSuperAdmin: false };
      const files = await deskSystem(this.tenantPrisma, ctx, async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.sd_redact', 'on', true)`;
        const t = await tx.sdTicket.findFirst({ where: { id: r.id, contentRemovedAt: null } });
        if (!t) return [];
        await tx.sdTicketMessage.updateMany({ where: { organizationId: t.organizationId, ticketId: t.id }, data: { bodyHtml: REMOVED_HTML, bodyText: REMOVED_TEXT } });
        const files = await tx.sdAttachment.findMany({ where: { organizationId: t.organizationId, ticketId: t.id, NOT: { fileName: 'removed' } } });
        await tx.sdAttachment.updateMany({ where: { id: { in: files.map((f) => f.id) } }, data: { scanStatus: 'blocked', scanDetail: 'Removed by retention', fileName: 'removed' } });
        await tx.sdSensitiveValue.updateMany({ where: { organizationId: t.organizationId, ticketId: t.id }, data: { valueEncrypted: this.crypto.encrypt(REMOVED_TEXT) } });
        await tx.sdTicket.update({ where: { id: t.id }, data: { subject: '[Removed by retention]', contentRemovedAt: now } });
        await audit(tx, { ctx, userId: null as unknown as string }, 'desk.retention.removed', 'sd_ticket', t.id, { number: t.number, files: files.length });
        return files;
      });
      for (const f of files) await this.files.drop(f.blobKey).catch(() => undefined);
      n++;
    }
    return n;
  }

  // ------------------------------------------------------------------------------------------ the recycle bin (US-G-218)

  async bin(a: DeskActor) {
    if (!(['desk.desk.create', 'desk.settings.manage', 'desk.kb.publish', 'desk.ticket.view'] as const).some((k) => has(a, k))) throw new ForbiddenException('You cannot see the recycle bin.');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const rows = await tx.sdRecycleBin.findMany({ where: { organizationId: a.ctx.organizationId, restoredAt: null }, orderBy: { deletedAt: 'desc' }, take: 300 });
      return rows.filter((r) => this.mayRestore(a, r)).map((r) => ({ id: r.id, kind: r.kind, label: r.label, deskId: r.deskId, deletedAt: r.deletedAt, purgeAfter: r.purgeAfter }));
    });
  }

  private mayRestore(a: DeskActor, r: { kind: string; deskId: string | null; deletedBy: string | null }) {
    if (has(a, 'desk.desk.create')) return true;
    if (r.kind === 'view') return r.deletedBy === a.userId;
    if (r.kind === 'kb_article') return has(a, 'desk.kb.publish') && (!r.deskId || a.roles.has(r.deskId));
    return Boolean(r.deskId) && a.roles.get(r.deskId!) === 'admin' && has(a, 'desk.settings.manage');
  }

  async restore(a: DeskActor, id: string) {
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      const r = await tx.sdRecycleBin.findFirst({ where: { organizationId: org, id, restoredAt: null } });
      if (!r || !this.mayRestore(a, r)) throw new NotFoundException('Nothing to restore.');
      const data = r.data as Record<string, unknown>;
      try {
        if (r.kind === 'kb_article') await tx.sdKbArticle.updateMany({ where: { organizationId: org, id: { in: (data.ids as string[]) ?? [r.entityId] } }, data: { deletedAt: null } });
        else if (r.kind === 'view') await tx.sdView.create({ data: data as Prisma.SdViewUncheckedCreateInput });
        else if (r.kind === 'email_rule') await tx.sdEmailRule.create({ data: data as Prisma.SdEmailRuleUncheckedCreateInput });
        else throw new BadRequestException('This kind cannot be restored.');
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) throw new ConflictException('It cannot be put back: something with the same name or key exists now.');
        throw e;
      }
      await tx.sdRecycleBin.update({ where: { id: r.id }, data: { restoredAt: new Date() } });
      await audit(tx, a, 'desk.bin.restored', r.kind, r.entityId, { label: r.label });
      return { restored: true };
    });
  }

  /** Job: what stayed in the bin past its window is removed for good (audited). */
  async purgeBin(now = new Date()): Promise<number> {
    const due = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string; organization_id: string }[]>`SELECT id, organization_id FROM sd_recycle_bin WHERE restored_at IS NULL AND purge_after <= ${now} LIMIT 200`);
    let n = 0;
    for (const d of due) {
      const ctx = { organizationId: d.organization_id, isSuperAdmin: false };
      await deskSystem(this.tenantPrisma, ctx, async (tx) => {
        const r = await tx.sdRecycleBin.findFirst({ where: { id: d.id, restoredAt: null } });
        if (!r) return;
        if (r.kind === 'kb_article') {
          const ids = ((r.data as { ids?: string[] }).ids ?? [r.entityId]).slice().reverse();
          const org = d.organization_id;
          for (const t of [tx.sdKbFollow, tx.sdKbFeedback, tx.sdKbLink, tx.sdKbSlugHistory, tx.sdKbArticleVersion] as unknown as { deleteMany: (x: object) => Promise<unknown> }[]) await t.deleteMany({ where: { organizationId: org, articleId: { in: ids } } });
          await tx.sdKbEvent.deleteMany({ where: { organizationId: org, articleId: { in: ids } } });
          await tx.sdKbArticle.deleteMany({ where: { organizationId: org, id: { in: ids }, deletedAt: { not: null } } });
        }
        await tx.sdRecycleBin.delete({ where: { id: r.id } });
        await audit(tx, { ctx, userId: null as unknown as string }, 'desk.bin.purged', r.kind, r.entityId, { label: r.label });
        n++;
      });
    }
    return n;
  }
}
