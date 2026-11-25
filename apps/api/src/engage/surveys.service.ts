import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, buildViewer, tenantWide } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { AnnouncementsService } from './announcements.service';
import { ActionPlanDto, AnswersDto, SurveyDto, type SurveyQuestionDto } from './dto';
import { enpsOf, favourable, STARTER_QUESTIONS, type QuestionKind } from './engage-rules';
import { addMonths } from '../learning/learning-rules';

// Batch G2 item 74 (M09 Q3, Q8; ENG-04 to ENG-07; answer 2604). engage.survey.manage builds, launches and closes
// surveys and sees company results; a manager sees their own team's results and keeps an action plan. Engagement, pulse
// and eNPS surveys are anonymous: a response never holds who answered; results show only for groups of the survey's
// smallest group or more (a company setting, 3 to 10, default 5). Onboarding and exit surveys may be named.

const ANY_ENTITY = { legalEntityId: '00000000-0000-0000-0000-000000000000' };
type Q = { id: string; text: string; kind: QuestionKind; options?: string[]; theme?: string };
type Survey = Prisma.EngSurveyGetPayload<object>;

const statusOf = (s: Survey, today: string) => (!s.launchedAt ? 'draft' : s.closedAt || s.closesOn.toISOString().slice(0, 10) < today ? 'closed' : s.opensOn.toISOString().slice(0, 10) > today ? 'scheduled' : 'open');

@Injectable()
export class SurveysService {
  private readonly logger = new Logger(SurveysService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly announcements: AnnouncementsService,
  ) {}

