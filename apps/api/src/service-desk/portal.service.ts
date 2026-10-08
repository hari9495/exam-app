import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService, TenantPrismaService, isOrganizationActive } from '@exam-platform/shared';
import { assertHuman } from '../auth/bot-challenge';
import { OtpService } from '../auth/otp.service';
import { EmailService } from '../email/email.service';
import { Tx } from '../org-structure/org-structure.service';
import { contactAccount, ensureContact, isInternal, planFor, planUsedUp } from './customers.service';
import { DeskActor, audit, deskSystem, emit, has, requireWork } from './desk-access';
import { BannerDto, OpenRequestDto, PortalDto, PortalEmailDto, PortalRaiseDto, PortalVerifyDto } from './dto-channels';
import { Requester, RequesterService } from './requester.service';
import { textToHtml } from './rich-text';
import { TicketsService } from './tickets.service';

// SD-1.21 portals, SD-1.22 the open portal and external requesters, SD-1.23 banners (US-B-099, US-B-103, US-G-020 …
// US-G-022; §9.3, §14.4). An outside customer is a P02 external login (YX-SEC-21): a one-time code to their email (P12
// codes: 6 digits, kept as an HMAC, 5 minutes, 5 tries, send limits per email and per IP), then a portal session that is
// not a users row and not a seat. Their transaction carries app.portal_person_id, so the database itself keeps them to
// their own tickets (and their account's, for a customer admin contact). Every portal step answers the same whether or
// not the email is known, so the portal cannot be used to find out who is a customer.

