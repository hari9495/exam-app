import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { OtpService } from '../auth/otp.service';
import { EmailService } from '../email/email.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { displayName } from '../employee-history/employee-history.service';
import { StaffingService } from './staffing.service';
import { toRupees } from './staffing-rules';
import { addDays } from './billing-rules';
import type { ContactPortalDto, PortalDecisionDto, PortalEmailDto, PortalSendBackDto, PortalVerifyDto } from './staffing-dto';

const PORTAL_MINUTES = 60;
const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const hrs = (c: number) => (c / 100).toString();
type Session = { org: string; contactId: string; clientId: string };
const STAGE: Record<string, string> = { submitted: 'New', client_review: 'Shortlisted', interview: 'Interview', selected: 'Offered', rejected: 'Rejected' };

/**
 * Answer 453 (T9-06): a client contact's portal. The account manager gives a contact access (invited, then active on the
 * first sign-in); the contact signs in with a one-time code to their email (the drawn sign-in), and sees only their own
 * client's client jobs, submissions (shortlist or reject with feedback), timesheets (approve or send back) and issued
 * invoices. Never pay rates, vendor rates, margins or other clients. Interviews and tickets are not built (question 491).
 */
@Injectable()
export class ClientPortalService {
  private readonly logger = new Logger(ClientPortalService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly staffing: StaffingService,
    private readonly otp: OtpService,
    private readonly email: EmailService,
  ) {}

  /* ---------------- the account manager's side ---------------- */

