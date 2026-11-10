import { DateTime } from 'luxon';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService, BlobStorageService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { audit, inCompany, type CompanyContext, type Tx } from '../org-structure/org-structure.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { Kiosk } from '../time/kiosk.service';
import { VisitorsService } from './visitors.service';
import { badgeText, dayBounds, localDay, normalCode, normalMobile, noticeVersion, passCode, passToken, PURPOSES, type Purpose } from './visitor-rules';
import { NDA_VALID_DAYS, approvalDue, decider, inHours, photoProblem } from './walkin-rules';
import { acknowledge, checkAccepted, needsView, outstanding, visitNeeds, type Needs } from './visit-needs';
import { idLast4, idProblem, minorProblem, type IdCapture } from './visitor-guard-rules';
import { watchHit } from './visitor-watchlist.service';

// Visitors slice 2 (answers 601, 602, 604, 606, 610): walk-ins on a kiosk in visitor mode and at the reception desk.
// A walk-in waits for the host (the location's minutes, then reception decides; audited either way). The photo is shown
// only to the host, only while they decide. Visitor types carry the NDA and safety induction, read from the Policies
// module's published versions and acknowledged per visit (an NDA counts for a year for the same person and company).
// Allowed hours guard the kiosk; reception lets a visitor in outside them with a reason.

const SEE_RECEPTION = { state: 'see-reception' as const };
export interface WalkInInput {
  name: string;
  mobile: string;
  company?: string | null;
  typeId?: string | null;
  purpose?: string | null;
  /** The policy versions the visitor read and accepted (what `needs` returned). */
  noticeVersion: string;
  ndaVersionId?: string | null;
  inductionVersionId?: string | null;
  /** Slice 3 (614): under 18, with the named adult (no photo and no ID for them). */
  minor?: boolean | null;
  minorAdult?: string | null;
  /** Slice 3 (603): the ID type and its last 4, where the location takes ID proof. */
  idType?: string | null;
  idLast4?: string | null;
}

/** Slice 3 rules for a walk-in: under 18 needs the adult and gives no photo or ID; the location's ID rule. Null when fine. */
function guardProblem(rule: IdCapture, input: WalkInInput, photo: boolean): string | null {
  const minor = Boolean(input.minor);
  const m = minorProblem(minor, input.minorAdult);
  if (m) return m;
  if (minor && photo) return 'No photo is taken of a visitor under 18.';
  return idProblem(rule, minor, { type: input.idType ?? null, last4: input.idLast4 ?? null });
}

@Injectable()
export class WalkInsService {
  private readonly logger = new Logger(WalkInsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly visitors: VisitorsService,
    private readonly notifications: NotificationsService,
    private readonly blob: BlobStorageService,
  ) {}

  /* ---------------- visitor types (Settings 3.12) ---------------- */