const SESSION_HOURS = 8;
const IDLE_MINUTES = 120;
const REQUEST_HOURS = 24;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const webOrigin = () => (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface PortalSession {
  organizationId: string;
  orgSlug: string;
  portalId: string;
  portalSlug: string;
  personId: string;
  sessionId: string;
}

type Portal = Prisma.SdPortalGetPayload<object>;

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly otp: OtpService,
    private readonly email: EmailService,
    private readonly tickets: TicketsService,
    private readonly requesters: RequesterService,
  ) {}

  // ------------------------------------------------------------------------------------------ set-up (desk.portal.manage)

  /** A portal's desks must all be desks the person sets up (or the person is the Service Desk admin). */
  private requirePortal(a: DeskActor, deskIds: readonly string[]) {
    if (!has(a, 'desk.portal.manage')) throw new ForbiddenException('You need the right to set up portals (desk.portal.manage).');
    if (has(a, 'desk.desk.create')) return;
    if (!deskIds.length || deskIds.some((d) => a.roles.get(d) !== 'admin')) throw new ForbiddenException('Set up portals for the desks where you are the desk admin.');
  }

  async portals(a: DeskActor) {
    if (!has(a, 'desk.portal.manage')) throw new NotFoundException('No such page.');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      const [rows, links, o] = await Promise.all([
        tx.sdPortal.findMany({ where: { organizationId: org }, orderBy: { name: 'asc' } }),
        tx.sdPortalDesk.findMany({ where: { organizationId: org } }),
        tx.organization.findUnique({ where: { id: org }, select: { slug: true } }),
      ]);
      return rows
        .map((p) => ({ ...this.portalView(p), deskIds: links.filter((l) => l.portalId === p.id).map((l) => l.deskId), address: `${webOrigin()}/yx/portal/${o?.slug}/${p.slug}` }))
        .filter((p) => has(a, 'desk.desk.create') || p.deskIds.some((d) => a.roles.get(d) === 'admin'));
    });
  }

  private portalView(p: Portal) {
    return { id: p.id, slug: p.slug, name: p.name, signUp: p.signUp, allowedDomains: p.allowedDomains, openRequests: p.openRequests, accentColour: p.accentColour, loginTitle: p.loginTitle, loginText: p.loginText, readingAids: p.readingAids, status: p.status, version: p.version };
  }

  async savePortal(a: DeskActor, id: string | null, dto: PortalDto) {
    this.requirePortal(a, dto.deskIds);
    if (dto.signUp === 'allowed_domains' && !dto.allowedDomains?.length) throw new BadRequestException('List the email domains that may sign up.');
    try {
      return await this.tenantPrisma.forTenant(a.ctx, async (tx) => {
        const org = a.ctx.organizationId;
        const desks = await tx.sdDesk.findMany({ where: { organizationId: org, id: { in: dto.deskIds }, status: 'active' }, select: { id: true, kind: true } });
        if (desks.length !== dto.deskIds.length) throw new BadRequestException('Choose active desks of this company.');
        // D8: the outside portal serves Customer support desks; employees use the in-app help centre and drawer.
        if (desks.some((d) => d.kind !== 'customer_support')) throw new BadRequestException('An outside portal serves Customer support desks only. Employees use the help centre inside YukthiX.');
        const data = {
          slug: dto.slug,
          name: dto.name,
          signUp: dto.signUp,
          allowedDomains: dto.allowedDomains ?? [],
          openRequests: dto.openRequests ?? false,
          accentColour: dto.accentColour ?? '#2563eb',
          loginTitle: dto.loginTitle || null,
          loginText: dto.loginText || null,
          readingAids: dto.readingAids ?? true,
          ...(dto.status ? { status: dto.status } : {}),
        };
        let portalId: string;
        if (id) {
          const cur = await tx.sdPortal.findFirst({ where: { organizationId: org, id } });
          if (!cur) throw new NotFoundException('No such portal.');
          if (dto.version !== undefined && dto.version !== cur.version) throw new ConflictException({ statusCode: 409, code: 'PORTAL_CHANGED', message: 'Someone changed this portal. Reload to see the latest.' });
          const before = (await tx.sdPortalDesk.findMany({ where: { organizationId: org, portalId: id } })).map((l) => l.deskId);
          this.requirePortal(a, [...new Set([...before, ...dto.deskIds])]);
          await tx.sdPortal.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
          await tx.sdPortalDesk.deleteMany({ where: { organizationId: org, portalId: id } });
          portalId = id;
        } else {
          portalId = (await tx.sdPortal.create({ data: { organizationId: org, ...data, createdBy: a.userId } })).id;
        }
        await tx.sdPortalDesk.createMany({ data: dto.deskIds.map((deskId) => ({ organizationId: org, portalId, deskId })) });
        // Turning a portal off ends its sign-ins.
        if (dto.status === 'off') await tx.sdPortalSession.updateMany({ where: { organizationId: org, portalId, endedAt: null }, data: { endedAt: new Date() } });
        await audit(tx, a, id ? 'desk.portal.updated' : 'desk.portal.created', 'sd_portal', portalId, { ...data, deskIds: dto.deskIds });
        return { id: portalId };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Another portal uses that web address.');
      throw e;
    }
  }

  // ------------------------------------------------------------------------------------------ banners (SD-1.23)

  async banners(a: DeskActor, deskId: string) {
    requireWork(a, deskId);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const rows = await tx.sdBanner.findMany({ where: { organizationId: a.ctx.organizationId, deskId }, orderBy: { createdAt: 'desc' }, take: 100 });
      const votes = await tx.sdBannerVote.groupBy({ by: ['bannerId'], where: { organizationId: a.ctx.organizationId, bannerId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
      const n = new Map(votes.map((v) => [v.bannerId, v._count._all]));
      const tickets = new Map((await tx.sdTicket.findMany({ where: { organizationId: a.ctx.organizationId, id: { in: rows.map((r) => r.ticketId).filter((x): x is string => Boolean(x)) } }, select: { id: true, number: true, systemState: true } })).map((t) => [t.id, t]));
      return rows.map((b) => ({ ...this.bannerView(b, tickets.get(b.ticketId ?? '')), meToo: n.get(b.id) ?? 0, ticket: b.ticketId ? (tickets.get(b.ticketId) ?? null) : null }));
    });
  }

  private bannerView(b: Prisma.SdBannerGetPayload<object>, t?: { systemState: string } | null) {
    const now = Date.now();
    const live = !b.endedAt && b.startsAt.getTime() <= now && (!b.endsAt || b.endsAt.getTime() > now) && (!b.ticketId || (t ? !['solved', 'closed'].includes(t.systemState) : true));
    return { id: b.id, deskId: b.deskId, text: b.text, severity: b.severity, audience: b.audience, locationId: b.locationId, ticketId: b.ticketId, startsAt: b.startsAt, endsAt: b.endsAt, endedAt: b.endedAt, live };
  }

  /** US-G-020: an agent of the desk posts a banner, optionally from an open incident ("me too" then links to it). */
  async saveBanner(a: DeskActor, deskId: string, id: string | null, dto: BannerDto) {
    requireWork(a, deskId);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      if (dto.ticketId) {
        const t = await tx.sdTicket.findFirst({ where: { organizationId: org, deskId, id: dto.ticketId } });
        if (!t || !['new', 'open', 'pending', 'on_hold'].includes(t.systemState)) throw new BadRequestException('Link an open ticket of this desk.');
        // "Me too" makes people followers of the ticket: never a private or sensitive one.
        if (t.sensitive || t.private) throw new BadRequestException('A banner cannot link to a private or sensitive ticket.');
      }
      if (dto.locationId && !(await tx.location.findFirst({ where: { organizationId: org, id: dto.locationId }, select: { id: true } }))) throw new BadRequestException('Choose a location.');
      const data = { text: dto.text, severity: dto.severity, audience: dto.audience, locationId: dto.locationId ?? null, ticketId: dto.ticketId ?? null, ...(dto.startsAt ? { startsAt: new Date(dto.startsAt) } : {}), endsAt: dto.endsAt ? new Date(dto.endsAt) : null };
      const b = id ? ((await tx.sdBanner.updateMany({ where: { organizationId: org, deskId, id, endedAt: null }, data })).count ? { id } : null) : await tx.sdBanner.create({ data: { organizationId: org, deskId, ...data, createdBy: a.userId } });
      if (!b) throw new NotFoundException('No such banner (or it has ended).');
      if (!id) await emit(tx, org, 'helpdesk.banner.published', { bannerId: b.id, deskId });
      await audit(tx, a, id ? 'desk.banner.updated' : 'desk.banner.posted', 'sd_banner', b.id, { deskId, ...data });
      return { id: b.id };
    });
  }

  async endBanner(a: DeskActor, deskId: string, id: string) {
    requireWork(a, deskId);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const res = await tx.sdBanner.updateMany({ where: { organizationId: a.ctx.organizationId, deskId, id, endedAt: null }, data: { endedAt: new Date() } });
      if (!res.count) throw new NotFoundException('No such banner (or it has ended).');
      await audit(tx, a, 'desk.banner.ended', 'sd_banner', id, { deskId });
      return { ended: true };
    });
  }

  /** Live banners for an audience on some desks; employees may also be matched by their work location. */
  private async liveBanners(tx: Tx, org: string, deskIds: string[] | null, audience: 'employees' | 'customers', personId: string | null) {
    const now = new Date();
    const rows = await tx.sdBanner.findMany({
      where: { organizationId: org, ...(deskIds ? { deskId: { in: deskIds } } : {}), audience: { in: ['everyone', audience] }, endedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      orderBy: [{ severity: 'desc' }, { startsAt: 'desc' }],
      take: 20,
    });
    const linked = rows.map((r) => r.ticketId).filter((x): x is string => Boolean(x));
    // Only the incident's state, read as the desk: the person need not see the incident itself to see its banner end.
    const states = linked.length
      ? new Map((await deskSystem(this.tenantPrisma, { organizationId: org, isSuperAdmin: false }, (sys) => sys.sdTicket.findMany({ where: { organizationId: org, id: { in: linked } }, select: { id: true, systemState: true } }))).map((t) => [t.id, t.systemState]))
      : new Map<string, string>();
    const location = audience === 'employees' && personId ? await this.locationOf(tx, org, personId) : null;
    const voted = personId ? new Set((await tx.sdBannerVote.findMany({ where: { organizationId: org, personId, bannerId: { in: rows.map((r) => r.id) } }, select: { bannerId: true } })).map((v) => v.bannerId)) : new Set<string>();
    return rows
      .filter((b) => !b.ticketId || !['solved', 'closed'].includes(states.get(b.ticketId) ?? 'open'))
      .filter((b) => !b.locationId || b.locationId === location)
      .map((b) => ({ id: b.id, text: b.text, severity: b.severity, canMeToo: Boolean(b.ticketId), meToo: voted.has(b.id) }));
  }

  private async locationOf(tx: Tx, org: string, personId: string): Promise<string | null> {
    const [row] = await tx.$queryRaw<{ location_id: string | null }[]>`
      SELECT a.location_id FROM employees e
      JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL
        AND a.valid_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date AND (a.valid_to IS NULL OR a.valid_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date)
      WHERE e.organization_id = ${org}::uuid AND e.person_id = ${personId}::uuid LIMIT 1`;
    return row?.location_id ?? null;
  }

  /** "Me too": one vote per person, and the person follows the linked incident instead of raising a new ticket. */
  private async meTooIn(tx: Tx, org: string, bannerId: string, personId: string, audience: 'employees' | 'customers', deskIds: string[] | null, by: { ctx: DeskActor['ctx']; userId: string | null }) {
    const live = await this.liveBanners(tx, org, deskIds, audience, personId);
    if (!live.some((b) => b.id === bannerId && b.canMeToo)) throw new NotFoundException('No such banner.');
    const b = await tx.sdBanner.findFirstOrThrow({ where: { organizationId: org, id: bannerId } });
    const vote = await tx.sdBannerVote.createMany({ data: [{ organizationId: org, bannerId, personId }], skipDuplicates: true });
    if (!vote.count) return { linked: true, already: true };
    // Followed as the desk: the person cannot read the incident before they follow it (and only a standard one is linked).
    await deskSystem(this.tenantPrisma, by.ctx, async (sys) => {
      const t = await sys.sdTicket.findFirstOrThrow({ where: { organizationId: org, id: b.ticketId! } });
      await this.tickets.addWatcherIn(sys, by, t, personId, true, personId);
      await this.tickets.event(sys, t, 'me_too', null, null, { by: null, byPerson: personId, reason: 'Someone has the same problem (banner)' });
    });
    await audit(tx, { ctx: by.ctx, userId: by.userId as string }, 'desk.banner.me_too', 'sd_banner', bannerId, { personId, ticketId: b.ticketId });
    return { linked: true, already: false };
  }

  // ------------------------------------------------------------------------------------------ employees (in-app)

  async myBanners(r: Requester) {
    return this.tenantPrisma.forTenant(r.ctx, async (tx) => {
      const personId = await this.requesters.personOf(tx, r, false);
      return this.liveBanners(tx, r.ctx.organizationId, null, 'employees', personId);
    });
  }

  async myMeToo(r: Requester, bannerId: string) {
    if (r.acting) throw new ForbiddenException('Not available while acting for someone else');
    return this.tenantPrisma.forTenant(r.ctx, async (tx) => {
      const personId = (await this.requesters.personOf(tx, r, true))!;
      return this.meTooIn(tx, r.ctx.organizationId, bannerId, personId, 'employees', null, r);
    });
  }

  // ------------------------------------------------------------------------------------------ public portal

  private async portalOf(orgSlug: string, portalSlug: string): Promise<{ org: { id: string; name: string; slug: string }; portal: Portal; deskIds: string[] }> {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug }, select: { id: true, name: true, slug: true, status: true } });
    if (!org || !isOrganizationActive(org.status)) throw new NotFoundException('No such portal.');
    const found = await this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, async (tx) => {
      const portal = await tx.sdPortal.findFirst({ where: { organizationId: org.id, slug: portalSlug, status: 'active' } });
      const deskIds = portal ? (await tx.sdPortalDesk.findMany({ where: { organizationId: org.id, portalId: portal.id } })).map((l) => l.deskId) : [];
      return portal ? { portal, deskIds } : null;
    });
    if (!found) throw new NotFoundException('No such portal.');
    return { org, ...found };
  }

  /** GET /desk/portal/:org/:portal: the login screen and the raise form (no personal data). */
  async info(orgSlug: string, portalSlug: string) {
    const { org, portal, deskIds } = await this.portalOf(orgSlug, portalSlug);
    return this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, async (tx) => {
      const desks = await tx.sdDesk.findMany({ where: { organizationId: org.id, id: { in: deskIds }, status: 'active' }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
      const cats = await tx.sdCategory.findMany({ where: { organizationId: org.id, deskId: { in: deskIds }, active: true, sensitive: false }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, deskId: true, name: true, parentId: true } });
      const products = await tx.sdProduct.findMany({ where: { organizationId: org.id, active: true, OR: [{ deskId: null }, { deskId: { in: deskIds } }] }, orderBy: { name: 'asc' }, select: { id: true, name: true, deskId: true } });
      return {
        company: org.name,
        portal: { name: portal.name, accentColour: portal.accentColour, loginTitle: portal.loginTitle, loginText: portal.loginText, readingAids: portal.readingAids, openRequests: portal.openRequests, signUp: portal.signUp },
        desks: desks.map((d) => ({ ...d, categories: cats.filter((c) => c.deskId === d.id).map(({ deskId: _d, ...c }) => c), products: products.filter((p) => !p.deskId || p.deskId === d.id).map((p) => ({ id: p.id, name: p.name })) })),
        banners: await this.liveBanners(tx, org.id, deskIds, 'customers', null),
      };
    });
  }

  /** May this email use the portal? An existing active outside contact, or a new person the sign-up setting lets in. */
  private async eligible(tx: Tx, org: string, portal: Portal, email: string): Promise<{ ok: boolean; personId: string | null }> {
    const person = await tx.person.findFirst({ where: { organizationId: org, status: 'active', primaryEmail: email }, select: { id: true } });
    if (person) {
      // Colleagues sign in to YukthiX itself; an outside contact who was turned off cannot sign in.
      if (await isInternal(tx, org, person.id)) return { ok: false, personId: null };
      const contacts = await tx.sdCustomerContact.findMany({ where: { organizationId: org, personId: person.id }, select: { status: true } });
      if (contacts.length && contacts.every((c) => c.status !== 'active')) return { ok: false, personId: null };
      if (contacts.length) return { ok: true, personId: person.id };
    }
    const domain = email.split('@')[1] ?? '';
    const open = portal.signUp === 'open' || (portal.signUp === 'allowed_domains' && portal.allowedDomains.includes(domain));
    return { ok: open, personId: person?.id ?? null };
  }

  private otpKey(org: string, portalId: string, email: string) {
    return `sd:portal-otp:${org}:${portalId}:${sha256(email)}`;
  }

  /** Step 1: a one-time code by email. The same answer and the same limits whether or not the email may sign in. */
  async startSignIn(orgSlug: string, portalSlug: string, dto: PortalEmailDto, ip: string | null) {
    await assertHuman(dto.challengeToken, ip);
    const { org, portal } = await this.portalOf(orgSlug, portalSlug);
    await this.otp.reserveSend(`sd-portal:${org.id}:${portal.id}:${dto.email}`, ip);
    const ok = await this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, (tx) => this.eligible(tx, org.id, portal, dto.email));
    if (ok.ok) {
      const code = await this.otp.issue(this.otpKey(org.id, portal.id, dto.email), { email: dto.email });
      this.otp.deliver('email', dto.email, code, 'sign_in', org.id, { userId: '' });
    }
    return { sent: true };
  }

  /** Step 2: the code. A right code proves the email; a new allowed person becomes a contact; a session starts. */
  async verifySignIn(orgSlug: string, portalSlug: string, dto: PortalVerifyDto, ip: string | null) {
    const { org, portal } = await this.portalOf(orgSlug, portalSlug);
    const data = await this.otp.check(this.otpKey(org.id, portal.id, dto.email), dto.code);
    if (!data || data.email !== dto.email) throw new UnauthorizedException('That code is not right or has expired. Ask for a new one.');
    return this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, async (tx) => {
      const ok = await this.eligible(tx, org.id, portal, dto.email);
      if (!ok.ok) throw new UnauthorizedException('That code is not right or has expired. Ask for a new one.');
      const personId = ok.personId && (await tx.sdCustomerContact.findFirst({ where: { organizationId: org.id, personId: ok.personId }, select: { id: true } })) ? ok.personId : (await ensureContact(tx, org.id, dto.email, '', null)).personId;
      return this.startSession(tx, org.id, portal.id, personId, ip, 'code');
    });
  }

  private async startSession(tx: Tx, org: string, portalId: string, personId: string, ip: string | null, how: string) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);
    const s = await tx.sdPortalSession.create({ data: { organizationId: org, portalId, personId, tokenHash: sha256(token), ip: ip?.slice(0, 45) ?? null, expiresAt } });
    await audit(tx, { ctx: { organizationId: org, isSuperAdmin: false }, userId: null as unknown as string }, 'desk.portal.signed_in', 'person', personId, { portalId, sessionId: s.id, how, ip });
    return { token, expiresAt };
  }

  /** The signed-in outside requester behind the X-Portal-Session header, or 401. */
  async session(orgSlug: string, portalSlug: string, token: string | undefined): Promise<PortalSession> {
    if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new UnauthorizedException('Sign in again.');
    const { org, portal } = await this.portalOf(orgSlug, portalSlug);
    return this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, async (tx) => {
      const s = await tx.sdPortalSession.findFirst({ where: { organizationId: org.id, portalId: portal.id, tokenHash: sha256(token), endedAt: null } });
      const now = Date.now();
      if (!s || s.expiresAt.getTime() < now || s.lastSeenAt.getTime() < now - IDLE_MINUTES * 60_000) throw new UnauthorizedException('Sign in again.');
      const active = await tx.sdCustomerContact.findFirst({ where: { organizationId: org.id, personId: s.personId, status: 'active' }, select: { id: true } });
      if (!active) {
        await tx.sdPortalSession.update({ where: { id: s.id }, data: { endedAt: new Date() } });
        throw new UnauthorizedException('Sign in again.');
      }
      if (s.lastSeenAt.getTime() < now - 60_000) await tx.sdPortalSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
      return { organizationId: org.id, orgSlug: org.slug, portalId: portal.id, portalSlug: portal.slug, personId: s.personId, sessionId: s.id };
    });
  }

  async signOut(s: PortalSession) {
    await this.tenantPrisma.forTenant({ organizationId: s.organizationId, isSuperAdmin: false }, (tx) => tx.sdPortalSession.update({ where: { id: s.sessionId }, data: { endedAt: new Date() } }));
    return { signedOut: true };
  }

  /** Every read and write of an outside requester runs with app.portal_person_id: the database keeps them to their own records. */
  private asPortal<T>(s: PortalSession, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant({ organizationId: s.organizationId, isSuperAdmin: false }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.portal_person_id', ${s.personId}, true)`;
      return fn(tx);
    });
  }

  /** Tickets the outside requester follows: raised by them, for them, followed, or (customer admin contact) their account's. */
  private async mine(tx: Tx, s: PortalSession): Promise<Prisma.SdTicketWhereInput> {
    const shared = (await tx.sdCustomerContact.findMany({ where: { organizationId: s.organizationId, personId: s.personId, status: 'active', seesAccountTickets: true, accountId: { not: null } }, select: { accountId: true } })).map((c) => c.accountId!);
    const watched = (await tx.sdTicketWatcher.findMany({ where: { organizationId: s.organizationId, personId: s.personId }, select: { ticketId: true } })).map((w) => w.ticketId);
    return { organizationId: s.organizationId, OR: [{ requesterPersonId: s.personId }, { requestedForPersonId: s.personId }, { id: { in: watched } }, ...(shared.length ? [{ customerAccountId: { in: shared } }] : [])] };
  }

  async me(s: PortalSession) {
    return this.asPortal(s, async (tx) => {
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: s.organizationId, id: s.personId }, select: { givenName: true, familyName: true, primaryEmail: true } });
      const accountId = await contactAccount(tx, s.organizationId, s.personId);
      const account = accountId ? await tx.sdCustomerAccount.findFirst({ where: { organizationId: s.organizationId, id: accountId }, select: { name: true } }) : null;
      const sharesAccount = Boolean(await tx.sdCustomerContact.findFirst({ where: { organizationId: s.organizationId, personId: s.personId, seesAccountTickets: true, status: 'active' }, select: { id: true } }));
      return { name: [p.givenName, p.familyName].filter(Boolean).join(' '), email: p.primaryEmail, account: account?.name ?? null, seesAccountTickets: sharesAccount };
    });
  }

  async list(s: PortalSession) {
    return this.asPortal(s, async (tx) => {
      const rows = await tx.sdTicket.findMany({ where: await this.mine(tx, s), orderBy: { updatedAt: 'desc' }, take: 200 });
      const statuses = new Map((await tx.sdStatus.findMany({ where: { organizationId: s.organizationId, id: { in: rows.map((t) => t.statusId) } }, select: { id: true, label: true } })).map((x) => [x.id, x.label]));
      const people = await this.tickets.personNames(tx, s.organizationId, rows.map((t) => t.requesterPersonId));
      return rows.map((t) => ({ id: t.id, number: t.number, subject: t.subject, status: statuses.get(t.statusId) ?? '', systemState: t.systemState, mine: t.requesterPersonId === s.personId, raisedBy: people.get(t.requesterPersonId)?.name ?? '', createdAt: t.createdAt, updatedAt: t.updatedAt }));
    });
  }

  private async load(tx: Tx, s: PortalSession, id: string) {
    const t = await tx.sdTicket.findFirst({ where: { AND: [{ id }, await this.mine(tx, s)] } });
    if (!t) throw new NotFoundException('No such ticket.');
    return t;
  }

  async get(s: PortalSession, id: string) {
    return this.asPortal(s, async (tx) => {
      const org = s.organizationId;
      const t = await this.load(tx, s, id);
      const messages = await tx.sdTicketMessage.findMany({ where: { organizationId: org, ticketId: t.id, kind: { in: ['reply', 'system'] } }, orderBy: { createdAt: 'asc' } });
      const files = await tx.sdAttachment.findMany({ where: { organizationId: org, ticketId: t.id, OR: [{ side: 'requester' }, { messageId: { in: messages.filter((m) => m.kind === 'reply').map((m) => m.id) } }] }, orderBy: { createdAt: 'asc' } });
      const status = await tx.sdStatus.findFirst({ where: { organizationId: org, id: t.statusId }, select: { label: true } });
      const desk = await tx.sdDesk.findFirstOrThrow({ where: { organizationId: org, id: t.deskId }, select: { name: true } });
      const people = await this.tickets.personNames(tx, org, [t.requesterPersonId, ...messages.map((m) => m.authorPersonId)]);
      const users = await this.tickets.userNames(tx, org, messages.map((m) => m.authorUserId));
      const due = await this.tickets.sla.requesterDue(tx, org, t.id);
      return {
        id: t.id,
        number: t.number,
        subject: t.subject,
        desk: desk.name,
        status: status?.label ?? '',
        systemState: t.systemState,
        createdAt: t.createdAt,
        raisedBy: people.get(t.requesterPersonId)?.name ?? '',
        mine: t.requesterPersonId === s.personId,
        canReply: !t.mergedIntoId,
        resolveBy: due?.resolveBy ?? null,
        messages: messages.map((m) => ({
          id: m.id,
          side: m.side,
          // Agents show by first name only to outside customers.
          author: m.authorUserId ? ((users.get(m.authorUserId) ?? 'Support').split(/\s+/)[0] ?? 'Support') : m.authorPersonId ? (people.get(m.authorPersonId)?.name ?? '') : desk.name,
          mine: m.authorPersonId === s.personId,
          bodyHtml: m.bodyHtml,
          createdAt: m.createdAt,
        })),
        files: files.map((f) => ({ id: f.id, fileName: f.fileName, scanStatus: f.scanStatus })),
      };
    });
  }

  /** The desk's plan check runs as the desk: a contact sees only their own tickets, so their count would be too low. */
  private async usedUp(org: string, deskId: string, personId: string): Promise<boolean | undefined> {
    return deskSystem(this.tenantPrisma, { organizationId: org, isSuperAdmin: false }, async (tx) => {
      const desk = await tx.sdDesk.findFirst({ where: { organizationId: org, id: deskId }, select: { kind: true } });
      const accountId = desk?.kind === 'customer_support' ? await contactAccount(tx, org, personId) : null;
      const plan = accountId ? await planFor(tx, org, accountId) : null;
      return plan ? planUsedUp(tx, org, accountId!, plan) : undefined;
    });
  }

  private async checkRaise(tx: Tx, org: string, deskIds: string[], dto: PortalRaiseDto) {
    if (!deskIds.includes(dto.deskId)) throw new NotFoundException('No such desk.');
    if (dto.categoryId && !(await tx.sdCategory.findFirst({ where: { organizationId: org, deskId: dto.deskId, id: dto.categoryId, active: true, sensitive: false }, select: { id: true } }))) throw new BadRequestException('Choose a category of this desk.');
  }

  async raise(s: PortalSession, dto: PortalRaiseDto) {
    const { deskIds } = await this.portalOf(s.orgSlug, s.portalSlug);
    const usedUp = await this.usedUp(s.organizationId, dto.deskId, s.personId);
    const t = await this.asPortal(s, async (tx) => {
      await this.checkRaise(tx, s.organizationId, deskIds, dto);
      return this.tickets.createIn(tx, { ctx: { organizationId: s.organizationId, isSuperAdmin: false }, userId: null }, { deskId: dto.deskId, categoryId: dto.categoryId, productId: dto.productId, subject: dto.subject, bodyHtml: textToHtml(dto.description), requesterPersonId: s.personId, openedByUserId: null, channel: 'portal', side: 'requester', authorPersonId: s.personId, usedUp });
    });
    return { id: t.id, number: t.number };
  }

  async reply(s: PortalSession, id: string, text: string) {
    return this.asPortal(s, async (tx) => {
      const t = await this.load(tx, s, id);
      return this.requesters.replyIn(tx, { ctx: { organizationId: s.organizationId, isSuperAdmin: false }, userId: null }, t, s.personId, textToHtml(text), { channel: 'portal' });
    });
  }

  async meToo(s: PortalSession, bannerId: string) {
    const { deskIds } = await this.portalOf(s.orgSlug, s.portalSlug);
    return this.asPortal(s, (tx) => this.meTooIn(tx, s.organizationId, bannerId, s.personId, 'customers', deskIds, { ctx: { organizationId: s.organizationId, isSuperAdmin: false }, userId: null }));
  }

  // ------------------------------------------------------------------------------------------ open portal (US-G-021)

  /**
   * Raise without an account: the request waits until the person opens the link we email them (proves the address).
   * Turnstile, then 5 per email and 20 per IP an hour (the P12 code limits). The same answer whatever happens.
   */
  async openRequest(orgSlug: string, portalSlug: string, dto: OpenRequestDto, ip: string | null) {
    await assertHuman(dto.challengeToken, ip);
    const { org, portal, deskIds } = await this.portalOf(orgSlug, portalSlug);
    if (!portal.openRequests) throw new NotFoundException('This portal takes requests from signed-in customers only.');
    await this.otp.reserveSend(`sd-portal-request:${org.id}:${dto.email}`, ip);
    const token = randomBytes(32).toString('base64url');
    const send = await this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, async (tx) => {
      await this.checkRaise(tx, org.id, deskIds, dto);
      if (!(await this.eligible(tx, org.id, portal, dto.email)).ok) return false;
      await tx.sdPortalRequest.create({
        data: { organizationId: org.id, portalId: portal.id, deskId: dto.deskId, email: dto.email, name: dto.name, payload: { subject: dto.subject, description: dto.description, categoryId: dto.categoryId ?? null, productId: dto.productId ?? null }, tokenHash: sha256(token), ip: ip?.slice(0, 45) ?? null, expiresAt: new Date(Date.now() + REQUEST_HOURS * 3_600_000) },
      });
      return true;
    });
    if (send) {
      const link = `${webOrigin()}/yx/portal/${org.slug}/${portal.slug}/confirm?token=${token}`;
      void this.email
        .send({ to: dto.email, organizationId: org.id, fromName: portal.name, subject: `Confirm your request to ${org.name}`, html: `<p>Hello ${esc(dto.name)},</p><p>Please confirm your request "${esc(dto.subject)}" so we can open a ticket:</p><p><a href="${esc(link)}">Confirm my request</a></p><p>The link works for 24 hours. If you did not ask for help, ignore this email.</p>`, text: `Confirm your request "${dto.subject}": ${link} (works for 24 hours). If you did not ask for help, ignore this email.`, headers: { 'Auto-Submitted': 'auto-generated' } })
        .catch((e) => this.logger.warn(`Portal request link not sent: ${(e as Error).message}`));
    }
    return { sent: true };
  }

  /** The emailed link: makes the ticket once (as that person, through the portal\'s own SQL scope) and signs them in. */
  async confirm(orgSlug: string, portalSlug: string, token: string, ip: string | null) {
    const { org, portal, deskIds } = await this.portalOf(orgSlug, portalSlug);
    const ctx = { organizationId: org.id, isSuperAdmin: false };
    const req = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const r = await tx.sdPortalRequest.findFirst({ where: { organizationId: org.id, portalId: portal.id, tokenHash: sha256(token) } });
      if (!r || r.expiresAt.getTime() < Date.now()) throw new NotFoundException('This link has expired. Send your request again.');
      if (r.confirmedAt) throw new ConflictException('This request was already confirmed. Sign in to follow it.');
      // One click makes one ticket, even when the link is opened twice at once.
      const won = await tx.sdPortalRequest.updateMany({ where: { id: r.id, confirmedAt: null }, data: { confirmedAt: new Date() } });
      if (!won.count) throw new ConflictException('This request was already confirmed. Sign in to follow it.');
      if (!(await this.eligible(tx, org.id, portal, r.email)).ok) throw new NotFoundException('This link has expired. Send your request again.');
      const personId = (await ensureContact(tx, org.id, r.email, r.name, null)).personId;
      return { ...r, personId };
    });
    const p = req.payload as { subject: string; description: string; categoryId: string | null; productId: string | null };
    const s: PortalSession = { organizationId: org.id, orgSlug: org.slug, portalId: portal.id, portalSlug: portal.slug, personId: req.personId, sessionId: '' };
    const usedUp = await this.usedUp(org.id, req.deskId, req.personId);
    const t = await this.asPortal(s, async (tx) => {
      if (!deskIds.includes(req.deskId)) throw new NotFoundException('No such desk.');
      const n = await this.tickets.createIn(tx, { ctx, userId: null }, { deskId: req.deskId, categoryId: p.categoryId ?? undefined, productId: p.productId, subject: p.subject, bodyHtml: textToHtml(p.description), requesterPersonId: req.personId, openedByUserId: null, channel: 'portal', side: 'requester', authorPersonId: req.personId, usedUp });
      await tx.sdPortalRequest.update({ where: { id: req.id }, data: { ticketId: n.id } });
      return n;
    });
    const session = await this.tenantPrisma.forTenant(ctx, (tx) => this.startSession(tx, org.id, portal.id, req.personId, ip, 'email-link'));
    return { id: t.id, number: t.number, ...session };
  }
}
