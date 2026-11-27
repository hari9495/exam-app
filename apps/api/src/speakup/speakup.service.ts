import { poshAnnualReportPdf } from './posh-report-pdf';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService, isOrganizationActive } from '@exam-platform/shared';
import { ScopeUser, buildViewer, tenantWide } from '../access/scope';
import { REDIS_CONNECTION } from '../jobs/redis-connection';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FilesService } from '../documents/files.service';
import { CompanyContext, Tx, audit, companyContext } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { safeName } from '../service-desk/attachments.service';
import { SPEAKUP_TEAMS, type AnnualReportStepDto, type AnonymousReportDto, type AwarenessSessionDto, type EditMemberDto, type ReportDto, type SpeakupKind, type SpeakupTeam, type TeamMemberDto } from './dto';
import { isoDay } from '../cases/case-rules';
import { jobsToday } from '../learning/learning-core';
import { addDays, anonymousAllowed, caseNumber, newReplyCode, poshLate, readCode, route, showCode } from './speakup-rules';

// HLP-06 speak-up filing (rules: docs/yukthix/helpdesk-design-map.md section 4e). Named reports come from the signed-in
// person; anonymous ones through the no-login route, so nothing links them to anyone: no user, no employee, no IP, no
// device, an audit entry without an actor, and the reply code kept only as an HMAC hash. Reports go to the company's
// case officers per list (never to an officer the report is about); a case shows only to the officers it was routed
// to (404 for everyone else, HR and managers included), and every look is audited. Legal clocks come from the rule sets
// IN.POSH and IN.GRC; company choices from the settings registry.

type Case = Prisma.SpeakupCaseGetPayload<object>;
const ANY_ENTITY = { legalEntityId: '00000000-0000-0000-0000-000000000000' };
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] as const;
const FILE_MAX_MB = 10;
const MAX_FILES = 10;
const TRIES_PER_HOUR = 5;
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);
const KIND_WORDS: Record<SpeakupKind, string> = { grievance: 'grievance', whistleblower: 'fraud or ethics report', posh: 'sexual harassment complaint' };
const TEAM_WORDS: Record<SpeakupTeam, string> = { grievance: 'the Grievance Redressal Committee', ethics: 'the ethics team', ic: 'the Internal Committee', escalation: 'the escalation list (for example the audit committee chair)', safety: 'the safety team', ir: 'the industrial relations team' };

/** Two reports numbered at the same moment (unique index): say so instead of a server error. */
const clash = (e: unknown): never => {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Another report was filed at the same moment. Press File report again.');
  throw e;
};

export interface Clock {
  key: string;
  label: string;
  due: string | null;
}

@Injectable()
export class SpeakupService {
  private readonly logger = new Logger(SpeakupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
    private readonly crypto: OrgSecretsCryptoService,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
    private readonly email: EmailService,
  ) {}