  /** The company's visitor types, and (for the settings page) the published policies to choose from. */
  async types(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.visitorType.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ position: 'asc' }, { name: 'asc' }] });
      const policies = await this.publishedPolicies(tx, c);
      const title = (id: string | null) => (id ? (policies.find((p) => p.id === id)?.title ?? 'A policy no longer published') : null);
      return { types: rows.map((r) => ({ id: r.id, name: r.name, escort: r.escort, ndaPolicyId: r.ndaPolicyId, nda: title(r.ndaPolicyId), inductionPolicyId: r.inductionPolicyId, induction: title(r.inductionPolicyId) })), policies: policies.map((p) => ({ id: p.id, title: p.title })) };
    });
  }

  private async publishedPolicies(tx: Tx, c: CompanyContext) {
    const docs = await tx.policyDocument.findMany({ where: { organizationId: c.organizationId }, select: { id: true, title: true } });
    const live = await tx.policyVersion.findMany({ where: { organizationId: c.organizationId, status: 'published', policyId: { in: docs.map((d) => d.id) } }, select: { policyId: true } });
    const ids = new Set(live.map((v) => v.policyId));
    return docs.filter((d) => ids.has(d.id)).sort((a, b) => a.title.localeCompare(b.title));
  }

  /** Settings 3.12: the whole list as edited (a row without an id is new). Policies must be published ones. Audited. */
  async saveTypes(ctx: TenantContext, user: ScopeUser, rows: { id?: string | null; name: string; escort: boolean; ndaPolicyId?: string | null; inductionPolicyId?: string | null }[]) {
    const v = await this.visitors.viewer(user);
    this.visitors.own(v, 'visitor types');
    const holder = v.grants.has('visitors.settings.manage') || v.grants.has('org.settings.manage');
    if (!holder) throw new ForbiddenException('Only Facility admins or HR with the settings key can change visitor types.');
    const names = rows.map((r) => r.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) throw new BadRequestException('Two visitor types have the same name.');
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ok = new Set((await this.publishedPolicies(tx, c)).map((p) => p.id));
      for (const r of rows) for (const id of [r.ndaPolicyId, r.inductionPolicyId]) if (id && !ok.has(id)) throw new BadRequestException(`${r.name}: choose a published policy for the NDA and the induction.`);
      for (const [i, r] of rows.entries()) {
        const data = { name: r.name.trim(), escort: r.escort, ndaPolicyId: r.ndaPolicyId || null, inductionPolicyId: r.inductionPolicyId || null, position: i, updatedBy: c.userId ?? null };
        if (r.id) {
          const { count } = await tx.visitorType.updateMany({ where: { id: r.id, organizationId: c.organizationId }, data });
          if (!count) throw new NotFoundException('Visitor type not found.');
        } else await tx.visitorType.create({ data: { organizationId: c.organizationId, ...data } });
      }
      await audit(tx, c, 'visitor.types_saved', 'visitor_type', c.organizationId, { types: rows.map((r) => ({ name: r.name.trim(), escort: r.escort, nda: Boolean(r.ndaPolicyId), induction: Boolean(r.inductionPolicyId) })) });
    });
    return this.types(ctx);
  }

  /* ---------------- what a visitor reads and accepts ---------------- */

  /** The notice, and the type's NDA (unless this person signed it for this company within a year) and induction. */
  needs(tx: Tx, c: CompanyContext, locationId: string, typeId: string | null, mobile: string | null, company: string | null): Promise<Needs> {
    return visitNeeds(tx, c, (k, l) => this.visitors.setting(tx, c, k, l), locationId, typeId, mobile, company);
  }

  /* ---------------- the walk-in itself ---------------- */

  private async create(tx: Tx, c: CompanyContext, loc: { id: string; timezone: string }, hostUserId: string, input: WalkInInput, mobile: string, n: Needs, via: 'kiosk' | 'desk', extra: { kioskDeviceId?: string; hoursOverrideReason?: string | null; createdBy: string }) {
    const now = new Date();
    const minutes = Number(await this.visitors.setting(tx, c, 'visitors.host_timeout_minutes', loc.id));
    const to = await this.visitors.setting(tx, c, 'visitors.hours_to', loc.id);
    const today = localDay(now, loc.timezone);
    const end = dayBounds(today, loc.timezone).to;
    // The walk-in's window runs to the location's closing time (at least an hour, never past midnight there).
    const closing = DateTime.fromISO(`${today}T${to}`, { zone: loc.timezone }).toJSDate();
    const close = new Date(Math.min(end.getTime(), Math.max(now.getTime() + 60 * 60_000, closing.getTime())));
    const purpose = (input.purpose && (PURPOSES as readonly string[]).includes(input.purpose) ? input.purpose : 'meeting') as Purpose;
    let row = null;
    for (let i = 0; i < 5 && !row; i++) {
      const code = passCode();
      if (await tx.visit.findFirst({ where: { organizationId: c.organizationId, passCode: code }, select: { id: true } })) continue;
      row = await tx.visit.create({
        data: {
          organizationId: c.organizationId, locationId: loc.id, hostUserId, visitorName: input.name.trim(), visitorMobile: mobile, visitorCompany: input.company?.trim() || null, purpose,
          startsAt: now, endsAt: close, status: 'waiting', passToken: passToken(), passCode: code, walkIn: true, visitorTypeId: input.typeId || null,
          kioskDeviceId: extra.kioskDeviceId ?? null, approvalDueAt: approvalDue(now, minutes), hoursOverrideReason: extra.hoursOverrideReason ?? null,
          noticeAcceptedAt: now, noticeAcceptedVia: via, noticeVersion: n.notice.version, createdBy: extra.createdBy,
          // Slice 3: under 18 with the adult named; the ID type and last 4 only.
          minor: Boolean(input.minor), minorAdult: input.minor ? input.minorAdult!.trim() : null,
          ...(!input.minor && input.idType && input.idLast4 ? { idType: input.idType, idLast4: idLast4(input.idLast4), idCapturedAt: now } : {}),
        },
      });
    }
    if (!row) throw new ConflictException('Could not make a pass code. Try again.');
    await acknowledge(tx, c, row.id, n, mobile, input.company?.trim() || null, via);
    await audit(tx, c, 'visitor.walkin_arrived', 'visit', row.id, { locationId: loc.id, via, nda: Boolean(n.nda), induction: Boolean(n.induction), outsideHours: Boolean(extra.hoursOverrideReason) });
    return row;
  }

  /** Answer 604: the host is told at once (bell and email), with the minutes they have. No photo in the email. */
  private async tellHost(org: string, visit: { id: string; hostUserId: string; visitorName: string; visitorCompany: string | null; approvalDueAt: Date | null }, place: string) {
    const who = `${visit.visitorName}${visit.visitorCompany ? ` (${visit.visitorCompany})` : ''}`;
    const mins = visit.approvalDueAt ? Math.round((visit.approvalDueAt.getTime() - Date.now()) / 60_000) : 10;
    await this.notifications
      .notifySystem(
        { organizationId: org, isSuperAdmin: false },
        [visit.hostUserId],
        'visitor.walkin.approval.host',
        { entityType: 'visit', entityId: visit.id, contextText: `${who} is at ${place} reception asking for you`, linkPath: '/yx/visitors/invites' },
        { subject: `${who} is asking for you at reception`, html: `<p>${esc(who)} is at ${esc(place)} reception and asked for you.</p><p>Approve or decline in YukthiX (Visitors › My visitors) within ${mins} minutes; after that, reception decides.</p>` },
      )
      .catch((e: Error) => this.logger.warn(`walk-in ${visit.id}: ${e.message}`));
  }

  /* ---------------- the kiosk (device-bound; visitor mode only) ---------------- */

  private kioskCtx(k: Kiosk): CompanyContext {
    if (k.mode !== 'visitor') throw new ForbiddenException('This kiosk is for attendance. Visitors sign in at reception.');
    return { organizationId: k.org, isSuperAdmin: false, userId: null, role: null, supportSessionId: null };
  }

  private async kioskLoc(tx: Tx, c: CompanyContext, k: Kiosk) {
    return tx.location.findFirstOrThrow({ where: { organizationId: c.organizationId, id: k.locationId }, select: { id: true, name: true, timezone: true } });
  }

  /** Answers 601 and 610: is self check-in on here, and is it inside the allowed hours now? */
  private async open(tx: Tx, c: CompanyContext, loc: { id: string; timezone: string }) {
    const on = (await this.visitors.setting(tx, c, 'visitors.kiosk', loc.id)) === 'on';
    const from = await this.visitors.setting(tx, c, 'visitors.hours_from', loc.id);
    const to = await this.visitors.setting(tx, c, 'visitors.hours_to', loc.id);
    return { on, inHours: inHours(new Date(), loc.timezone, from, to), hours: `${from} to ${to}` };
  }

  async kioskInfo(k: Kiosk) {
    const c = this.kioskCtx(k);
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const loc = await this.kioskLoc(tx, c, k);
      const o = await this.open(tx, c, loc);
      const org = await tx.organization.findUnique({ where: { id: c.organizationId }, select: { name: true } });
      const types = await tx.visitorType.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, name: true } });
      return {
        company: org?.name ?? '', location: loc.name, ...o, open: o.on && o.inHours,
        photo: (await this.visitors.setting(tx, c, 'visitors.photo', loc.id)) === 'on',
        // Slice 3 (603): the kiosk asks the ID type and last 4 where the location takes ID proof.
        idCapture: (await this.visitors.setting(tx, c, 'visitors.id_capture', loc.id)) as IdCapture,
        retentionDays: Number(await this.visitors.setting(tx, c, 'visitors.retention_days', loc.id)),
        types: types.map((t) => ({ value: t.id, label: t.name })),
      };
    });
  }

  /** What this visitor must read before they go in (the kiosk shows it after their details). */
  async kioskNeeds(k: Kiosk, q: { typeId?: string | null; mobile: string; company?: string | null }) {
    const c = this.kioskCtx(k);
    const mobile = normalMobile(q.mobile);
    if (!mobile) throw new BadRequestException('Enter a 10-digit mobile number, or + and the country code.');
    return this.tenantPrisma.forTenant(c, async (tx) => needsView(await this.needs(tx, c, k.locationId, q.typeId || null, mobile, q.company || null)));
  }

  /** A walk-in on the kiosk: details, photo and what they accepted in one go; the host is told. Problems: see reception. */
  async kioskWalkIn(k: Kiosk, input: WalkInInput & { hostName: string; photoBase64?: string | null }) {
    const c = this.kioskCtx(k);
    const mobile = normalMobile(input.mobile);
    if (!mobile) throw new BadRequestException('Enter a 10-digit mobile number, or + and the country code.');
    const photo = input.photoBase64 ? Buffer.from(input.photoBase64, 'base64') : null;
    if (photo) {
      const p = photoProblem(photo);
      if (p) throw new BadRequestException(p);
    }
    const made = await this.tenantPrisma.forTenant(c, async (tx) => {
      const loc = await this.kioskLoc(tx, c, k);
      const o = await this.open(tx, c, loc);
      if (!o.on || !o.inHours) return SEE_RECEPTION;
      // The host by the name the visitor typed: exactly one active person, else reception helps (nobody is named back).
      const q = input.hostName.trim();
      const hosts = q.length < 2 ? [] : await tx.user.findMany({ where: { organizationId: c.organizationId, status: 'active', name: { contains: q, mode: 'insensitive' } }, select: { id: true, name: true }, take: 2 });
      if (hosts.length !== 1) return SEE_RECEPTION;
      // Slice 3 (605): someone on the watch-list is sent to reception; the kiosk never says why, and nothing is kept.
      if (await watchHit(tx, c.organizationId, { name: input.name, mobile })) {
        await audit(tx, c, 'visitor.blocked', 'time_device', k.deviceId, { by: 'watchlist', via: 'kiosk' });
        return SEE_RECEPTION;
      }
      // Slice 3 (603): a photo of the ID is taken only at reception.
      const rule = (await this.visitors.setting(tx, c, 'visitors.id_capture', loc.id)) as IdCapture;
      if (rule === 'with_image' && !input.minor) return SEE_RECEPTION;
      const bad = guardProblem(rule, input, Boolean(photo));
      if (bad) throw new BadRequestException(bad);
      if ((await this.visitors.setting(tx, c, 'visitors.photo', loc.id)) === 'on' && !photo && !input.minor) throw new BadRequestException('Take your photo first.');
      const n = await this.needs(tx, c, loc.id, input.typeId || null, mobile, input.company || null);
      checkAccepted(n, input);
      const row = await this.create(tx, c, loc, hosts[0]!.id, input, mobile, n, 'kiosk', { kioskDeviceId: k.deviceId, createdBy: hosts[0]!.id });
      return { row, loc };
    });
    if ('state' in made) return made;
    if (photo) await this.savePhoto(c, made.row.id, photo);
    await this.tellHost(c.organizationId, made.row, made.loc.name);
    return { state: 'waiting' as const, id: made.row.id, host: (await this.hostFirst(c, made.row.hostUserId)), dueAt: made.row.approvalDueAt };
  }

  private async hostFirst(c: CompanyContext, id: string) {
    const u = await this.tenantPrisma.forTenant(c, (tx) => tx.user.findFirst({ where: { organizationId: c.organizationId, id }, select: { name: true, email: true } }));
    return (u?.name || u?.email || 'Your host').split(' ')[0]!;
  }

  private async savePhoto(c: CompanyContext, visitId: string, photo: Buffer) {
    const jpeg = photo[0] === 0xff;
    const path = await this.blob.upload(`visitors/${c.organizationId}/${visitId}.${jpeg ? 'jpg' : 'png'}`, photo, jpeg ? 'image/jpeg' : 'image/png');
    await this.tenantPrisma.forTenant(c, (tx) => tx.visit.update({ where: { id: visitId }, data: { photoPath: path } }));
  }

  /** The kiosk asks how its walk-in is doing (only the kiosk that made it; anything else is not found). */
  async kioskStatus(k: Kiosk, id: string) {
    const c = this.kioskCtx(k);
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const v = await tx.visit.findFirst({ where: { organizationId: c.organizationId, id, kioskDeviceId: k.deviceId } });
      if (!v) throw new NotFoundException('Not found.');
      const host = await this.hostFirst(c, v.hostUserId);
      if (v.status === 'on_site') return { state: 'badge' as const, name: v.visitorName, host, badge: badgeText(v.badgeSeq), passCode: v.passCode };
      if (v.status === 'declined') return { state: 'rejected' as const, host };
      if (v.status === 'waiting') return { state: 'waiting' as const, host, dueAt: v.approvalDueAt };
      return SEE_RECEPTION;
    });
  }

  /** A pre-registered visitor scans or types their pass on the kiosk: what they still have to read. */
  async kioskPass(k: Kiosk, code: string) {
    const c = this.kioskCtx(k);
    const pc = normalCode(code);
    if (!pc) throw new BadRequestException('A pass code looks like V-7KQ2-MX4P.');
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const loc = await this.kioskLoc(tx, c, k);
      const o = await this.open(tx, c, loc);
      const v = await tx.visit.findFirst({ where: { organizationId: c.organizationId, passCode: pc, locationId: loc.id, status: 'expected' } });
      const now = new Date();
      if (!o.on || !o.inHours || !v || v.endsAt <= now || localDay(v.startsAt, loc.timezone) !== localDay(now, loc.timezone)) return SEE_RECEPTION;
      await tx.visit.update({ where: { id: v.id }, data: { kioskDeviceId: k.deviceId } });
      const n = await outstanding(tx, c, v.id, await this.needs(tx, c, loc.id, v.visitorTypeId, v.visitorMobile, v.visitorCompany));
      return { state: 'notice' as const, id: v.id, name: v.visitorName, host: await this.hostFirst(c, v.hostUserId), needs: needsView(n) };
    });
  }

  /** The pre-registered visitor accepts what they read and is checked in (their host invited them: no approval). */
  async kioskCheckIn(k: Kiosk, id: string, input: { noticeVersion: string; ndaVersionId?: string | null; inductionVersionId?: string | null }) {
    const c = this.kioskCtx(k);
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const v = await tx.visit.findFirst({ where: { organizationId: c.organizationId, id, kioskDeviceId: k.deviceId, status: 'expected' } });
      if (!v) throw new NotFoundException('Not found.');
      const loc = await this.kioskLoc(tx, c, k);
      if (!(await this.open(tx, c, loc)).inHours) return SEE_RECEPTION;
      const n = await outstanding(tx, c, v.id, await this.needs(tx, c, loc.id, v.visitorTypeId, v.visitorMobile, v.visitorCompany));
      checkAccepted(n, input);
      await acknowledge(tx, c, v.id, n, v.visitorMobile, v.visitorCompany, 'kiosk');
      const done = await this.onSite(tx, c, v.id, null, { noticeAcceptedAt: v.noticeAcceptedAt ?? new Date(), noticeAcceptedVia: v.noticeAcceptedVia ?? 'kiosk', noticeVersion: n.notice.version });
      await audit(tx, c, 'visitor.checked_in', 'visit', v.id, { locationId: loc.id, via: 'kiosk' });
      return { state: 'badge' as const, name: done.visitorName, host: await this.hostFirst(c, done.hostUserId), badge: badgeText(done.badgeSeq), passCode: done.passCode };
    });
  }

  /** On site now, with the next badge number (the same lock as reception's check-in). */
  private async onSite(tx: Tx, c: CompanyContext, id: string, by: string | null, extra: Record<string, unknown> = {}) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`visit_badge:${c.organizationId}`}))`;
    const last = await tx.visit.aggregate({ where: { organizationId: c.organizationId }, _max: { badgeSeq: true } });
    return tx.visit.update({ where: { id }, data: { status: 'on_site', checkedInAt: new Date(), checkedInBy: by, badgeSeq: (last._max.badgeSeq ?? 0) + 1, ...extra } });
  }

  /* ---------------- reception (VIS-01) ---------------- */

  /** People reception can name as the host (active people of the company, by name). */
  async hosts(ctx: TenantContext, user: ScopeUser, locationId: string, q: string) {
    const v = await this.visitors.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.visitors.deskLoc(tx, c, v, locationId);
      const s = q.trim();
      const rows = await tx.user.findMany({ where: { organizationId: c.organizationId, status: 'active', ...(s ? { OR: [{ name: { contains: s, mode: 'insensitive' } }, { email: { contains: s, mode: 'insensitive' } }] } : {}) }, orderBy: { name: 'asc' }, take: 20, select: { id: true, name: true, email: true } });
      return rows.map((r) => ({ value: r.id, label: r.name || r.email, description: r.email }));
    });
  }

  /** What reception reads to the visitor (or has them read) at the desk, and whether it is inside the hours now. */
  async deskNeeds(ctx: TenantContext, user: ScopeUser, q: { locationId: string; typeId?: string | null; mobile?: string; company?: string | null }) {
    const v = await this.visitors.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const loc = await this.visitors.deskLoc(tx, c, v, q.locationId);
      const mobile = q.mobile ? normalMobile(q.mobile) : null;
      const from = await this.visitors.setting(tx, c, 'visitors.hours_from', loc.id);
      const to = await this.visitors.setting(tx, c, 'visitors.hours_to', loc.id);
      return { ...needsView(await this.needs(tx, c, loc.id, q.typeId || null, mobile, q.company || null)), inHours: inHours(new Date(), loc.timezone, from, to), hours: `${from} to ${to}` };
    });
  }

  /** An expected visit's type texts still to accept (the desk's check-in drawer). */
  async visitNeeds(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.visitors.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await this.visitors.find(tx, c, id);
      await this.visitors.deskLoc(tx, c, v, row.locationId);
      return needsView(await outstanding(tx, c, row.id, await this.needs(tx, c, row.locationId, row.visitorTypeId, row.visitorMobile, row.visitorCompany)));
    });
  }

  /** Answer 604: reception adds a walk-in; outside the hours only with a reason (610). The host is told. */
  async deskWalkIn(ctx: TenantContext, user: ScopeUser, input: WalkInInput & { locationId: string; hostUserId: string; hoursReason?: string | null }) {
    const v = await this.visitors.viewer(user);
    this.visitors.own(v, 'a visit');
    const mobile = normalMobile(input.mobile);
    if (!mobile) throw new BadRequestException('Enter a 10-digit mobile number, or + and the country code for a number outside India.');
    const made = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const loc = await this.visitors.deskLoc(tx, c, v, input.locationId);
      const host = await tx.user.findFirst({ where: { organizationId: c.organizationId, id: input.hostUserId, status: 'active' }, select: { id: true } });
      if (!host) throw new NotFoundException('Choose who they are visiting.');
      const from = await this.visitors.setting(tx, c, 'visitors.hours_from', loc.id);
      const to = await this.visitors.setting(tx, c, 'visitors.hours_to', loc.id);
      const outside = !inHours(new Date(), loc.timezone, from, to);
      const reason = input.hoursReason?.trim() || null;
      if (outside && !reason) throw new BadRequestException(`Visitors are allowed from ${from} to ${to}. Give the reason to let them in now.`);
      // Slice 3 (605): a watch-list match stops here; reception sees the name only, never why.
      // The audit is kept: the refusal is thrown only after this transaction commits.
      if (await watchHit(tx, c.organizationId, { name: input.name, mobile })) {
        await audit(tx, c, 'visitor.blocked', 'location', loc.id, { by: 'watchlist', via: 'desk' });
        return { blocked: true as const };
      }
      const bad = guardProblem((await this.visitors.setting(tx, c, 'visitors.id_capture', loc.id)) as IdCapture, input, false);
      if (bad) throw new BadRequestException(bad);
      const n = await this.needs(tx, c, loc.id, input.typeId || null, mobile, input.company || null);
      checkAccepted(n, input);
      const row = await this.create(tx, c, loc, host.id, input, mobile, n, 'desk', { hoursOverrideReason: outside ? reason : null, createdBy: user.userId! });
      if (outside) await audit(tx, c, 'visitor.hours_overridden', 'visit', row.id, { reason });
      return { row, loc };
    });
    if ('blocked' in made) throw new ConflictException(`Stop at reception: ${input.name.trim()} can't come in. Don't issue a badge; call the admin on duty.`);
    await this.tellHost(ctx.organizationId!, made.row, made.loc.name);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => (await this.visitors.views(tx, c, [made.row]))[0]!);
  }

  /* ---------------- the decision (604) ---------------- */

  /** The host (any time while waiting) or reception (after the host's minutes) lets the walk-in in or not. Audited. */
  async decide(ctx: TenantContext, user: ScopeUser, id: string, d: { approve: boolean; reason?: string | null }) {
    const v = await this.visitors.viewer(user);
    this.visitors.own(v, 'a visit');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await this.visitors.find(tx, c, id);
      const desk = (await this.visitors.reach(tx, c, v, ['visitors.desk.manage'])).find((l) => l.id === row.locationId);
      const who = decider({ status: row.status, approvalDueAt: row.approvalDueAt, hostUserId: row.hostUserId }, user.userId!, Boolean(desk), new Date(), desk?.timezone);
      if (who !== 'host' && who !== 'reception') throw row.hostUserId !== user.userId && !desk ? new NotFoundException('Visit not found.') : new ConflictException(who);
      const reason = d.reason?.trim() || null;
      if (who === 'reception' && !d.approve && !reason) throw new BadRequestException('Give the reason the visit cannot go ahead.');
      const meta = { decidedBy: user.userId!, decidedAt: new Date(), decidedVia: who, decisionReason: reason };
      const done = d.approve ? await this.onSite(tx, c, row.id, user.userId!, meta) : await tx.visit.update({ where: { id: row.id }, data: { status: 'declined', ...meta } });
      await audit(tx, c, 'visitor.walkin_decided', 'visit', row.id, { decision: d.approve ? 'approved' : 'declined', via: who, reason });
      return (await this.visitors.views(tx, c, [done]))[0]!;
    });
  }

  /** The host's waiting walk-ins (their approval cards). */
  async approvals(ctx: TenantContext, user: ScopeUser) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.visit.findMany({ where: { organizationId: c.organizationId, hostUserId: user.userId!, status: 'waiting' }, orderBy: { startsAt: 'asc' }, take: 20 });
      const locs = new Map((await tx.location.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.locationId) } }, select: { id: true, name: true, timezone: true } })).map((l) => [l.id, l]));
      return rows.map((r) => ({ id: r.id, name: r.visitorName, company: r.visitorCompany, purpose: r.purpose, location: locs.get(r.locationId)?.name ?? '', timeZone: locs.get(r.locationId)?.timezone ?? 'Asia/Kolkata', arrivedAt: r.startsAt.toISOString(), dueAt: r.approvalDueAt?.toISOString() ?? null, hasPhoto: Boolean(r.photoPath) }));
    });
  }

  /** Answer 602: the photo goes only to the host, only while they decide (anyone else: not found). */
  async photo(ctx: TenantContext, user: ScopeUser, id: string): Promise<{ data: Buffer; type: string }> {
    const path = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await tx.visit.findFirst({ where: { organizationId: c.organizationId, id, hostUserId: user.userId!, status: 'waiting', photoPath: { not: null } }, select: { photoPath: true } });
      if (!row) throw new NotFoundException('Photo not found.');
      return row.photoPath!;
    });
    return { data: await this.blob.downloadToBuffer(path), type: path.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  }

  /* ---------------- scheduled ---------------- */

  /** Walk-ins nobody decided by the end of their day close as declined; acknowledgements past their use are deleted. */
  async sweep(now = new Date()) {
    return this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const stale = await tx.visit.findMany({ where: { status: 'waiting', endsAt: { lte: now } }, select: { id: true, organizationId: true } });
      if (stale.length) await tx.visit.updateMany({ where: { id: { in: stale.map((s) => s.id) }, status: 'waiting' }, data: { status: 'declined', decidedAt: now, decisionReason: 'Nobody decided before the end of the day.' } });
      const cutoff = new Date(now.getTime() - NDA_VALID_DAYS * 86_400_000);
      const { count } = await tx.visitAcknowledgement.deleteMany({ where: { OR: [{ visitId: null, kind: 'induction' }, { kind: 'nda', acknowledgedAt: { lt: cutoff } }, { visitId: null, acknowledgedAt: { lt: cutoff } }] } });
      for (const org of new Set(stale.map((s) => s.organizationId))) await AuditService.recordIn(tx, { organizationId: org, isSuperAdmin: true }, { actorUserId: null, action: 'visitor.walkin_undecided', entityType: 'visit', entityId: org, metadata: { closed: stale.filter((s) => s.organizationId === org).length } });
      return { closed: stale.length, acknowledgementsDeleted: count };
    });
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