  async companyWide(user: ScopeUser) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['engage.survey.manage']);
    return tenantWide(v, 'engage.survey.manage');
  }

  private async survey(tx: Tx, org: string, id: string) {
    const s = await tx.engSurvey.findFirst({ where: { organizationId: org, id } });
    if (!s) throw new NotFoundException('No such survey.');
    return s;
  }

  private check(dto: SurveyDto) {
    if (!dto.anonymous && !['onboarding', 'exit'].includes(dto.type)) throw new BadRequestException('Engagement, pulse and eNPS surveys are anonymous; only onboarding and exit surveys may be named.');
    if (dto.closesOn < dto.opensOn) throw new BadRequestException('The survey must close on or after the day it opens.');
    if (dto.autoInvite && !['onboarding', 'exit'].includes(dto.type)) throw new BadRequestException('Only onboarding and exit surveys invite people automatically.');
    if (dto.autoInvite && dto.repeat && dto.repeat !== 'none') throw new BadRequestException('An automatic survey does not repeat; it stays open and invites people as they reach the event.');
    const ids = new Set<string>();
    for (const q of dto.questions) {
      if (ids.has(q.id)) throw new BadRequestException('Each question needs its own id.');
      ids.add(q.id);
      const choice = q.kind === 'single' || q.kind === 'multiple';
      if (choice && (!q.options || q.options.filter((o) => o.trim()).length < 2)) throw new BadRequestException(`Question “${q.text}” needs at least 2 options.`);
      if (!choice && q.options?.length) throw new BadRequestException(`Question “${q.text}” takes no options.`);
    }
  }

  /** The builder's choices: starter questions per type, the company's smallest group, locations and departments. */
  options(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => ({
      starters: STARTER_QUESTIONS,
      minGroup: Number(await settingFor(tx, c, 'engage.survey.min_group', ANY_ENTITY)) || 5,
      locations: await tx.location.findMany({ where: { organizationId: c.organizationId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      departments: await tx.department.findMany({ where: { organizationId: c.organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    }));
  }

  list(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const today = todayIst();
      const rows = await tx.engSurvey.findMany({ where: { organizationId: c.organizationId }, orderBy: { createdAt: 'desc' }, take: 200 });
      const out = [];
      for (const s of rows) {
        const invited = await tx.engSurveyInvite.count({ where: { surveyId: s.id } });
        const responded = await tx.engSurveyResponse.count({ where: { surveyId: s.id } });
        out.push({ id: s.id, name: s.name, type: s.type, anonymous: s.anonymous, audience: s.locationIds.length + s.departmentIds.length ? `${s.locationIds.length} locations, ${s.departmentIds.length} departments` : 'Everyone', status: statusOf(s, today), invited, responded, opensOn: s.opensOn.toISOString().slice(0, 10), closesOn: s.closesOn.toISOString().slice(0, 10) });
      }
      return out;
    });
  }

  detail(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.survey(tx, c.organizationId, id);
      return { id: s.id, name: s.name, type: s.type, anonymous: s.anonymous, minGroup: s.minGroup, questions: s.questions as Q[], locationIds: s.locationIds, departmentIds: s.departmentIds, opensOn: s.opensOn.toISOString().slice(0, 10), closesOn: s.closesOn.toISOString().slice(0, 10), remind: s.remind, repeat: s.repeat, autoInvite: s.autoInvite, autoAfterDays: s.autoAfterDays, status: statusOf(s, todayIst()) };
    });
  }

  /** A draft (saved, not sent). */
  create(ctx: TenantContext, dto: SurveyDto) {
    this.check(dto);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.lists(tx, c.organizationId, dto);
      const s = await tx.engSurvey.create({ data: { organizationId: c.organizationId, ...this.data(dto), createdBy: c.userId! } });
      await audit(tx, c, 'engage.survey.created', 'eng_survey', s.id, { type: dto.type, anonymous: dto.anonymous, questions: dto.questions.length });
      return { id: s.id };
    });
  }

  /** Changes a draft; after launch nothing changes (the anonymity mode above all). */
  update(ctx: TenantContext, id: string, dto: SurveyDto) {
    this.check(dto);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.survey(tx, c.organizationId, id);
      if (s.launchedAt) throw new ConflictException({ statusCode: 409, code: 'ENGAGE_SURVEY_LAUNCHED', message: 'A launched survey can’t change; its anonymity mode is locked.' });
      await this.lists(tx, c.organizationId, dto);
      await tx.engSurvey.update({ where: { id }, data: { ...this.data(dto), updatedAt: new Date() } });
      await audit(tx, c, 'engage.survey.updated', 'eng_survey', id, {});
      return { id };
    });
  }

  private data(dto: SurveyDto) {
    const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
    return { name: dto.name, type: dto.type, anonymous: dto.anonymous, minGroup: dto.minGroup, questions: dto.questions as unknown as Prisma.InputJsonValue, locationIds: [...new Set(dto.locationIds)], departmentIds: [...new Set(dto.departmentIds)], opensOn: day(dto.opensOn), closesOn: day(dto.closesOn), remind: dto.remind, repeat: dto.repeat ?? 'none', autoInvite: Boolean(dto.autoInvite), autoAfterDays: dto.autoAfterDays ?? 30 };
  }

  private async lists(tx: Tx, org: string, dto: { locationIds: string[]; departmentIds: string[] }) {
    if (dto.locationIds.length && (await tx.location.count({ where: { organizationId: org, id: { in: dto.locationIds } } })) !== new Set(dto.locationIds).size) throw new BadRequestException('Choose the company’s own locations.');
    if (dto.departmentIds.length && (await tx.department.count({ where: { organizationId: org, id: { in: dto.departmentIds } } })) !== new Set(dto.departmentIds).size) throw new BadRequestException('Choose the company’s own departments.');
  }

  /** Launch: the audience today is invited (and told when it opens today); the survey is locked. */
  async launch(ctx: TenantContext, id: string) {
    const today = todayIst();
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.survey(tx, c.organizationId, id);
      if (s.launchedAt) throw new ConflictException({ statusCode: 409, code: 'ENGAGE_SURVEY_LAUNCHED', message: 'This survey was launched already.' });
      if (!(s.questions as Q[]).length) throw new BadRequestException('Add at least one question.');
      if (s.closesOn.toISOString().slice(0, 10) < today) throw new BadRequestException('The closing day has passed. Choose a later one.');
      // Answer 2664: an automatic onboarding or exit survey invites people later, as they reach the event.
      const people = s.autoInvite ? [] : await this.announcements.audience(tx, c.organizationId, s.locationIds, s.departmentIds);
      if (!people.length && !s.autoInvite) throw new BadRequestException('Nobody is in that audience today.');
      await tx.engSurveyInvite.createMany({ data: people.map((p) => ({ organizationId: c.organizationId, surveyId: s.id, userId: p.userId })), skipDuplicates: true });
      await tx.engSurvey.update({ where: { id }, data: { launchedAt: new Date() } });
      await audit(tx, c, 'engage.survey.launched', 'eng_survey', id, { invited: people.length });
      return { s, users: people.map((p) => p.userId) };
    });
    if (out.s.opensOn.toISOString().slice(0, 10) <= today) await this.tell(ctx.organizationId as string, out.s, out.users, 'engage.survey.open');
    return { invited: out.users.length };
  }

  // ------------------------------------------------------------------------------------------ answer 2664

  /**
   * Job: repeats and automatic invitations. A launched repeating survey makes its next run (its own survey, the same
   * questions and audience, the dates moved by a month or a quarter) once that run's opening day comes, and launches it.
   * An open automatic onboarding survey invites people who joined after it launched, its days after joining; an open
   * automatic exit survey invites people whose exit was accepted after it launched. Each person is invited once.
   */
  async cycleDue(today = todayIst()): Promise<{ repeated: number; invited: number }> {
    const due = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.engSurvey.findMany({ where: { launchedAt: { not: null }, OR: [{ repeat: { not: 'none' }, repeatedAt: null }, { autoInvite: true, closedAt: null }] }, take: 500 }),
    );
    let repeated = 0;
    let invited = 0;
    for (const s of due) {
      try {
        if (s.repeat !== 'none') {
          const months = s.repeat === 'monthly' ? 1 : 3;
          const opens = addMonths(s.opensOn.toISOString().slice(0, 10), months);
          if (opens > today) continue;
          const closes = addMonths(s.closesOn.toISOString().slice(0, 10), months);
          const out = await inCompany(this.tenantPrisma, { organizationId: s.organizationId, isSuperAdmin: false }, async (tx, c) => {
            const claimed = await tx.engSurvey.updateMany({ where: { id: s.id, repeatedAt: null }, data: { repeatedAt: new Date() } });
            if (!claimed.count) return null;
            const label = new Date(`${opens}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
            const base = s.name.replace(/ · [A-Z][a-z]{2} \d{4}$/, '');
            const next = await tx.engSurvey.create({ data: { organizationId: s.organizationId, name: `${base} · ${label}`.slice(0, 150), type: s.type, anonymous: s.anonymous, minGroup: s.minGroup, questions: s.questions as Prisma.InputJsonValue, locationIds: s.locationIds, departmentIds: s.departmentIds, opensOn: new Date(`${opens}T00:00:00Z`), closesOn: new Date(`${closes}T00:00:00Z`), remind: s.remind, repeat: s.repeat, createdBy: s.createdBy, launchedAt: new Date() } });
            const people = await this.announcements.audience(tx, s.organizationId, s.locationIds, s.departmentIds);
            await tx.engSurveyInvite.createMany({ data: people.map((p) => ({ organizationId: s.organizationId, surveyId: next.id, userId: p.userId })), skipDuplicates: true });
            await audit(tx, c, 'engage.survey.repeated', 'eng_survey', next.id, { from: s.id, invited: people.length });
            return { next, users: people.map((p) => p.userId) };
          });
          if (out) {
            repeated++;
            await this.tell(s.organizationId, out.next, out.users, 'engage.survey.open');
          }
          continue;
        }
        if (statusOf(s, today) !== 'open') continue;
        const fresh = await inCompany(this.tenantPrisma, { organizationId: s.organizationId, isSuperAdmin: false }, async (tx, c) => {
          const since = s.launchedAt!.toISOString();
          const raw =
            s.type === 'onboarding'
              ? await tx.$queryRaw<{ user_id: string }[]>`SELECT DISTINCT e.user_id::text FROM employments m JOIN employees e ON e.organization_id = m.organization_id AND e.id = m.employee_id
                  WHERE m.organization_id = ${s.organizationId}::uuid AND e.user_id IS NOT NULL AND m.joined_on >= (${since}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
                    AND m.joined_on + ${s.autoAfterDays}::int <= ${today}::date AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date)`
              : await tx.$queryRaw<{ user_id: string }[]>`SELECT DISTINCT e.user_id::text FROM exit_cases x JOIN employees e ON e.organization_id = x.organization_id AND e.id = x.employee_id
                  WHERE x.organization_id = ${s.organizationId}::uuid AND e.user_id IS NOT NULL AND x.status IN ('accepted', 'cleared') AND x.accepted_at >= ${since}::timestamptz`;
          // Only people in the survey's audience (its locations and departments), each once.
          const inAudience = new Set((await this.announcements.audience(tx, s.organizationId, s.locationIds, s.departmentIds)).map((p) => p.userId));
          const already = new Set((await tx.engSurveyInvite.findMany({ where: { surveyId: s.id }, select: { userId: true } })).map((i) => i.userId));
          const users = raw.map((r) => r.user_id).filter((u) => (s.type === 'exit' || inAudience.has(u)) && !already.has(u));
          if (!users.length) return [];
          await tx.engSurveyInvite.createMany({ data: users.map((u) => ({ organizationId: s.organizationId, surveyId: s.id, userId: u })), skipDuplicates: true });
          await audit(tx, c, 'engage.survey.auto_invited', 'eng_survey', s.id, { invited: users.length });
          return users;
        });
        if (fresh.length) {
          invited += fresh.length;
          await this.tell(s.organizationId, s, fresh, 'engage.survey.open');
        }
      } catch (e) {
        this.logger.warn(`survey cycle ${s.id}: ${(e as Error).message}`);
      }
    }
    return { repeated, invited };
  }

  /** Answer 2668: the results as CSV, only what the results page shows (groups at or above the smallest group). */
  async resultsCsv(ctx: TenantContext, id: string) {
    const r = await this.results(ctx, id);
    const cell = (v: string | number | null) => {
      const t = v == null ? '' : typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
      return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const lines: (string | number | null)[][] = [['Survey', r.name], ['Responses', r.responded], ['Invited', r.invited], ['Smallest group shown', r.minGroup], []];
    if (r.suppressed) lines.push([`Fewer than ${r.minGroup} responses: no results are shown.`]);
    else {
      if (r.enps) lines.push(['eNPS', r.enps.score], []);
      if (r.themes.length) {
        lines.push(['Theme', 'Favourable %', ...r.heat.filter((h) => h.values.some((v) => v != null)).map((h) => h.label)]);
        r.themes.forEach((t, i) => lines.push([t.theme, t.favourable, ...r.heat.filter((h) => h.values.some((v) => v != null)).map((h) => h.values[i] ?? null)]));
        lines.push([]);
      }
      for (const ch of r.choices) {
        lines.push([ch.question, 'Responses']);
        for (const o of ch.counts) lines.push([o.option, o.count]);
        lines.push([]);
      }
      const hidden = r.departments.filter((d) => !d.shown).length;
      if (hidden) lines.push([`${hidden} department(s) below ${r.minGroup} responses are not shown.`]);
    }
    await inCompany(this.tenantPrisma, ctx, (tx, c) => audit(tx, c, 'engage.survey.results_exported', 'eng_survey', id, { responses: r.responded }));
    return { name: r.name, csv: `${lines.map((l) => l.map(cell).join(',')).join('\r\n')}\r\n` };
  }

  /** Close now (before the closing day). */
  close(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.survey(tx, c.organizationId, id);
      if (statusOf(s, todayIst()) !== 'open') throw new ConflictException({ statusCode: 409, code: 'ENGAGE_SURVEY_NOT_OPEN', message: 'Only an open survey can be closed.' });
      await tx.engSurvey.update({ where: { id }, data: { closedAt: new Date() } });
      await audit(tx, c, 'engage.survey.closed', 'eng_survey', id, {});
      return { closed: true };
    });
  }

  private async tell(org: string, s: { id: string; name: string }, users: string[], type: 'engage.survey.open' | 'engage.survey.reminder') {
    if (!users.length) return;
    await this.notifications
      .notifySystem({ organizationId: org, isSuperAdmin: false } as TenantContext, users, type, { entityType: 'eng_survey', entityId: s.id, contextText: type === 'engage.survey.open' ? `A survey is open for you: ${s.name}` : `Reminder: ${s.name} closes soon`, linkPath: `/yx/engage/surveys/${s.id}/take` }, { subject: 'A survey is waiting for you in YukthiX', html: '<p>A survey is waiting for you in YukthiX.</p>' })
      .catch((e: Error) => this.logger.warn(`survey notice ${s.id}: ${e.message}`));
  }

  // ------------------------------------------------------------------------------------------ taking a survey

  /** Open surveys I was invited to and have not answered. */
  mine(ctx: TenantContext, user: ScopeUser) {
    const me = user.userId!;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const today = todayIst();
      const invites = await tx.engSurveyInvite.findMany({ where: { organizationId: c.organizationId, userId: me, answered: false } });
      const rows = await tx.engSurvey.findMany({ where: { id: { in: invites.map((i) => i.surveyId) } } });
      return rows.filter((s) => statusOf(s, today) === 'open').map((s) => ({ id: s.id, name: s.name, closesOn: s.closesOn.toISOString().slice(0, 10), questions: (s.questions as Q[]).length, anonymous: s.anonymous }));
    });
  }

  /** One survey to take: open and mine; says whether I answered already. */
  toTake(ctx: TenantContext, user: ScopeUser, id: string) {
    const me = user.userId!;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const invite = await tx.engSurveyInvite.findFirst({ where: { organizationId: c.organizationId, surveyId: id, userId: me } });
      if (!invite) throw new NotFoundException('No such survey.');
      const s = await this.survey(tx, c.organizationId, id);
      const status = statusOf(s, todayIst());
      if (status === 'draft' || status === 'scheduled') throw new NotFoundException('No such survey.');
      return { id: s.id, name: s.name, anonymous: s.anonymous, minGroup: s.minGroup, closesOn: s.closesOn.toISOString().slice(0, 10), closed: status === 'closed', answered: invite.answered, questions: s.questions as Q[] };
    });
  }

  /** My answers: checked against the questions; anonymous ones are stored with slices only, never with me. */
  answer(ctx: TenantContext, user: ScopeUser, id: string, dto: AnswersDto) {
    const me = user.userId;
    if (!me || user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Only the person themselves answers.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const invite = await tx.engSurveyInvite.findFirst({ where: { organizationId: org, surveyId: id, userId: me } });
      if (!invite) throw new NotFoundException('No such survey.');
      const s = await this.survey(tx, org, id);
      if (statusOf(s, todayIst()) !== 'open') throw new ConflictException({ statusCode: 409, code: 'ENGAGE_SURVEY_NOT_OPEN', message: 'This survey is not open.' });
      // Claim the invitation first, so two quick sends make one response.
      const claimed = await tx.engSurveyInvite.updateMany({ where: { id: invite.id, answered: false }, data: { answered: true } });
      if (!claimed.count) throw new ConflictException({ statusCode: 409, code: 'ENGAGE_SURVEY_ANSWERED', message: 'You have answered this survey already.' });
      const qs = s.questions as Q[];
      const answers: Record<string, string | number | string[]> = {};
      for (const [qid, v] of Object.entries(dto.answers)) {
        const q = qs.find((x) => x.id === qid);
        if (!q) throw new BadRequestException('An answer is for a question the survey does not have.');
        const ok =
          q.kind === 'enps' ? Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10
          : q.kind === 'rating' ? Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5
          : q.kind === 'single' ? typeof v === 'string' && (q.options ?? []).includes(v)
          : q.kind === 'multiple' ? Array.isArray(v) && v.length > 0 && v.every((x) => (q.options ?? []).includes(x as string))
          : typeof v === 'string' && v.trim().length > 0 && v.length <= 2000;
        if (!ok) throw new BadRequestException(`The answer to “${q.text}” is not one the question takes.`);
        answers[qid] = typeof v === 'string' ? v.trim() : v;
      }
      if (!Object.keys(answers).length) throw new BadRequestException('Answer at least one question.');
      const job = await tx.$queryRaw<{ department_id: string | null; location_id: string | null; manager_id: string | null }[]>`
        SELECT ea.department_id::text, ea.location_id::text, ea.manager_employee_id::text AS manager_id
        FROM employee_assignments ea JOIN employees e ON e.organization_id = ea.organization_id AND e.id = ea.employee_id
        WHERE ea.organization_id = ${org}::uuid AND e.user_id = ${me}::uuid AND ea.superseded_at IS NULL
          AND ea.valid_from <= ${todayIst()}::date AND (ea.valid_to IS NULL OR ea.valid_to >= ${todayIst()}::date)
        LIMIT 1`;
      await tx.engSurveyResponse.create({ data: { organizationId: org, surveyId: id, answers: answers as Prisma.InputJsonValue, departmentId: job[0]?.department_id ?? null, locationId: job[0]?.location_id ?? null, teamManagerId: job[0]?.manager_id ?? null, namedUserId: s.anonymous ? null : me, submittedOn: new Date(`${todayIst()}T00:00:00Z`) } });
      // The audit row says that someone answered, never who, for an anonymous survey.
      await audit(tx, s.anonymous ? { ...c, userId: null } : c, 'engage.survey.answered', 'eng_survey', id, {});
      return { answered: true };
    });
  }

  // ------------------------------------------------------------------------------------------ results

  private summarise(s: Survey, rows: { answers: Prisma.JsonValue }[]) {
    const qs = s.questions as Q[];
    const vals = (qid: string) => rows.map((r) => (r.answers as Record<string, unknown>)[qid]).filter((v) => v !== undefined);
    const e = qs.find((q) => q.kind === 'enps');
    const themes = [...new Set(qs.filter((q) => q.kind === 'rating').map((q) => q.theme || q.text))];
    return {
      enps: e ? enpsOf(vals(e.id) as number[]) : null,
      themes: themes.map((t) => ({ theme: t, favourable: favourable(qs.filter((q) => q.kind === 'rating' && (q.theme || q.text) === t).flatMap((q) => vals(q.id) as number[])) })),
      choices: qs.filter((q) => q.kind === 'single' || q.kind === 'multiple').map((q) => ({ question: q.text, counts: (q.options ?? []).map((o) => ({ option: o, count: vals(q.id).filter((v) => v === o || (Array.isArray(v) && v.includes(o))).length })) })),
    };
  }

  /** Company results (engage.survey.manage): overall above the smallest group; departments below it are hidden. */
  results(ctx: TenantContext, id: string, departmentId?: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.survey(tx, c.organizationId, id);
      if (!s.launchedAt) throw new BadRequestException('A draft has no results.');
      const all = await tx.engSurveyResponse.findMany({ where: { surveyId: id }, select: { answers: true, departmentId: true } });
      const invited = await tx.engSurveyInvite.count({ where: { surveyId: id } });
      const depts = await tx.department.findMany({ where: { organizationId: c.organizationId }, select: { id: true, name: true } });
      const sizes = depts.map((d) => ({ id: d.id, name: d.name, size: all.filter((r) => r.departmentId === d.id).length })).filter((d) => d.size > 0);
      if (departmentId && (sizes.find((d) => d.id === departmentId)?.size ?? 0) < s.minGroup) throw new BadRequestException(`Results show only for groups of ${s.minGroup} or more.`);
      const rows = departmentId ? all.filter((r) => r.departmentId === departmentId) : all;
      const suppressed = rows.length < s.minGroup;
      const sum = this.summarise(s, all);
      return {
        id: s.id,
        name: s.name,
        anonymous: s.anonymous,
        minGroup: s.minGroup,
        status: statusOf(s, todayIst()),
        invited,
        responded: all.length,
        suppressed,
        ...(suppressed ? { enps: null, themes: [], choices: [] } : this.summarise(s, rows)),
        departments: sizes.map((d) => ({ id: d.id, name: d.name, size: d.size, shown: d.size >= s.minGroup })),
        heat: sum.themes.length
          ? sizes.map((d) => {
              const sub = all.filter((r) => r.departmentId === d.id);
              return { label: d.name, groupSize: d.size, values: d.size >= s.minGroup ? this.summarise(s, sub).themes.map((t) => t.favourable) : sum.themes.map(() => null) };
            })
          : [],
        // Named surveys only: the text answers with the person (anonymous text is never shown one by one).
        comments: s.anonymous ? [] : [],
      };
    });
  }

  /** A manager's own team (their direct reports today) for one survey: shown only for the survey's smallest group or more. */
  teamResults(ctx: TenantContext, user: ScopeUser, id: string) {
    const me = user.userId!;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.survey(tx, c.organizationId, id);
      if (!s.launchedAt) throw new NotFoundException('No such survey.');
      const mine = await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: me }, select: { id: true } });
      // Only someone with direct reports today has a team to see.
      const today = todayIst();
      const reports = mine ? await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM employee_assignments WHERE organization_id = ${c.organizationId}::uuid AND manager_employee_id = ${mine.id}::uuid AND superseded_at IS NULL AND valid_from <= ${today}::date AND (valid_to IS NULL OR valid_to >= ${today}::date)` : [{ n: BigInt(0) }];
      if (!mine || !Number(reports[0]?.n ?? 0)) throw new NotFoundException('No such survey.');
      const rows = await tx.engSurveyResponse.findMany({ where: { surveyId: id, teamManagerId: mine.id }, select: { answers: true } });
      const plan = await tx.engActionPlan.findFirst({ where: { surveyId: id, managerUserId: me } });
      const suppressed = rows.length < s.minGroup;
      return { id: s.id, name: s.name, minGroup: s.minGroup, responded: rows.length, suppressed, ...(suppressed ? { enps: null, themes: [], choices: [] } : this.summarise(s, rows)), plan: plan ? { id: plan.id } : null, closedOn: s.closedAt ? s.closedAt.toISOString().slice(0, 10) : s.closesOn.toISOString().slice(0, 10) };
    });
  }

  /** Surveys whose results a manager can open (launched, with their team invited). */
  teamSurveys(ctx: TenantContext, user: ScopeUser) {
    const me = user.userId!;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const mine = await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: me }, select: { id: true } });
      if (!mine) return [];
      const rows = await tx.engSurvey.findMany({ where: { organizationId: c.organizationId, launchedAt: { not: null } }, orderBy: { createdAt: 'desc' }, take: 50 });
      const out = [];
      for (const s of rows) {
        const n = await tx.engSurveyResponse.count({ where: { surveyId: s.id, teamManagerId: mine.id } });
        if (n > 0) out.push({ id: s.id, name: s.name, responded: n, shown: n >= s.minGroup, status: statusOf(s, todayIst()) });
      }
      return out;
    });
  }

  // ------------------------------------------------------------------------------------------ action plans

  /** A manager keeps one plan per survey for their team (only when the team's results show). */
  savePlan(ctx: TenantContext, user: ScopeUser, id: string, dto: ActionPlanDto) {
    const me = user.userId!;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.survey(tx, c.organizationId, id);
      const mine = await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: me }, select: { id: true } });
      if (!s.launchedAt || !mine) throw new NotFoundException('No such survey.');
      const n = await tx.engSurveyResponse.count({ where: { surveyId: id, teamManagerId: mine.id } });
      if (n < s.minGroup) throw new BadRequestException(`Your team’s results show only for ${s.minGroup} or more responses, so there is no team plan.`);
      const existing = await tx.engActionPlan.findFirst({ where: { surveyId: id, managerUserId: me } });
      if (existing?.status === 'completed') throw new ConflictException({ statusCode: 409, code: 'ENGAGE_PLAN_DONE', message: 'This plan is complete.' });
      if (dto.status === 'completed' && !dto.items.length) throw new BadRequestException('Add an action before completing the plan.');
      const data = { focus: dto.focus, focusScore: dto.focusScore ?? null, status: dto.status, items: dto.items as unknown as Prisma.InputJsonValue, updatedAt: new Date() };
      const p = existing ? await tx.engActionPlan.update({ where: { id: existing.id }, data }) : await tx.engActionPlan.create({ data: { organizationId: c.organizationId, surveyId: id, managerUserId: me, ...data } });
      await audit(tx, c, 'engage.action_plan.saved', 'eng_action_plan', p.id, { status: dto.status, items: dto.items.length });
      return { id: p.id, status: p.status };
    });
  }

  myPlan(ctx: TenantContext, user: ScopeUser, id: string) {
    const me = user.userId!;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.survey(tx, c.organizationId, id);
      const p = await tx.engActionPlan.findFirst({ where: { organizationId: c.organizationId, surveyId: id, managerUserId: me } });
      return p ? { id: p.id, focus: p.focus, focusScore: p.focusScore, status: p.status, items: p.items, createdAt: p.createdAt.toISOString() } : null;
    });
  }

  /** HR: every plan for a survey, and the managers who have none yet (due 30 days after the survey closed). */
  plans(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.survey(tx, c.organizationId, id);
      const plans = await tx.engActionPlan.findMany({ where: { surveyId: id } });
      const users = await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: plans.map((p) => p.managerUserId) } }, select: { id: true, name: true, email: true } });
      const closed = (s.closedAt ?? s.closesOn).toISOString().slice(0, 10);
      return {
        dueOn: new Date(Date.parse(`${closed}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10),
        plans: plans.map((p) => ({ id: p.id, manager: users.find((u) => u.id === p.managerUserId)?.name ?? 'Former user', focus: p.focus, status: p.status, items: p.items })),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ the job

  /** Three days before closing, a reminder to people invited who have not answered (only whether, never what). */
  async remindDue(today = todayIst()): Promise<number> {
    const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 86_400_000);
    const rows = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.engSurvey.findMany({ where: { launchedAt: { not: null }, closedAt: null, remind: true, remindedOn: null, closesOn: { lte: soon, gte: new Date(`${today}T00:00:00Z`) }, opensOn: { lte: new Date(`${today}T00:00:00Z`) } }, take: 200 }));
    let n = 0;
    for (const s of rows) {
      const users = await this.tenantPrisma.forTenant({ organizationId: s.organizationId, isSuperAdmin: false }, async (tx) => {
        const claimed = await tx.engSurvey.updateMany({ where: { id: s.id, remindedOn: null }, data: { remindedOn: new Date(`${today}T00:00:00Z`) } });
        return claimed.count ? (await tx.engSurveyInvite.findMany({ where: { surveyId: s.id, answered: false }, select: { userId: true } })).map((i) => i.userId) : [];
      });
      if (users.length) n++;
      await this.tell(s.organizationId, s, users, 'engage.survey.reminder');
    }
    return n;
  }
}

export type { SurveyQuestionDto };