  private tx<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    const c = companyContext(ctx);
    return this.tenantPrisma.forTenant(c, (tx) => fn(tx, c)).catch(clash);
  }

  /** The company behind a no-login request (its sign-in name); an unknown or closed one is "not found". */
  private async orgBySlug(slug: string): Promise<{ id: string; name: string }> {
    const o = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.findFirst({ where: { slug: slug.toLowerCase() } }));
    if (!o || !isOrganizationActive(o.status)) throw new NotFoundException('We could not find that company.');
    return { id: o.id, name: o.name };
  }
  private system = (org: string): CompanyContext => ({ organizationId: org, isSuperAdmin: false, userId: null });

  private async teams(tx: Tx, org: string): Promise<Record<SpeakupTeam, string[]>> {
    const rows = await tx.speakupTeamMember.findMany({ where: { organizationId: org, removedAt: null }, select: { team: true, userId: true } });
    const out = Object.fromEntries(SPEAKUP_TEAMS.map((t) => [t, [] as string[]])) as Record<SpeakupTeam, string[]>;
    for (const r of rows) out[r.team as SpeakupTeam].push(r.userId);
    return out;
  }

  private async ruleSet(tx: Tx, statute: 'IN.POSH' | 'IN.GRC', today: string) {
    const rs = await tx.statutoryRuleSet.findFirst({ where: { statute, jurisdiction: 'IN', status: 'published', validFrom: { lte: day(today) }, OR: [{ validTo: null }, { validTo: { gte: day(today) } }] }, orderBy: { validFrom: 'desc' } });
    return rs ? { values: rs.values as Record<string, number>, label: `${statute} ${rs.version}${rs.verify ? ' (verify)' : ''}`, source: rs.source } : null;
  }

  private async settings(tx: Tx, c: CompanyContext) {
    return {
      anonymous: await settingFor(tx, c, 'speakup.anonymous', ANY_ENTITY),
      ackDays: Number(await settingFor(tx, c, 'speakup.ack_days', ANY_ENTITY)) || 2,
      grievance: lines(await settingFor(tx, c, 'speakup.categories.grievance', ANY_ENTITY)),
      ethics: lines(await settingFor(tx, c, 'speakup.categories.ethics', ANY_ENTITY)),
    };
  }

  // ------------------------------------------------------------------------------------------ the form

  /** What the speak-up form needs: the company's choices, who receives what, and the POSH window from the rule set. */
  async form(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const s = await this.settings(tx, c);
      const teams = await this.teams(tx, org);
      const officerIds = [...new Set([...teams.grievance, ...teams.ethics])];
      const [officers, locations, posh] = await Promise.all([
        tx.user.findMany({ where: { organizationId: org, id: { in: officerIds } }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
        tx.location.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        this.ruleSet(tx, 'IN.POSH', today),
      ]);
      const me = c.userId ? await tx.user.findFirst({ where: { organizationId: org, id: c.userId }, select: { name: true, email: true } }) : null;
      const org0 = await tx.organization.findFirst({ where: { id: org }, select: { slug: true, name: true } });
      return {
        company: org0?.name ?? '',
        org: org0?.slug ?? '',
        anonymous: s.anonymous as 'all' | 'ethics_only' | 'off',
        categories: { grievance: s.grievance, whistleblower: s.ethics },
        locations,
        officers: officers.map((u) => ({ id: u.id, name: u.name ?? u.email })),
        ready: { grievance: teams.grievance.length + teams.ethics.length > 0, whistleblower: teams.ethics.length > 0, posh: teams.ic.length > 0 },
        posh: posh ? { filingMonths: posh.values.filingMonths, extensionMonths: posh.values.filingExtensionMonths, source: posh.label } : null,
        ackDays: s.ackDays,
        me: me ? (me.name ?? me.email) : null,
      };
    });
  }

  // ------------------------------------------------------------------------------------------ filing

  /** Checks, number, routing and the clocks; the caller says who reported (or a code hash for an anonymous report). */
  private async file(tx: Tx, c: CompanyContext, dto: ReportDto, who: { userId: string; employeeId: string | null } | { codeHash: string }) {
    const org = c.organizationId;
    const today = todayIst();
    const s = await this.settings(tx, c);
    if (dto.happenedOn && dto.happenedOn > today) throw new BadRequestException('The date it happened can’t be in the future.');
    const cats = dto.kind === 'grievance' ? s.grievance : dto.kind === 'whistleblower' ? s.ethics : [];
    if (dto.category && !cats.includes(dto.category)) throw new BadRequestException('Choose one of the topics in the list.');
    if (dto.locationId && !(await tx.location.findFirst({ where: { organizationId: org, id: dto.locationId }, select: { id: true } }))) throw new BadRequestException('Choose one of the company’s locations.');
    // Answer 2597: the POSH complaint's own fields.
    if (dto.kind !== 'posh' && (dto.onBehalfName || dto.onBehalfRelation || dto.lateReason || dto.conciliation)) throw new BadRequestException('On her behalf, the late reason and conciliation are only for a sexual harassment complaint.');
    if (Boolean(dto.onBehalfName) !== Boolean(dto.onBehalfRelation)) throw new BadRequestException('Give her name and your relationship to her.');
    const teams = await this.teams(tx, org);
    if (dto.aboutUserId && !Object.values(teams).some((t) => t.includes(dto.aboutUserId!))) throw new BadRequestException('Choose one of the case officers in the list.');
    // Answer 2592: a POSH complaint goes to its workplace's committee when there is one, else to the company's.
    let icLocationId: string | null = null;
    if (dto.kind === 'posh') {
      // Answer 2623: a member whose term has ended receives no new complaint (a term ends at the end of its day).
      const ic = (await tx.speakupTeamMember.findMany({ where: { organizationId: org, team: 'ic', removedAt: null }, select: { userId: true, locationId: true, termEndsOn: true } })).filter((m) => !m.termEndsOn || isoDay(m.termEndsOn)! >= today);
      icLocationId = dto.locationId && ic.some((m) => m.locationId === dto.locationId) ? dto.locationId : null;
      teams.ic = ic.filter((m) => m.locationId === icLocationId).map((m) => m.userId);
    }
    const r = route(dto.kind, teams, dto.aboutUserId ?? null);
    if (!r)
      throw new ConflictException(
        dto.kind === 'posh'
          ? { statusCode: 409, code: 'SPEAKUP_NO_IC', message: 'Your company has not set up its Internal Committee yet, so the app cannot take this complaint. You can complain in writing to the Local Committee of your district. Tell your System Admin the committee is missing.' }
          : { statusCode: 409, code: 'SPEAKUP_NO_TEAM', message: 'Your company has not chosen who receives these reports yet, so the app cannot take it. Tell your System Admin.' },
      );
    const rs = dto.kind === 'grievance' ? await this.ruleSet(tx, 'IN.GRC', today) : dto.kind === 'posh' ? await this.ruleSet(tx, 'IN.POSH', today) : null;
    const decideDays = dto.kind === 'grievance' ? rs?.values.disposalDays : dto.kind === 'posh' ? rs?.values.inquiryDays : undefined;
    const late = dto.kind === 'posh' && rs ? poshLate(dto.happenedOn ?? null, today, rs.values.filingMonths) : false;
    const last = await tx.speakupCase.aggregate({ where: { organizationId: org, kind: dto.kind }, _max: { number: true } });
    const number = (last._max.number ?? 0) + 1;
    const row = await tx.speakupCase.create({
      data: {
        organizationId: org,
        kind: dto.kind,
        number,
        identity: 'codeHash' in who ? 'anonymous' : 'named',
        reporterUserId: 'codeHash' in who ? null : who.userId,
        reporterEmployeeId: 'codeHash' in who ? null : who.employeeId,
        replyCodeHash: 'codeHash' in who ? who.codeHash : null,
        category: dto.category || null,
        summary: dto.summary,
        happenedOn: dto.happenedOn ? day(dto.happenedOn) : null,
        locationId: dto.locationId ?? null,
        involved: dto.involved || null,
        outsideName: dto.outsideName || null,
        outsideEmployer: dto.outsideEmployer || null,
        witnesses: dto.witnesses || null,
        retaliationWorry: Boolean(dto.retaliationWorry),
        aboutUserId: dto.aboutUserId ?? null,
        routedTo: r.team,
        late,
        ackDueOn: day(addDays(today, s.ackDays)),
        decideDueOn: decideDays ? day(addDays(today, decideDays)) : null,
        ruleSet: rs?.label ?? null,
        icLocationId,
        onBehalfName: dto.onBehalfName || null,
        onBehalfRelation: dto.onBehalfRelation || null,
        lateReason: dto.lateReason || null,
        conciliationAsked: Boolean(dto.conciliation),
      },
    });
    await tx.speakupCaseMember.createMany({ data: r.members.map((userId) => ({ organizationId: org, caseId: row.id, userId })) });
    // No reporter, IP or device in the audit: the number and where it went only.
    await audit(tx, c, 'speakup.filed', 'speakup_case', row.id, { number: caseNumber(dto.kind, number), kind: dto.kind, identity: row.identity, routedTo: r.team, retaliationWorry: row.retaliationWorry, late });
    return { row, members: r.members, rs };
  }

  private view(row: Case, rs: { label: string } | null) {
    const clock: Clock[] = [
      { key: 'ack', label: 'Acknowledgement', due: iso(row.ackDueOn) },
      ...(row.kind === 'grievance' ? [{ key: 'decide', label: 'Decision by the committee', due: iso(row.decideDueOn) }] : []),
      ...(row.kind === 'posh' ? [{ key: 'inquiry', label: 'Inquiry completed by the committee', due: iso(row.decideDueOn) }] : []),
    ];
    return { id: row.id, number: caseNumber(row.kind as SpeakupKind, row.number), kind: row.kind, routedTo: row.routedTo, team: TEAM_WORDS[row.routedTo as SpeakupTeam], late: row.late, clock, source: rs?.label ?? null };
  }

  private async tell(org: string, members: string[], row: Case) {
    const n = caseNumber(row.kind as SpeakupKind, row.number);
    await this.notifications
      .notifySystem({ organizationId: org, isSuperAdmin: false }, members, 'helpdesk.speakup.received', { entityType: 'speakup_case', entityId: row.id, contextText: `${n} was routed to you${row.retaliationWorry ? '. The reporter is worried about retaliation.' : ''}`, linkPath: `/yx/desk/speakup` }, { subject: `A speak-up report ${n} is waiting`, html: `<p>A ${KIND_WORDS[row.kind as SpeakupKind]} (${n}) was routed to you in YukthiX.${row.retaliationWorry ? ' The reporter is worried about retaliation.' : ''}</p>` })
      .catch((e: Error) => this.logger.warn(`speak-up notice: ${e.message}`));
  }

  /** A named report from the signed-in person. */
  async fileNamed(ctx: TenantContext, dto: ReportDto) {
    const out = await this.tx(ctx, async (tx, c) => {
      if (!c.userId) throw new ForbiddenException('Sign in to report with your name.');
      const emp = await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: c.userId }, select: { id: true } });
      return this.file(tx, c, dto, { userId: c.userId, employeeId: emp?.id ?? null });
    });
    await this.tell(companyContext(ctx).organizationId, out.members, out.row);
    return this.view(out.row, out.rs);
  }

  /** An anonymous report through the no-login route: the reply code is shown once here and kept only as a hash. */
  async fileAnonymous(dto: AnonymousReportDto) {
    const org = await this.orgBySlug(dto.org);
    const c = this.system(org.id);
    const code = newReplyCode();
    const { org: _drop, alertEmail, ...report } = dto;
    void _drop;
    const out = await this.tenantPrisma.forTenant(c, async (tx) => {
      const s = await this.settings(tx, c);
      if (!anonymousAllowed(s.anonymous, dto.kind))
        throw new ForbiddenException({ statusCode: 403, code: 'SPEAKUP_ANON_OFF', message: dto.kind === 'posh' ? 'A sexual harassment complaint is made with your name: the Internal Committee must be able to hear you. Only its members see it.' : 'Your company has switched anonymous reports of this kind off. You can report with your name; it is kept confidential.' });
      const filed = await this.file(tx, c, report, { codeHash: this.hash(code) });
      if (alertEmail) await tx.speakupCase.update({ where: { id: filed.row.id }, data: { alertContactEnc: this.crypto.encrypt(alertEmail.toLowerCase()) } });
      return filed;
    }).catch(clash);
    await this.tell(org.id, out.members, out.row);
    return { ...this.view(out.row, out.rs), code: showCode(code) };
  }

  private hash = (code: string) => this.crypto.hmac('speakup-code', code);

  /** Files of a named report, by the person who filed it, while it is waiting for the team. */
  async addNamedFile(ctx: TenantContext, id: string, file: { name: string; data: Buffer } | null) {
    if (!file?.data?.length) throw new BadRequestException('Choose a file to attach.');
    return this.tx(ctx, async (tx, c) => {
      const row = await tx.speakupCase.findFirst({ where: { organizationId: c.organizationId, id, reporterUserId: c.userId ?? '00000000-0000-0000-0000-000000000000' } });
      if (!row) throw new NotFoundException('Not found.');
      return this.attach(tx, c, row, file);
    }).then((r) => this.scanAfter(companyContext(ctx).organizationId, r));
  }

  /** Starts the virus scan once the file row is committed; a failure leaves it for the hourly sweep. */
  private scanAfter<T extends { id: string }>(org: string, r: T): T {
    void this.files.scan(org, r.id).catch(() => undefined);
    return r;
  }

  private async attach(tx: Tx, c: CompanyContext, row: Case, file: { name: string; data: Buffer }) {
    if (row.fileIds.length >= MAX_FILES) throw new BadRequestException(`A report can have up to ${MAX_FILES} files.`);
    const f = await this.files.storeIn(tx, c, { area: 'speakup', name: safeName(file.name), data: file.data, allowedMime: FILE_TYPES, maxMb: FILE_MAX_MB, via: c.userId ? 'self' : 'system' });
    await tx.speakupCase.update({ where: { id: row.id }, data: { fileIds: [...row.fileIds, f.id] } });
    await audit(tx, c, 'speakup.file_added', 'speakup_case', row.id, { fileId: f.id });
    // The caller starts the scan after the commit (scanAfter): inside the transaction the scan may not see the file.
    return { id: f.id, name: f.fileName, size: f.size, scan: f.scanStatus };
  }

  // ------------------------------------------------------------------------------------------ check my report (no login)

  /** The company's name for the no-login page. */
  async company(slug: string) {
    const o = await this.orgBySlug(slug);
    return { company: o.name };
  }

  /** Wrong codes are counted per network address (a short-lived counter, never kept with any report). */
  private triesKey = (ip: string | null) => `speakup:try:${createHash('sha256').update(ip ?? 'none').digest('hex')}`;
  private async guard(ip: string | null) {
    const n = Number(await this.redis.get(this.triesKey(ip))) || 0;
    if (n >= TRIES_PER_HOUR) {
      const ttl = Math.max(1, await this.redis.ttl(this.triesKey(ip)));
      throw new HttpException({ statusCode: 429, code: 'SPEAKUP_LOCKED', message: 'Too many tries. Try again later. If you lost your code, file a follow-up report and mention the earlier one.', retryAfterSeconds: ttl, until: new Date(Date.now() + ttl * 1000).toISOString() }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
  private async wrong(ip: string | null): Promise<never> {
    const k = this.triesKey(ip);
    const n = await this.redis.incr(k);
    if (n === 1) await this.redis.expire(k, 3600);
    throw new NotFoundException({ statusCode: 404, code: 'SPEAKUP_WRONG_CODE', message: 'That code doesn’t match a report. Check each character and try again.', triesLeft: Math.max(0, TRIES_PER_HOUR - n) });
  }

  /** The report behind a code, or a counted wrong try. */
  private async byCode(slug: string, typed: string, ip: string | null) {
    await this.guard(ip);
    const org = await this.orgBySlug(slug).catch(() => null);
    const code = readCode(typed);
    if (!org || !code) return this.wrong(ip);
    const c = this.system(org.id);
    const row = await this.tenantPrisma.forTenant(c, (tx) => tx.speakupCase.findFirst({ where: { organizationId: org.id, replyCodeHash: this.hash(code) } }));
    if (!row) return this.wrong(ip);
    return { c, row };
  }

  private async reporterView(tx: Tx, row: Case) {
    const msgs = await tx.speakupMessage.findMany({ where: { organizationId: row.organizationId, caseId: row.id }, orderBy: { sentAt: 'asc' } });
    return {
      number: caseNumber(row.kind as SpeakupKind, row.number),
      kind: row.kind,
      status: row.status,
      filedAt: row.filedAt.toISOString(),
      team: TEAM_WORDS[row.routedTo as SpeakupTeam],
      // Case officers stay unnamed to the reporter ("Case team").
      messages: msgs.map((m) => ({ id: m.id, from: m.sender, at: m.sentAt.toISOString(), text: m.body })),
    };
  }

  async check(slug: string, code: string, ip: string | null) {
    const { c, row } = await this.byCode(slug, code, ip);
    return this.tenantPrisma.forTenant(c, async (tx) => {
      await audit(tx, c, 'speakup.checked_by_reporter', 'speakup_case', row.id, {});
      return this.reporterView(tx, row);
    });
  }

  async reply(slug: string, code: string, body: string, ip: string | null) {
    const { c, row } = await this.byCode(slug, code, ip);
    if (row.status === 'closed') throw new ConflictException('This report is closed. File a follow-up report and mention its number.');
    const out = await this.tenantPrisma.forTenant(c, async (tx) => {
      await tx.speakupMessage.create({ data: { organizationId: row.organizationId, caseId: row.id, sender: 'reporter', body } });
      await audit(tx, c, 'speakup.reporter_replied', 'speakup_case', row.id, {});
      return { view: await this.reporterView(tx, row), members: (await tx.speakupCaseMember.findMany({ where: { caseId: row.id }, select: { userId: true } })).map((m) => m.userId) };
    });
    await this.notifications.notifySystem({ organizationId: row.organizationId, isSuperAdmin: false }, out.members, 'helpdesk.speakup.received', { entityType: 'speakup_case', entityId: row.id, contextText: `The reporter replied on ${caseNumber(row.kind as SpeakupKind, row.number)}`, linkPath: '/yx/desk/speakup' }, { subject: 'A speak-up reporter replied', html: '<p>The reporter replied on a speak-up report routed to you in YukthiX.</p>' }).catch(() => undefined);
    return out.view;
  }

  async addAnonymousFile(slug: string, code: string, file: { name: string; data: Buffer } | null, ip: string | null) {
    if (!file?.data?.length) throw new BadRequestException('Choose a file to attach.');
    const { c, row } = await this.byCode(slug, code, ip);
    return this.tenantPrisma.forTenant(c, (tx) => this.attach(tx, c, row, file)).then((r) => this.scanAfter(c.organizationId, r));
  }

  // ------------------------------------------------------------------------------------------ the case officers (minimum for HLP-07/08/09)

  /** Cases routed to the signed-in officer (the case screens come with HLP-08). */
  async myCases(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      const mine = await tx.speakupCaseMember.findMany({ where: { organizationId: c.organizationId, userId: c.userId ?? '' }, select: { caseId: true } });
      const rows = await tx.speakupCase.findMany({ where: { organizationId: c.organizationId, id: { in: mine.map((m) => m.caseId) } }, orderBy: { filedAt: 'desc' } });
      return rows.map((r) => ({ id: r.id, number: caseNumber(r.kind as SpeakupKind, r.number), kind: r.kind, identity: r.identity, category: r.category, status: r.status, filedAt: r.filedAt.toISOString(), ackDueOn: iso(r.ackDueOn), decideDueOn: iso(r.decideDueOn), retaliationWorry: r.retaliationWorry, late: r.late }));
    });
  }

  private async memberCase(tx: Tx, c: CompanyContext, id: string) {
    const row = await tx.speakupCase.findFirst({ where: { organizationId: c.organizationId, id } });
    const member = row && c.userId && (await tx.speakupCaseMember.findFirst({ where: { caseId: row.id, userId: c.userId }, select: { id: true } }));
    // Not a member is the same as not there (APX-D §6.3), for HR, managers and admins alike.
    if (!row || !member) throw new NotFoundException('Not found.');
    return row;
  }

  /** One case for an officer routed to it. The named reporter shows here only; every look is audited. */
  async caseDetail(ctx: TenantContext, id: string) {
    return this.tx(ctx, async (tx, c) => {
      const row = await this.memberCase(tx, c, id);
      const reporter = row.reporterUserId ? await tx.user.findFirst({ where: { organizationId: c.organizationId, id: row.reporterUserId }, select: { name: true, email: true } }) : null;
      await audit(tx, c, 'speakup.case_viewed', 'speakup_case', row.id, { identityShown: Boolean(reporter) });
      const msgs = await tx.speakupMessage.findMany({ where: { organizationId: c.organizationId, caseId: row.id }, orderBy: { sentAt: 'asc' } });
      const authors = await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: msgs.map((m) => m.authorUserId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } });
      return {
        id: row.id,
        number: caseNumber(row.kind as SpeakupKind, row.number),
        kind: row.kind,
        identity: row.identity,
        reporter: reporter ? { name: reporter.name ?? reporter.email, email: reporter.email } : null,
        category: row.category,
        summary: row.summary,
        happenedOn: iso(row.happenedOn),
        locationId: row.locationId,
        involved: row.involved,
        outside: row.outsideName ? { name: row.outsideName, employer: row.outsideEmployer } : null,
        witnesses: row.witnesses,
        retaliationWorry: row.retaliationWorry,
        routedTo: row.routedTo,
        status: row.status,
        late: row.late,
        files: row.fileIds,
        filedAt: row.filedAt.toISOString(),
        ackDueOn: iso(row.ackDueOn),
        decideDueOn: iso(row.decideDueOn),
        ruleSet: row.ruleSet,
        messages: msgs.map((m) => ({ id: m.id, from: m.sender, who: m.sender === 'team' ? (authors.find((a) => a.id === m.authorUserId)?.name ?? 'Case team') : row.identity === 'anonymous' ? 'Anonymous reporter' : 'Reporter', at: m.sentAt.toISOString(), text: m.body })),
      };
    });
  }

  /** A message from the case team to the reporter (anonymous reporters read it with their code). */
  async teamReply(ctx: TenantContext, id: string, body: string) {
    return this.tx(ctx, async (tx, c) => {
      const row = await this.memberCase(tx, c, id);
      if (row.status === 'closed') throw new ConflictException('This report is closed.');
      const m = await tx.speakupMessage.create({ data: { organizationId: c.organizationId, caseId: row.id, sender: 'team', authorUserId: c.userId!, body } });
      await audit(tx, c, 'speakup.team_replied', 'speakup_case', row.id, { messageId: m.id });
      return { id: m.id, at: m.sentAt.toISOString(), alert: row.alertContactEnc };
    }).then(async ({ alert, ...out }) => {
      await this.alertReporter(alert);
      return out;
    });
  }

  /**
   * HLP-06 decision 1: an anonymous reporter who left an address hears only "You have an update" (no case, no company
   * detail, no link that names the case). Best effort: a failure is logged, never shown to the case team.
   */
  async alertReporter(alertContactEnc: string | null) {
    if (!alertContactEnc) return;
    try {
      const to = this.crypto.decrypt(alertContactEnc);
      await this.email.send({ to, subject: 'You have an update', text: 'You have an update. Open “Check my report” and enter your reply code to read it.', html: '<p>You have an update. Open “Check my report” and enter your reply code to read it.</p>' });
    } catch (e) {
      this.logger.warn(`speak-up alert not sent: ${(e as Error).message}`);
    }
  }

  // ------------------------------------------------------------------------------------------ set-up (speakup.setup.manage)

  /**
   * Batch F item 13 (answer 2578): the Internal Committee as its own members see it (CMP-09 console): who sits on it and
   * in what role. Anyone not on the committee gets "not found". The complaints come from the case list (case members).
   */
  /** CMP-11 (batch F item 13; answers 2591, 2592): the committees this person sits on, for their members only. */
  async icCommittee(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const all = await tx.speakupTeamMember.findMany({ where: { organizationId: org, team: 'ic', removedAt: null }, orderBy: { addedAt: 'asc' } });
      const mine = new Set(all.filter((r) => r.userId === c.userId).map((r) => r.locationId));
      if (!c.userId || !mine.size) throw new NotFoundException('Not found');
      const rows = all.filter((r) => mine.has(r.locationId));
      const users = await tx.user.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true, email: true } });
      const places = await tx.location.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.locationId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } });
      const org0 = await tx.organization.findFirst({ where: { id: org }, select: { name: true } });
      // Answer 2593: the awareness log (this year and last) and this year's annual report, per committee.
      const today = todayIst();
      const year = Number(today.slice(0, 4));
      const committees = [...mine];
      const awareness = await tx.poshAwarenessSession.findMany({ where: { organizationId: org, committeeLocationId: { in: committees.filter((x): x is string => Boolean(x)) } }, orderBy: { heldOn: 'desc' }, take: 500 });
      const companyLog = mine.has(null) ? await tx.poshAwarenessSession.findMany({ where: { organizationId: org, committeeLocationId: null }, orderBy: { heldOn: 'desc' }, take: 500 }) : [];
      const log = [...awareness, ...companyLog].filter((a) => a.heldOn.toISOString().slice(0, 4) >= String(year - 1)).sort((a, b) => b.heldOn.getTime() - a.heldOn.getTime());
      const nameOf = (id: string | null) => (id ? (places.find((p) => p.id === id)?.name ?? 'A workplace') : 'Whole company');
      const reports = [];
      for (const cid of committees) {
        const cases = await tx.speakupCase.findMany({ where: { organizationId: org, kind: 'posh', icLocationId: cid, filedAt: { gte: new Date(`${year}-01-01T00:00:00+05:30`), lt: new Date(`${year + 1}-01-01T00:00:00+05:30`) } }, select: { status: true, filedAt: true } });
        const row = await tx.poshAnnualReport.findFirst({ where: { organizationId: org, year, committeeLocationId: cid } });
        reports.push({
          committeeId: cid,
          committee: nameOf(cid),
          year,
          dueOn: `${year + 1}-01-31`,
          received: cases.length,
          disposed: cases.filter((x) => x.status === 'closed').length,
          pendingOver90: cases.filter((x) => x.status !== 'closed' && addDays(isoDay(x.filedAt)!, 90) < today).length,
          sessions: log.filter((a) => a.committeeLocationId === cid && a.heldOn.toISOString().slice(0, 4) === String(year)).length,
          // Answer 2624: completions of courses marked as POSH awareness this year, by people at the committee's workplace.
          trainings: await this.poshTrainings(tx, c, year, cid),
          actionTaken: row?.actionTaken ?? null,
          stage: (row?.stage ?? 'draft') as 'draft' | 'reviewed' | 'employer' | 'district',
          presiding: all.some((r) => r.locationId === cid && r.role === 'presiding' && r.userId === c.userId),
        });
      }
      return {
        company: org0?.name ?? '',
        awareness: log.map((a) => ({ id: a.id, committeeId: a.committeeLocationId, heldOn: a.heldOn.toISOString().slice(0, 10), title: a.title, audience: a.audience, attended: a.attended })),
        reports,
        members: rows.map((r) => {
          const u = users.find((x) => x.id === r.userId);
          return { id: r.id, name: u?.name ?? u?.email ?? 'Former user', role: r.role as 'presiding' | 'member' | 'external', since: isoDay(r.addedAt), woman: r.woman, termEndsOn: r.termEndsOn ? r.termEndsOn.toISOString().slice(0, 10) : null, committeeId: r.locationId, committee: r.locationId ? (places.find((p) => p.id === r.locationId)?.name ?? 'A workplace') : 'Whole company' };
        }),
      };
    });
  }

  /** Answer 2624: POSH awareness course completions in a calendar year, for one workplace (null: the whole company). */
  private async poshTrainings(tx: Tx, c: CompanyContext, year: number, locationId: string | null) {
    const done = await tx.learningEnrolment.findMany({
      where: { organizationId: c.organizationId, status: 'completed', completedAt: { gte: new Date(`${year}-01-01T00:00:00+05:30`), lt: new Date(`${year + 1}-01-01T00:00:00+05:30`) }, courseId: { in: (await tx.learningCourse.findMany({ where: { organizationId: c.organizationId, poshAwareness: true }, select: { id: true } })).map((x) => x.id) } },
      select: { employeeId: true },
    });
    if (!locationId) return done.length;
    const at = new Set((await jobsToday(tx, c, todayIst(), done.map((d) => d.employeeId))).filter((j) => j.locationId === locationId).map((j) => j.employeeId));
    return done.filter((d) => at.has(d.employeeId)).length;
  }

  /**
   * Answer 2620: HR's view of the Internal Committees (CMP-09): this year's counts per committee only, never a case, a
   * name or a member; a committee with fewer than 5 complaints shows no counts at all, so no one can be singled out.
   */
  async icCounts(ctx: TenantContext, user: ScopeUser) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['learning.report.view']);
    // The counts are the whole company's committees, so a grant for part of it confers nothing here.
    if (!tenantWide(v, 'learning.report.view') || v.actingForOther) throw new ForbiddenException('The committee counts need training reports for the whole company.');
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const year = Number(todayIst().slice(0, 4));
      const today = todayIst();
      const committees = [...new Set((await tx.speakupTeamMember.findMany({ where: { organizationId: org, team: 'ic', removedAt: null }, select: { locationId: true } })).map((r) => r.locationId))];
      const places = await tx.location.findMany({ where: { organizationId: org, id: { in: committees.filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } });
      const out = [];
      for (const cid of committees) {
        const cases = await tx.speakupCase.findMany({ where: { organizationId: org, kind: 'posh', icLocationId: cid, filedAt: { gte: new Date(`${year}-01-01T00:00:00+05:30`), lt: new Date(`${year + 1}-01-01T00:00:00+05:30`) } }, select: { status: true, filedAt: true } });
        const shown = cases.length >= 5;
        out.push({
          committee: cid ? (places.find((p) => p.id === cid)?.name ?? 'A workplace') : 'Whole company',
          year,
          shown,
          received: shown ? cases.length : null,
          disposed: shown ? cases.filter((x) => x.status === 'closed').length : null,
          pendingOver90: shown ? cases.filter((x) => x.status !== 'closed' && addDays(isoDay(x.filedAt)!, 90) < today).length : null,
          sessions: await tx.poshAwarenessSession.count({ where: { organizationId: org, committeeLocationId: cid, heldOn: { gte: new Date(`${year}-01-01T00:00:00Z`), lt: new Date(`${year + 1}-01-01T00:00:00Z`) } } }),
          trainings: await this.poshTrainings(tx, c, year, cid),
        });
      }
      await audit(tx, c, 'posh.counts_viewed', 'organization', org, { committees: out.length });
      return { minimum: 5, committees: out.sort((a, b) => a.committee.localeCompare(b.committee)) };
    });
  }

  /** Answer 2593: a member logs an awareness session for a committee they sit on (others: 404). */
  async logAwareness(ctx: TenantContext, dto: AwarenessSessionDto) {
    return this.tx(ctx, async (tx, c) => {
      const cid = dto.committeeId ?? null;
      if (!(await this.onCommittee(tx, c, cid))) throw new NotFoundException('Not found');
      const heldOn = dto.heldOn.slice(0, 10);
      if (heldOn > todayIst()) throw new BadRequestException('The session date can’t be in the future.');
      const a = await tx.poshAwarenessSession.create({ data: { organizationId: c.organizationId, committeeLocationId: cid, heldOn: day(heldOn), title: dto.title, audience: dto.audience || null, attended: dto.attended, createdBy: c.userId! } });
      await audit(tx, c, 'posh.awareness_logged', 'posh_awareness_session', a.id, { committeeId: cid, heldOn, attended: dto.attended });
      return { id: a.id };
    });
  }

  /** Answer 2593: the presiding officer moves this committee's annual report on, one step at a time. */
  async annualReportStep(ctx: TenantContext, dto: AnnualReportStepDto) {
    return this.tx(ctx, async (tx, c) => {
      const cid = dto.committeeId ?? null;
      if (!(await this.onCommittee(tx, c, cid))) throw new NotFoundException('Not found');
      const presiding = await tx.speakupTeamMember.findFirst({ where: { organizationId: c.organizationId, team: 'ic', role: 'presiding', removedAt: null, userId: c.userId!, locationId: cid }, select: { id: true } });
      if (!presiding) throw new ForbiddenException({ statusCode: 403, code: 'POSH_NOT_PRESIDING', message: 'Only the presiding officer moves the annual report on.' });
      const year = Number(todayIst().slice(0, 4));
      if (dto.year > year || dto.year < year - 1) throw new BadRequestException('Only this year’s or last year’s report can be moved on.');
      const row = (await tx.poshAnnualReport.findFirst({ where: { organizationId: c.organizationId, year: dto.year, committeeLocationId: cid } })) ?? (await tx.poshAnnualReport.create({ data: { organizationId: c.organizationId, year: dto.year, committeeLocationId: cid } }));
      const before = { reviewed: 'draft', employer: 'reviewed', district: 'employer' }[dto.step];
      if (row.stage !== before) throw new ConflictException({ statusCode: 409, code: 'POSH_REPORT_STEP', message: 'The report is not at that step. Refresh and try again.' });
      if (dto.step === 'reviewed' && !dto.actionTaken?.trim()) throw new BadRequestException('Write the action taken in the year (or “None”).');
      const now = new Date();
      await tx.poshAnnualReport.update({
        where: { id: row.id },
        data: {
          stage: dto.step,
          updatedAt: now,
          ...(dto.step === 'reviewed' ? { actionTaken: dto.actionTaken!.trim(), reviewedBy: c.userId, reviewedAt: now } : dto.step === 'employer' ? { employerBy: c.userId, employerAt: now } : { districtBy: c.userId, districtAt: now }),
        },
      });
      await audit(tx, c, 'posh.annual_report_step', 'posh_annual_report', row.id, { committeeId: cid, year: dto.year, step: dto.step });
      return { stage: dto.step };
    });
  }

  /**
   * Answer 2621: the committee's annual report for a year as a PDF (members of that committee only; others "not found").
   * The same counts as the console: complaints received, disposed of, pending over 90 days, awareness sessions, POSH
   * course completions and the action taken. Every download is audited.
   */
  async annualReportPdf(ctx: TenantContext, committeeId: string | null, year: number) {
    const data = await this.tx(ctx, async (tx, c) => {
      if (!(await this.onCommittee(tx, c, committeeId))) throw new NotFoundException('Not found');
      const today = todayIst();
      if (year > Number(today.slice(0, 4))) throw new BadRequestException('Choose this year or an earlier one.');
      const org = c.organizationId;
      const range = { gte: new Date(`${year}-01-01T00:00:00+05:30`), lt: new Date(`${year + 1}-01-01T00:00:00+05:30`) };
      const cases = await tx.speakupCase.findMany({ where: { organizationId: org, kind: 'posh', icLocationId: committeeId, filedAt: range }, select: { status: true, filedAt: true } });
      const sessions = await tx.poshAwarenessSession.count({ where: { organizationId: org, committeeLocationId: committeeId, heldOn: { gte: new Date(`${year}-01-01T00:00:00Z`), lte: new Date(`${year}-12-31T00:00:00Z`) } } });
      const row = await tx.poshAnnualReport.findFirst({ where: { organizationId: org, year, committeeLocationId: committeeId } });
      const members = await tx.speakupTeamMember.findMany({ where: { organizationId: org, team: 'ic', removedAt: null, locationId: committeeId }, orderBy: { addedAt: 'asc' } });
      const users = await tx.user.findMany({ where: { organizationId: org, id: { in: members.map((m) => m.userId) } }, select: { id: true, name: true, email: true } });
      const place = committeeId ? await tx.location.findFirst({ where: { organizationId: org, id: committeeId }, select: { name: true } }) : null;
      const company = (await tx.organization.findFirst({ where: { id: org }, select: { name: true } }))?.name ?? '';
      // The end of the year (or today) decides what is pending over 90 days.
      const asOf = `${year}-12-31` < today ? `${year}-12-31` : today;
      await audit(tx, c, 'posh.annual_report_downloaded', 'posh_annual_report', row?.id ?? org, { committeeId, year });
      return {
        company,
        committee: committeeId ? (place?.name ?? 'A workplace') : 'Whole company',
        year,
        received: cases.length,
        disposed: cases.filter((x) => x.status === 'closed').length,
        pendingOver90: cases.filter((x) => x.status !== 'closed' && addDays(isoDay(x.filedAt)!, 90) < asOf).length,
        sessions,
        trainings: await this.poshTrainings(tx, c, year, committeeId),
        actionTaken: row?.actionTaken ?? null,
        stage: (row?.stage ?? 'draft') as 'draft' | 'reviewed' | 'employer' | 'district',
        members: members.map((m) => {
          const u = users.find((x) => x.id === m.userId);
          return { name: u?.name ?? u?.email ?? 'Former user', role: m.role as 'presiding' | 'member' | 'external', woman: Boolean(m.woman) };
        }),
        preparedOn: today,
      };
    });
    const label = data.committee.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return { pdf: await poshAnnualReportPdf(data), name: `ic-annual-report-${year}-${label || 'company'}.pdf` };
  }

  private async onCommittee(tx: Tx, c: CompanyContext, cid: string | null) {
    return Boolean(c.userId && (await tx.speakupTeamMember.findFirst({ where: { organizationId: c.organizationId, team: 'ic', removedAt: null, userId: c.userId, locationId: cid }, select: { id: true } })));
  }

  async setup(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.speakupTeamMember.findMany({ where: { organizationId: org, removedAt: null }, orderBy: { addedAt: 'asc' } });
      const users = await tx.user.findMany({ where: { organizationId: org, status: 'active' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 1000 });
      const name = (id: string) => users.find((u) => u.id === id)?.name ?? users.find((u) => u.id === id)?.email ?? 'Former user';
      const s = await this.settings(tx, c);
      return {
        members: rows.map((r) => ({ id: r.id, team: r.team, userId: r.userId, name: name(r.userId), role: r.role, addedAt: r.addedAt.toISOString(), woman: r.woman, termEndsOn: r.termEndsOn ? r.termEndsOn.toISOString().slice(0, 10) : null, locationId: r.locationId })),
        locations: await tx.location.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        users: users.map((u) => ({ id: u.id, name: u.name ?? u.email, email: u.email })),
        settings: { anonymous: s.anonymous, ackDays: s.ackDays, grievance: s.grievance, whistleblower: s.ethics },
      };
    });
  }

  async addMember(ctx: TenantContext, dto: TeamMemberDto) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.user.findFirst({ where: { organizationId: org, id: dto.userId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an active person of this company.');
      if (dto.locationId && dto.team !== 'ic') throw new BadRequestException('Only the Internal Committee can be set up per workplace.');
      if (dto.locationId && !(await tx.location.findFirst({ where: { organizationId: org, id: dto.locationId, archivedAt: null }, select: { id: true } }))) throw new BadRequestException('Choose one of the company’s workplaces.');
      const committee = dto.team === 'ic' ? (dto.locationId ?? null) : null;
      if (await tx.speakupTeamMember.findFirst({ where: { organizationId: org, team: dto.team, userId: dto.userId, removedAt: null, locationId: committee }, select: { id: true } })) throw new ConflictException(dto.team === 'ic' ? 'This person is already on that committee.' : 'This person is already on that list.');
      // The IC has a presiding officer and an external member; the IR team may have an outside lawyer (HLP-13 decision 1).
      const role = dto.team === 'ic' ? (dto.role ?? 'member') : dto.team === 'ir' && dto.role === 'external' ? 'external' : 'member';
      // Answer 2591: the committee list records who is a woman and when each term ends (the POSH Act checks).
      if (dto.team === 'ic') {
        if (dto.woman === undefined) throw new BadRequestException('Say whether this member is a woman.');
        if (!dto.termEndsOn) throw new BadRequestException('Choose the day their term ends.');
        const today = todayIst();
        if (dto.termEndsOn.slice(0, 10) <= today) throw new BadRequestException('The term must end after today.');
        if (dto.termEndsOn.slice(0, 10) > addDays(today, 3 * 365 + 1)) throw new BadRequestException('A term is at most 3 years.');
        if (role === 'presiding' && !dto.woman) throw new BadRequestException('The presiding officer must be a senior woman employee.');
      } else if (dto.woman !== undefined || dto.termEndsOn) throw new BadRequestException('Woman and term end are asked only for the Internal Committee.');
      if (role === 'presiding' && (await tx.speakupTeamMember.findFirst({ where: { organizationId: org, team: 'ic', role: 'presiding', removedAt: null, locationId: committee }, select: { id: true } }))) throw new ConflictException('This committee already has a presiding officer. Remove them first.');
      const ic = dto.team === 'ic' ? { woman: dto.woman!, termEndsOn: day(dto.termEndsOn!.slice(0, 10)), locationId: committee } : {};
      const m = await tx.speakupTeamMember.create({ data: { organizationId: org, team: dto.team, userId: dto.userId, role, addedBy: c.userId ?? null, ...ic } });
      await audit(tx, c, 'speakup.team_member_added', 'speakup_team_member', m.id, { team: dto.team, userId: dto.userId, role, ...(dto.team === 'ic' ? { woman: dto.woman, termEndsOn: dto.termEndsOn!.slice(0, 10), locationId: committee } : {}) });
      return { id: m.id };
    });
  }

  /** Answer 2625: change a member with the same checks as adding; audited with what changed. */
  async editMember(ctx: TenantContext, id: string, dto: EditMemberDto) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const m = await tx.speakupTeamMember.findFirst({ where: { organizationId: org, id, removedAt: null } });
      if (!m) throw new NotFoundException('Not found.');
      if (m.team !== 'ic' && m.team !== 'ir') throw new BadRequestException('There is nothing to change on this list; remove and add instead.');
      if (m.team === 'ir') {
        if (dto.woman !== undefined || dto.termEndsOn) throw new BadRequestException('Woman and term end are asked only for the Internal Committee.');
        if (dto.role === 'presiding') throw new BadRequestException('The industrial relations team has company members and outside lawyers.');
      }
      const role = dto.role ?? (m.role as 'member' | 'presiding' | 'external');
      const before = { role: m.role, woman: m.woman, termEndsOn: m.termEndsOn ? isoDay(m.termEndsOn) : null };
      let after: Record<string, unknown> = { role };
      if (m.team === 'ic') {
        const woman = dto.woman ?? m.woman;
        const term = dto.termEndsOn?.slice(0, 10) ?? before.termEndsOn;
        if (woman == null) throw new BadRequestException('Say whether this member is a woman.');
        if (!term) throw new BadRequestException('Choose the day their term ends.');
        if (dto.termEndsOn) {
          const today = todayIst();
          if (term <= today) throw new BadRequestException('The term must end after today.');
          if (term > addDays(today, 3 * 365 + 1)) throw new BadRequestException('A term is at most 3 years.');
        }
        if (role === 'presiding' && !woman) throw new BadRequestException('The presiding officer must be a senior woman employee.');
        if (role === 'presiding' && m.role !== 'presiding' && (await tx.speakupTeamMember.findFirst({ where: { organizationId: org, team: 'ic', role: 'presiding', removedAt: null, locationId: m.locationId, id: { not: m.id } }, select: { id: true } }))) throw new ConflictException('This committee already has a presiding officer. Change them first.');
        after = { role, woman, termEndsOn: term };
      }
      const termChanged = m.team === 'ic' && after.termEndsOn !== before.termEndsOn;
      await tx.speakupTeamMember.update({ where: { id: m.id }, data: { role, ...(m.team === 'ic' ? { woman: after.woman as boolean, termEndsOn: day(after.termEndsOn as string) } : {}), ...(termChanged ? { termRemindedAt: null } : {}) } });
      await audit(tx, c, 'speakup.team_member_edited', 'speakup_team_member', m.id, { team: m.team, userId: m.userId, before, after });
      return { id: m.id };
    });
  }

  /** Answer 2623: daily, the System Admins hear once about each committee term ending within 30 days. */
  async remindIcTerms(): Promise<number> {
    const today = todayIst();
    const due = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.speakupTeamMember.findMany({ where: { team: 'ic', removedAt: null, termRemindedAt: null, termEndsOn: { gte: day(today), lte: day(addDays(today, 30)) } }, take: 500 }),
    );
    let sent = 0;
    for (const org of [...new Set(due.map((d) => d.organizationId))]) {
      try {
        const out = await this.tenantPrisma.forTenant(this.system(org), async (tx) => {
          const rows = due.filter((d) => d.organizationId === org);
          const people = await tx.user.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true, email: true } });
          const places = await tx.location.findMany({ where: { organizationId: org, id: { in: rows.flatMap((r) => (r.locationId ? [r.locationId] : [])) } }, select: { id: true, name: true } });
          const admins = (await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active' }, select: { id: true } })).map((u) => u.id);
          await tx.speakupTeamMember.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { termRemindedAt: new Date() } });
          return {
            admins,
            texts: rows.map((r) => {
              const u = people.find((p) => p.id === r.userId);
              const place = r.locationId ? (places.find((p) => p.id === r.locationId)?.name ?? 'a workplace') : 'the whole company';
              return { id: r.id, text: `${u?.name ?? u?.email ?? 'A member'}'s term on the Internal Committee (${place}) ends on ${isoDay(r.termEndsOn!)}. Extend the term or add a replacement.` };
            }),
          };
        });
        for (const t of out.texts) {
          await this.notifications.notifySystem({ organizationId: org, isSuperAdmin: false }, out.admins, 'helpdesk.ic.term_ending', { entityType: 'speakup_team_member', entityId: t.id, contextText: t.text, linkPath: '/yx/desk/speakup-setup' }, { subject: 'An Internal Committee term ends soon', html: `<p>${t.text}</p>` }).catch((e: Error) => this.logger.warn(`IC term notice: ${e.message}`));
          sent++;
        }
      } catch (e) {
        this.logger.error(`IC term reminders for ${org} failed: ${(e as Error).message}`);
      }
    }
    return sent;
  }

  /** Removing someone from a list stops new reports reaching them; cases already routed to them stay theirs (HLP-08 moves them). */
  async removeMember(ctx: TenantContext, id: string) {
    return this.tx(ctx, async (tx, c) => {
      const m = await tx.speakupTeamMember.findFirst({ where: { organizationId: c.organizationId, id, removedAt: null } });
      if (!m) throw new NotFoundException('Not found.');
      await tx.speakupTeamMember.update({ where: { id: m.id }, data: { removedAt: new Date(), removedBy: c.userId ?? null } });
      await audit(tx, c, 'speakup.team_member_removed', 'speakup_team_member', m.id, { team: m.team, userId: m.userId });
      return { removed: true };
    });
  }
}
