import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { lineApproved } from '../time/line-rules';
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
import type { ContactPortalDto, PortalDecisionDto, PortalEmailDto, PortalInterviewDto, PortalSendBackDto, PortalVerifyDto } from './staffing-dto';
import { InterviewsService } from '../interviews/interviews.service';
import type { StaffingBillingService } from './billing.service';

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
 * invoices; interviews and tickets (answer 491; tickets in client-tickets.service.ts). Never pay rates, vendor rates,
 * margins or other clients.
 */
@Injectable()
export class ClientPortalService {
  private readonly logger = new Logger(ClientPortalService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly staffing: StaffingService,
    private readonly otp: OtpService,
    private readonly email: EmailService,
    private readonly interviews: InterviewsService,
  ) {}

  /** Set by the module (the billing service builds the invoice PDF; a constructor cycle otherwise). */
  billing?: StaffingBillingService;

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
  async inPortal<T>(slug: string, token: string | undefined, fn: (tx: Tx, s: Session) => Promise<T>): Promise<T> {
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
      // Answer 491: interviews for this client's jobs (HIR-06 interviews on the job's pipeline), and who can be booked.
      const ivs = await tx.interview.findMany({ where: { organizationId: s.org, pipelineEntry: { job: { staffingClientId: s.clientId } } }, include: { slots: { orderBy: { startsAt: 'asc' } }, pipelineEntry: { select: { jobId: true, candidate: { select: { name: true, erasedAt: true } } } } }, orderBy: { createdAt: 'desc' }, take: 300 });
      const ivStatus: Record<string, string> = { proposed: 'Proposed', confirmed: 'Confirmed', completed: 'Done', cancelled: 'Cancelled' };
      const invoices = await tx.staffingInvoice.findMany({ where: { organizationId: s.org, clientId: s.clientId, status: 'issued' }, orderBy: { invoiceDate: 'desc' }, take: 200 });
      const projectHours = await this.projectLines(tx, s);
      const alloc = await tx.staffingReceiptAllocation.groupBy({ by: ['invoiceId'], where: { invoiceId: { in: invoices.map((i) => i.id) } }, _sum: { amountPaise: true } });
      const terms = client.paymentTermsDays ?? Number(await settingFor(tx, { organizationId: s.org, isSuperAdmin: false } as CompanyContext, 'staffing.payment_terms_days', { legalEntityId: '' }));
      const today = todayIst();
      const person = (x: (typeof subs)[number]) => (x.employeeId ? displayName(emp.find((e) => e.id === x.employeeId) ?? { givenName: 'Employee', familyName: null, preferredName: null }) : cand.find((c) => c.id === x.candidateId)?.erasedAt ? 'Erased candidate' : (cand.find((c) => c.id === x.candidateId)?.name ?? 'Candidate'));
      return {
        company: org?.name ?? '',
        client: { name: client.name, contact: contact.name, email: contact.email, contractEnds: iso(client.contractEnd) },
        jobs: jobs.map((j) => ({ id: j.id, title: j.title, location: j.location ?? '', openings: j.headcount ?? 1, submissions: subs.filter((x) => x.jobId === j.id).length, interviews: subs.filter((x) => x.jobId === j.id && x.stage === 'interview').length, status: j.status === 'open' ? 'Open' : j.status === 'on_hold' ? 'On hold' : 'Filled' })),
        interviews: ivs.map((i) => {
          const slot = i.slots.find((x) => x.id === i.confirmedSlotId) ?? i.slots[0];
          return { id: i.id, candidate: i.pipelineEntry?.candidate.erasedAt ? 'Erased candidate' : (i.pipelineEntry?.candidate.name ?? ''), job: jobs.find((j) => j.id === i.pipelineEntry?.jobId)?.title ?? '', at: slot?.startsAt ?? null, mode: i.location, panel: (i.recruiterNote ?? '').replace(/^.*Client panel: /s, '') || null, status: ivStatus[i.status] ?? i.status };
        }),
        bookable: subs.filter((x) => x.candidateId && x.stage !== 'rejected').map((x) => ({ value: x.id, label: `${person(x)} · ${jobs.find((j) => j.id === x.jobId)?.title ?? ''}` })),
        submissions: subs.map((x) => ({ id: x.id, candidate: person(x), jobId: x.jobId, job: jobs.find((j) => j.id === x.jobId)?.title ?? '', submittedOn: todayIst(x.createdAt), status: STAGE[x.stage] ?? x.stage, feedback: x.rejectedReason ?? x.feedback })),
        // Answer 1408 (914): lines of this client's projects that ask the client to approve hours, and only those.
        projectHours,
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

  /** Answer 1408: the approved lines of this client's own projects that ask the client to approve hours. */
  private async projectLines(tx: Tx, s: Session) {
    const projects = await tx.timesheetProject.findMany({ where: { organizationId: s.org, clientId: s.clientId, clientApprovesHours: true }, select: { id: true, code: true, name: true, clientSeesNotes: true } });
    if (!projects.length) return [];
    const lines = await tx.timesheetLine.findMany({ where: { organizationId: s.org, projectId: { in: projects.map((p) => p.id) }, clientStatus: { not: null } }, take: 500 });
    const sheets = await tx.timesheet.findMany({ where: { organizationId: s.org, id: { in: [...new Set(lines.map((l) => l.timesheetId))] } }, select: { id: true, employeeId: true, weekStart: true } });
    const people = await tx.employee.findMany({ where: { organizationId: s.org, id: { in: [...new Set(sheets.map((x) => x.employeeId))] } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
    return lines
      .map((l) => {
        const sh = sheets.find((x) => x.id === l.timesheetId)!;
        const p = projects.find((x) => x.id === l.projectId)!;
        const minutes = lineApproved(l).reduce((a, b) => a + b, 0);
        return { id: l.id, worker: displayName(people.find((e) => e.id === sh.employeeId) ?? { givenName: 'Employee', familyName: null, preferredName: null }), project: `${p.code} · ${p.name}`, task: l.activity, weekStart: iso(sh.weekStart), hours: hrs(Math.round((minutes * 100) / 60)), status: l.clientStatus === 'waiting' ? 'Waiting for you' : l.clientStatus === 'approved' ? 'Approved' : 'Sent back', note: l.clientNote, workNote: p.clientSeesNotes ? l.note : null, version: l.version };
      })
      .sort((a, b) => (b.weekStart ?? '').localeCompare(a.weekStart ?? ''));
  }

  /** Answer 1408: approve a project line's hours, or send them back with a note; only this client's own project lines. */
  projectHours(slug: string, token: string | undefined, id: string, action: 'approve' | 'send_back', dto?: PortalSendBackDto) {
    if (action === 'send_back' && !dto?.note?.trim()) throw new BadRequestException('Say what is wrong with these hours, so the project manager can fix them.');
    return this.inPortal(slug, token, async (tx, s) => {
      const l = await tx.timesheetLine.findFirst({ where: { id, organizationId: s.org } });
      if (!l) throw new NotFoundException('These hours were not found.');
      const p = await tx.timesheetProject.findFirst({ where: { id: l.projectId, organizationId: s.org }, select: { clientId: true, clientApprovesHours: true } });
      // Another client's project, or a project that does not ask its client: never this contact's to decide.
      if (!p || p.clientId !== s.clientId || !p.clientApprovesHours) throw new ForbiddenException('These are not your company’s project hours.');
      const { count } = await tx.timesheetLine.updateMany({ where: { id, clientStatus: 'waiting' }, data: { clientStatus: action === 'approve' ? 'approved' : 'sent_back', clientNote: action === 'send_back' ? dto!.note!.trim().slice(0, 500) : null, clientContactId: s.contactId, clientDecidedAt: new Date(), version: { increment: 1 } } });
      if (!count) throw new ConflictException('These hours are not waiting for you.');
      await audit(tx, { organizationId: s.org, isSuperAdmin: false } as CompanyContext, action === 'approve' ? 'projects.hours.client_approved' : 'projects.hours.client_sent_back', 'timesheet_line', id, { by: 'client_contact', contactId: s.contactId, note: dto?.note ?? null });
      return { id };
    });
  }

  /**
   * Answer 491: the client contact proposes an interview time for one of their candidates. It goes through HIR-06
   * (InterviewsService.createInterview on the candidate's pipeline entry: status proposed; the recruiter confirms with the
   * candidate and sends the invitations), never a second scheduler. The board moves the submission to Interview.
   */
  async bookInterview(slug: string, token: string | undefined, dto: PortalInterviewDto) {
    const startsAt = new Date(`${dto.startsAt}:00+05:30`);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now() + 60 * 60_000) throw new BadRequestException('Choose a time at least an hour from now.');
    const prep = await this.inPortal(slug, token, async (tx, s) => {
      const sub = await tx.staffingSubmission.findFirst({ where: { id: dto.submissionId, organizationId: s.org } });
      if (!sub) throw new NotFoundException('Submission not found.');
      if (sub.clientId !== s.clientId) throw new ForbiddenException('This is not your company’s submission.');
      if (!sub.candidateId) throw new ConflictException('Ask your account manager to arrange interviews for this person.');
      if (sub.stage === 'rejected' || sub.stage === 'selected') throw new ConflictException('This submission is closed for interviews.');
      const entry = await tx.pipelineEntry.findFirst({ where: { organizationId: s.org, candidateId: sub.candidateId, jobId: sub.jobId }, select: { id: true } });
      if (!entry) throw new ConflictException('Ask your account manager to arrange interviews for this person.');
      const client = await tx.staffingClient.findFirstOrThrow({ where: { id: s.clientId } });
      const actor = client.accountManagerUserId ?? sub.submittedBy;
      if (!actor) throw new ConflictException('Your account manager is not set yet. Ask them to arrange it.');
      const contact = await tx.staffingClientContact.findFirstOrThrow({ where: { id: s.contactId } });
      return { org: s.org, entryId: entry.id, actor, sub, contact };
    });
    const ctx = { organizationId: prep.org, isSuperAdmin: false };
    const mode = { video: 'Video call', site: 'At the client’s site', phone: 'Phone' }[dto.mode];
    const made = await this.interviews.createInterview(ctx, prep.actor, prep.entryId, {
      slots: [{ startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString() }],
      panelistUserIds: [],
      location: mode,
      timeZone: 'Asia/Kolkata',
      recruiterNote: `Asked by ${prep.contact.name} (client portal). Client panel: ${dto.panel?.trim() || 'not given'}`,
    } as never);
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      if (prep.sub.stage === 'submitted' || prep.sub.stage === 'client_review') await tx.staffingSubmission.update({ where: { id: prep.sub.id }, data: { stage: 'interview', stageEnteredAt: new Date() } });
      await audit(tx, { organizationId: prep.org, isSuperAdmin: false } as CompanyContext, 'staffing.portal.interview_proposed', 'staffing_submission', prep.sub.id, { interviewId: made.id, startsAt: startsAt.toISOString(), mode: dto.mode, contactId: prep.contact.id });
    });
    return { id: made.id };
  }

  /** Answer 492: the PDF of one of this client's issued invoices or credit notes. */
  invoicePdf(slug: string, token: string | undefined, id: string) {
    return this.inPortal(slug, token, (tx, s) => this.billing!.pdfIn(tx, s.org, id, s.clientId));
  }
}