  async setAccess(ctx: TenantContext, user: ScopeUser, clientId: string, contactId: string, dto: ContactPortalDto) {
    await this.staffing.gate(user, 'manage');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.staffing.deskOn(tx, c);
      const contact = await tx.staffingClientContact.findFirst({ where: { id: contactId, clientId, organizationId: c.organizationId, archivedAt: null } });
      if (!contact) throw new NotFoundException('Contact not found.');
      if (dto.access && contact.portal !== 'none') throw new ConflictException('This contact already has portal access.');
      await tx.staffingClientContact.update({ where: { id: contactId }, data: dto.access ? { portal: 'invited', portalInvitedAt: new Date() } : { portal: 'none', portalInvitedAt: null } });
      if (!dto.access) await tx.staffingPortalSession.updateMany({ where: { contactId, endedAt: null }, data: { endedAt: new Date() } });
      await audit(tx, c, dto.access ? 'staffing.portal.invited' : 'staffing.portal.removed', 'staffing_client_contact', contactId, {});
      const org = await tx.organization.findUnique({ where: { id: c.organizationId }, select: { name: true, slug: true } });
      return { contact, org };
    });
    if (dto.access && out.org) {
      const link = `${process.env.WEB_APP_URL ?? 'http://localhost:3000'}/yx/client/${encodeURIComponent(out.org.slug)}`;
      await this.email
        .send({ to: out.contact.email, subject: `${out.org.name}: your client portal`, html: `<p>${escapeHtml(out.org.name)} gave you access to its client portal: your jobs, submissions, timesheets and invoices.</p><p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p><p>Sign in with this email; we send you a one-time code.</p>`, organizationId: ctx.organizationId as string })
        .catch((e: Error) => this.logger.warn(`portal invite: ${e.message}`));
    }
    return { portal: dto.access ? 'invited' : 'none' };
  }

  /* ---------------- sign-in ---------------- */

  private async orgOf(slug: string) {
    const o = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.findUnique({ where: { slug }, select: { id: true } }));
    if (!o) throw new NotFoundException('No such company.');
    return o.id;
  }

  private contactsByEmail(tx: Tx, org: string, email: string) {
    return tx.staffingClientContact.findMany({ where: { organizationId: org, email: { equals: email, mode: 'insensitive' }, archivedAt: null, portal: { in: ['invited', 'active'] } } });
  }

  private otpKey = (org: string, email: string) => `client-portal-otp:${org}:${tokenHash(email)}`;

  /** Always "sent" (no enumeration); a code goes only to a contact with access whose company runs the desk. */
  async code(slug: string, dto: PortalEmailDto, ip: string | null) {
    const org = await this.orgOf(slug);
    const email = dto.email.toLowerCase();
    await this.otp.reserveSend(`client-portal:${org}:${email}`, ip);
    const ok = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => (await this.deskOn(tx, org)) && (await this.contactsByEmail(tx, org, email)).length > 0);
    if (ok) this.otp.deliver('email', email, await this.otp.issue(this.otpKey(org, email), { email }), 'sign_in', org, { userId: '' });
    return { sent: true };
  }

  private async deskOn(tx: Tx, org: string) {
    return (await settingFor(tx, { organizationId: org, isSuperAdmin: false } as CompanyContext, 'staffing.desk.enabled', { legalEntityId: '' })) === 'on';
  }

  async verify(slug: string, dto: PortalVerifyDto) {
    const org = await this.orgOf(slug);
    const email = dto.email.toLowerCase();
    const data = await this.otp.check(this.otpKey(org, email), dto.code);
    const wrong = () => new UnauthorizedException('That code is not right or has expired. Ask for a new one.');
    if (!data || data.email !== email) throw wrong();
    return this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
      const [contact] = await this.contactsByEmail(tx, org, email);
      // shortcut: a person who is a contact of two clients signs in to the first; a client picker comes if that happens.
      if (!contact || !(await this.deskOn(tx, org))) throw wrong();
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + PORTAL_MINUTES * 60_000);
      await tx.staffingPortalSession.create({ data: { organizationId: org, contactId: contact.id, clientId: contact.clientId, tokenHash: tokenHash(token), expiresAt } });
      if (contact.portal === 'invited') await tx.staffingClientContact.update({ where: { id: contact.id }, data: { portal: 'active' } });
      await audit(tx, { organizationId: org, isSuperAdmin: false } as CompanyContext, 'staffing.portal.signed_in', 'staffing_client_contact', contact.id, {});
      return { token, expiresAt };
    });
  }

  /** Every portal call: a live session of a contact who still has access, for a company that runs the desk. */
  private async inPortal<T>(slug: string, token: string | undefined, fn: (tx: Tx, s: Session) => Promise<T>): Promise<T> {
    if (!token) throw new UnauthorizedException('Sign in again.');
    const org = await this.orgOf(slug);
    return this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
      const s = await tx.staffingPortalSession.findFirst({ where: { organizationId: org, tokenHash: tokenHash(token), endedAt: null, expiresAt: { gt: new Date() } } });
      if (!s) throw new UnauthorizedException('Sign in again.');
      const contact = await tx.staffingClientContact.findFirst({ where: { id: s.contactId, archivedAt: null, portal: 'active' } });
      if (!contact || !(await this.deskOn(tx, org))) throw new UnauthorizedException('Sign in again.');
      return fn(tx, { org, contactId: s.contactId, clientId: s.clientId });
    });
  }

  signOut(slug: string, token: string | undefined) {
    return this.inPortal(slug, token, async (tx) => {
      await tx.staffingPortalSession.updateMany({ where: { tokenHash: tokenHash(token!) }, data: { endedAt: new Date() } });
      return { signedOut: true };
    });
  }

  me(slug: string, token: string | undefined) {
    return this.inPortal(slug, token, async (tx, s) => {
      const client = await tx.staffingClient.findFirstOrThrow({ where: { id: s.clientId, organizationId: s.org } });
      const contact = await tx.staffingClientContact.findFirstOrThrow({ where: { id: s.contactId } });
      const org = await tx.organization.findUnique({ where: { id: s.org }, select: { name: true } });
      const jobs = await tx.job.findMany({ where: { organizationId: s.org, staffingClientId: s.clientId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, title: true, location: true, headcount: true, status: true } });
      const subs = await tx.staffingSubmission.findMany({ where: { organizationId: s.org, clientId: s.clientId }, orderBy: { createdAt: 'desc' }, take: 500 });
      const emp = await tx.employee.findMany({ where: { organizationId: s.org, id: { in: subs.map((x) => x.employeeId).filter((x): x is string => Boolean(x)) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      const cand = await tx.candidate.findMany({ where: { organizationId: s.org, id: { in: subs.map((x) => x.candidateId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, erasedAt: true } });
      const placements = await tx.staffingPlacement.findMany({ where: { organizationId: s.org, clientId: s.clientId } });
      const hours = await tx.staffingHours.findMany({ where: { organizationId: s.org, clientId: s.clientId }, orderBy: { weekStart: 'desc' }, take: 500 });
      const rates = await tx.staffingRate.findMany({ where: { organizationId: s.org, clientId: s.clientId, validTo: null }, select: { lineId: true, role: true } });
      const agencies = await tx.agency.findMany({ where: { organizationId: s.org, id: { in: placements.map((p) => p.agencyId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } });
      const invoices = await tx.staffingInvoice.findMany({ where: { organizationId: s.org, clientId: s.clientId, status: 'issued' }, orderBy: { invoiceDate: 'desc' }, take: 200 });
      const alloc = await tx.staffingReceiptAllocation.groupBy({ by: ['invoiceId'], where: { invoiceId: { in: invoices.map((i) => i.id) } }, _sum: { amountPaise: true } });
      const terms = client.paymentTermsDays ?? Number(await settingFor(tx, { organizationId: s.org, isSuperAdmin: false } as CompanyContext, 'staffing.payment_terms_days', { legalEntityId: '' }));
      const today = todayIst();
      const person = (x: (typeof subs)[number]) => (x.employeeId ? displayName(emp.find((e) => e.id === x.employeeId) ?? { givenName: 'Employee', familyName: null, preferredName: null }) : cand.find((c) => c.id === x.candidateId)?.erasedAt ? 'Erased candidate' : (cand.find((c) => c.id === x.candidateId)?.name ?? 'Candidate'));
      return {
        company: org?.name ?? '',
        client: { name: client.name, contact: contact.name, email: contact.email, contractEnds: iso(client.contractEnd) },
        jobs: jobs.map((j) => ({ id: j.id, title: j.title, location: j.location ?? '', openings: j.headcount ?? 1, submissions: subs.filter((x) => x.jobId === j.id).length, interviews: subs.filter((x) => x.jobId === j.id && x.stage === 'interview').length, status: j.status === 'open' ? 'Open' : j.status === 'on_hold' ? 'On hold' : 'Filled' })),
        submissions: subs.map((x) => ({ id: x.id, candidate: person(x), jobId: x.jobId, job: jobs.find((j) => j.id === x.jobId)?.title ?? '', submittedOn: iso(x.createdAt), status: STAGE[x.stage] ?? x.stage, feedback: x.rejectedReason ?? x.feedback })),
        timesheets: hours.map((h) => {
          const p = placements.find((x) => x.id === h.placementId)!;
          return { id: h.id, worker: p.workerName, role: rates.find((r) => r.lineId === p.lineId)?.role ?? '', weekStart: iso(h.weekStart), hours: hrs(h.hoursCenti), overtime: hrs(h.overtimeCenti), vendor: p.agencyId ? (agencies.find((a) => a.id === p.agencyId)?.name ?? null) : null, status: h.status === 'waiting' ? 'Waiting for you' : h.status === 'approved' ? 'Approved' : 'Sent back', note: h.note, version: h.version };
        }),
        invoices: invoices.map((i) => {
          const paid = alloc.find((a) => a.invoiceId === i.id)?._sum.amountPaise ?? 0n;
          const due = addDays(iso(i.invoiceDate)!, terms);
          return { id: i.id, no: i.number, kind: i.kind === 'credit_note' ? 'Credit note' : 'Contract staffing', period: i.periodStart ? iso(i.periodStart)!.slice(0, 7) : null, amount: toRupees(i.taxablePaise), gst: toRupees(i.totalPaise - i.taxablePaise), issuedOn: iso(i.invoiceDate), dueOn: due, status: i.kind === 'credit_note' ? 'Credit' : paid >= i.totalPaise ? 'Paid' : due < today ? 'Overdue' : 'Due' };
        }),
      };
    });
  }

  /** Shortlist or reject (with feedback) a submission of this client; the board moves the same way. */
  decide(slug: string, token: string | undefined, id: string, dto: PortalDecisionDto) {
    if (dto.decision === 'reject' && !dto.feedback?.trim()) throw new BadRequestException('Say why, so the recruiter can send someone better.');
    return this.inPortal(slug, token, async (tx, s) => {
      const sub = await tx.staffingSubmission.findFirst({ where: { id, organizationId: s.org } });
      if (!sub) throw new NotFoundException('Submission not found.');
      if (sub.clientId !== s.clientId) throw new ForbiddenException('This is not your company’s submission.');
      if (sub.stage !== 'submitted' && !(dto.decision === 'reject' && sub.stage === 'client_review')) throw new ConflictException('This submission has moved on already.');
      const stage = dto.decision === 'shortlist' ? 'client_review' : 'rejected';
      await tx.staffingSubmission.update({ where: { id }, data: { stage, stageEnteredAt: new Date(), feedback: dto.feedback?.trim() || sub.feedback, rejectedReason: stage === 'rejected' ? dto.feedback!.trim() : null } });
      await audit(tx, { organizationId: s.org, isSuperAdmin: false } as CompanyContext, 'staffing.submission.moved', 'staffing_submission', id, { from: sub.stage, to: stage, by: 'client_contact', contactId: s.contactId, reason: dto.feedback ?? null });
      return { id, stage };
    });
  }

  /** Approve a week's hours, or send them back with a note (the account manager corrects and resends). */
  timesheet(slug: string, token: string | undefined, id: string, action: 'approve' | 'send_back', dto?: PortalSendBackDto) {
    return this.inPortal(slug, token, async (tx, s) => {
      const h = await tx.staffingHours.findFirst({ where: { id, organizationId: s.org } });
      if (!h) throw new NotFoundException('Timesheet not found.');
      if (h.clientId !== s.clientId) throw new ForbiddenException('This is not your company’s timesheet.');
      const { count } = await tx.staffingHours.updateMany({ where: { id, status: 'waiting' }, data: { status: action === 'approve' ? 'approved' : 'sent_back', note: action === 'send_back' ? dto?.note?.trim() || null : null, decidedByContactId: s.contactId, decidedAt: new Date(), version: { increment: 1 } } });
      if (!count) throw new ConflictException('This timesheet is not waiting for you.');
      await audit(tx, { organizationId: s.org, isSuperAdmin: false } as CompanyContext, action === 'approve' ? 'staffing.hours.approved' : 'staffing.hours.sent_back', 'staffing_hours', id, { by: 'client_contact', contactId: s.contactId });
      return { id };
    });
  }
}
