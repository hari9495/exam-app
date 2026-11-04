import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { OrgSecretsCryptoService, TenantContext, TenantPrismaService, isOrganizationActive } from '@exam-platform/shared';
import { REDIS_CONNECTION } from '../jobs/redis-connection';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FilesService } from '../documents/files.service';
import { CompanyContext, Tx, audit, companyContext } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { safeName } from '../service-desk/attachments.service';
import { SPEAKUP_TEAMS, type AnonymousReportDto, type ReportDto, type SpeakupKind, type SpeakupTeam, type TeamMemberDto } from './dto';
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
    const teams = await this.teams(tx, org);
    if (dto.aboutUserId && !Object.values(teams).some((t) => t.includes(dto.aboutUserId!))) throw new BadRequestException('Choose one of the case officers in the list.');
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
    });
  }

  private async attach(tx: Tx, c: CompanyContext, row: Case, file: { name: string; data: Buffer }) {
    if (row.fileIds.length >= MAX_FILES) throw new BadRequestException(`A report can have up to ${MAX_FILES} files.`);
    const f = await this.files.storeIn(tx, c, { area: 'speakup', name: safeName(file.name), data: file.data, allowedMime: FILE_TYPES, maxMb: FILE_MAX_MB, via: c.userId ? 'self' : 'system' });
    await tx.speakupCase.update({ where: { id: row.id }, data: { fileIds: [...row.fileIds, f.id] } });
    await audit(tx, c, 'speakup.file_added', 'speakup_case', row.id, { fileId: f.id });
    void this.files.scan(c.organizationId, f.id).catch(() => undefined);
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
    return this.tenantPrisma.forTenant(c, (tx) => this.attach(tx, c, row, file));
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

  async setup(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.speakupTeamMember.findMany({ where: { organizationId: org, removedAt: null }, orderBy: { addedAt: 'asc' } });
      const users = await tx.user.findMany({ where: { organizationId: org, status: 'active' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 1000 });
      const name = (id: string) => users.find((u) => u.id === id)?.name ?? users.find((u) => u.id === id)?.email ?? 'Former user';
      const s = await this.settings(tx, c);
      return {
        members: rows.map((r) => ({ id: r.id, team: r.team, userId: r.userId, name: name(r.userId), role: r.role, addedAt: r.addedAt.toISOString() })),
        users: users.map((u) => ({ id: u.id, name: u.name ?? u.email, email: u.email })),
        settings: { anonymous: s.anonymous, ackDays: s.ackDays, grievance: s.grievance, whistleblower: s.ethics },
      };
    });
  }

  async addMember(ctx: TenantContext, dto: TeamMemberDto) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.user.findFirst({ where: { organizationId: org, id: dto.userId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an active person of this company.');
      if (await tx.speakupTeamMember.findFirst({ where: { organizationId: org, team: dto.team, userId: dto.userId, removedAt: null }, select: { id: true } })) throw new ConflictException('This person is already on that list.');
      // The IC has a presiding officer and an external member; the IR team may have an outside lawyer (HLP-13 decision 1).
      const role = dto.team === 'ic' ? (dto.role ?? 'member') : dto.team === 'ir' && dto.role === 'external' ? 'external' : 'member';
      if (role === 'presiding' && (await tx.speakupTeamMember.findFirst({ where: { organizationId: org, team: 'ic', role: 'presiding', removedAt: null }, select: { id: true } }))) throw new ConflictException('The Internal Committee already has a presiding officer. Remove them first.');
      const m = await tx.speakupTeamMember.create({ data: { organizationId: org, team: dto.team, userId: dto.userId, role, addedBy: c.userId ?? null } });
      await audit(tx, c, 'speakup.team_member_added', 'speakup_team_member', m.id, { team: dto.team, userId: dto.userId, role });
      return { id: m.id };
    });
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
