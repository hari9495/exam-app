import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { contactAccount } from './customers.service';
import { DeskActor, activeOn, audit, deskSystem, emit, has } from './desk-access';
import { SurveyDto } from './dto-ops';
import { maskPii } from './pii';
import { Requester, RequesterService } from './requester.service';
import { PortalSession } from './portal.service';

// SD-1.26 CSAT on close and NPS surveys (US-B-108, US-B-109; YX-HD-05, YX-CONSOLE-05). D9: no tracking pixels and no
// open tracking. A rating comes in the app, the portal, or through a one-click link in an email: the link holds a random
// token (kept only as its sha256), works once (the first request wins, in one UPDATE) and for 30 days. A low CSAT gives
// the desk's team lead a follow-up task; an NPS detractor gives the account owner (or the lead) one.

const TOKEN_DAYS = 30;
const ASK_WITHIN_DAYS = 14;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const webOrigin = () => (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CSAT_WORDS = ['', 'Very poor', 'Poor', 'OK', 'Good', 'Very good'];

/** NPS from scores 0–10: % promoters (9–10) minus % detractors (0–6). */
export function npsOf(scores: number[]): { nps: number | null; promoters: number; passives: number; detractors: number } {
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  const passives = scores.length - promoters - detractors;
  return { nps: scores.length ? Math.round(((promoters - detractors) / scores.length) * 100) : null, promoters, passives, detractors };
}

@Injectable()
export class SurveysService {
  private readonly logger = new Logger(SurveysService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
    private readonly requesters: RequesterService,
  ) {}

  private async newToken(tx: Tx, org: string, data: { kind: 'csat' | 'nps'; ticketId?: string; surveyId?: string; personId: string }) {
    const token = randomBytes(24).toString('base64url');
    await tx.sdSurveyToken.create({ data: { organizationId: org, kind: data.kind, ticketId: data.ticketId ?? null, surveyId: data.surveyId ?? null, personId: data.personId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TOKEN_DAYS * 86_400_000) } });
    return `${webOrigin()}/yx/rate/${org}/${token}`;
  }

  // ------------------------------------------------------------------------------------------ CSAT

  /** Job: ask the requester of each newly solved ticket once (in-app always; by email when we know their address). */
  async askRatings(now = new Date()): Promise<number> {
    const due = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.$queryRaw<{ id: string; organization_id: string }[]>`
        SELECT t.id, t.organization_id FROM sd_tickets t
        WHERE t.system_state IN ('solved', 'closed') AND t.rating_asked_at IS NULL AND t.merged_into_id IS NULL
          AND t.resolved_at > ${now}::timestamptz - make_interval(days => ${ASK_WITHIN_DAYS}::int)
        ORDER BY t.resolved_at LIMIT 500`,
    );
    let n = 0;
    for (const r of due) {
      const mail = await deskSystem(this.tenantPrisma, { organizationId: r.organization_id, isSuperAdmin: false }, async (tx) => {
        const won = await tx.sdTicket.updateMany({ where: { id: r.id, ratingAskedAt: null }, data: { ratingAskedAt: now } });
        if (!won.count) return null;
        const t = await tx.sdTicket.findFirstOrThrow({ where: { id: r.id } });
        if (await tx.sdRating.findFirst({ where: { organizationId: t.organizationId, ticketId: t.id }, select: { id: true } })) return null;
        const person = await tx.person.findFirst({ where: { organizationId: t.organizationId, id: t.requesterPersonId, status: 'active' }, select: { primaryEmail: true } });
        const desk = await tx.sdDesk.findFirstOrThrow({ where: { organizationId: t.organizationId, id: t.deskId }, select: { name: true } });
        if (!person?.primaryEmail) return null;
        const suppressed = await tx.sdEmailSuppression.findFirst({ where: { organizationId: t.organizationId, address: person.primaryEmail, clearedAt: null }, select: { id: true } });
        if (suppressed) return null;
        const link = await this.newToken(tx, t.organizationId, { kind: 'csat', ticketId: t.id, personId: t.requesterPersonId });
        // Sensitive and private tickets: neutral words only (YX-SD-14).
        const what = t.sensitive || t.private ? `ticket ${t.number}` : `ticket ${t.number} (${t.subject})`;
        return { to: person.primaryEmail, from: desk.name, link, what, org: t.organizationId };
      });
      if (!mail) continue;
      n++;
      const links = [5, 4, 3, 2, 1].map((s) => `<li><a href="${esc(`${mail.link}?score=${s}`)}">${s} · ${CSAT_WORDS[s]}</a></li>`).join('');
      void this.email
        .send({
          to: mail.to,
          organizationId: mail.org,
          fromName: mail.from,
          subject: 'How did we do?',
          html: `<p>Hello,</p><p>We solved your ${esc(mail.what)}. How happy are you with the help you got? Choose one:</p><ul>${links}</ul><p>One click is enough. The links work for ${TOKEN_DAYS} days.</p>`,
          text: `We solved your ${mail.what}. How happy are you with the help you got? Open one link:\n${[5, 4, 3, 2, 1].map((s) => `${s} ${CSAT_WORDS[s]}: ${mail.link}?score=${s}`).join('\n')}`,
          headers: { 'Auto-Submitted': 'auto-generated' },
        })
        .catch((e) => this.logger.warn(`Rating email not sent: ${(e as Error).message}`));
    }
    return n;
  }

  /** Records a CSAT once per ticket; a low score gives the lead a follow-up task. */
  private async rateIn(tx: Tx, org: string, ticketId: string, personId: string, score: number, comment: string | null, channel: 'email' | 'app' | 'portal') {
    const t = await tx.sdTicket.findFirst({ where: { organizationId: org, id: ticketId } });
    if (!t) throw new NotFoundException('No such ticket.');
    if (!['solved', 'closed'].includes(t.systemState)) throw new BadRequestException('Rate a ticket once it is solved.');
    // CSAT per agent: the owner, or else the agent who answered last.
    const agentUserId = t.assigneeUserId ?? (await tx.sdTicketMessage.findFirst({ where: { organizationId: org, ticketId: t.id, kind: 'reply', side: 'agent', authorUserId: { not: null } }, orderBy: { createdAt: 'desc' }, select: { authorUserId: true } }))?.authorUserId ?? null;
    const created = await tx.sdRating.createMany({ data: [{ organizationId: org, deskId: t.deskId, ticketId: t.id, personId, agentUserId, groupId: t.groupId, score, comment: comment ? maskPii(comment).text : null, channel }], skipDuplicates: true });
    if (!created.count) throw new ConflictException('This ticket is already rated. Thank you.');
    await tx.sdTicketEvent.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, kind: 'rated', toValue: String(score), requesterVisible: true, byPersonId: personId } });
    await emit(tx, org, 'helpdesk.ticket.rated', { ticketId: t.id, deskId: t.deskId, score });
    await audit(tx, { ctx: { organizationId: org, isSuperAdmin: false }, userId: null as unknown as string }, 'desk.ticket.rated', 'sd_ticket', t.id, { score, channel, personId });
    if (score <= 2) {
      const lead = await this.leadOf(tx, org, t.deskId);
      await tx.sdTask.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, sensitive: t.sensitive, private: t.private, title: `Follow up a low rating (${score} of 5) on ${t.number}`, assigneeUserId: lead, dueAt: new Date(Date.now() + 2 * 86_400_000) } });
      return { ticket: t, lead };
    }
    return { ticket: t, lead: null };
  }

  private async leadOf(tx: Tx, org: string, deskId: string): Promise<string | null> {
    return (await tx.sdDeskMember.findFirst({ where: { organizationId: org, deskId, role: 'lead', ...activeOn(todayIst()) }, orderBy: { validFrom: 'asc' }, select: { userId: true } }))?.userId ?? null;
  }

  private async tellLead(org: string, r: { ticket: { id: string; number: string }; lead: string | null }, type = 'helpdesk.rating.low') {
    if (!r.lead) return;
    await this.notifications
      .notifySystem({ organizationId: org, isSuperAdmin: false }, [r.lead], type, { entityType: 'sd_ticket', entityId: r.ticket.id, contextText: `Low rating on ${r.ticket.number}`, linkPath: `/yx/desk/tickets/${r.ticket.id}` }, { subject: `A low rating on ${r.ticket.number}`, html: `<p>A requester gave a low rating on ticket ${esc(r.ticket.number)}. A follow-up task is waiting for you.</p>` })
      .catch((e) => this.logger.warn(`Lead not told: ${(e as Error).message}`));
  }

  /** In the app: the requester rates their own solved ticket. */
  async rateMine(r: Requester, ticketId: string, score: number, comment?: string) {
    if (r.acting) throw new ForbiddenException('Not available while acting for someone else');
    const res = await this.tenantPrisma.forTenant(r.ctx, async (tx) => {
      const { t, personId } = await this.requesters.ownTicket(tx, r, ticketId);
      if (t.requesterPersonId !== personId) throw new ForbiddenException('Only the person who raised the ticket rates it.');
      return this.rateIn(tx, r.ctx.organizationId, t.id, personId, score, comment ?? null, 'app');
    });
    await this.tellLead(r.ctx.organizationId, res);
    return { thanks: true };
  }

  /** In the portal: the outside requester rates their own solved ticket. */
  async ratePortal(s: PortalSession, ticketId: string, score: number, comment: string | undefined, run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>) {
    const res = await run(async (tx) => {
      const t = await tx.sdTicket.findFirst({ where: { organizationId: s.organizationId, id: ticketId, requesterPersonId: s.personId } });
      if (!t) throw new NotFoundException('No such ticket.');
      return this.rateIn(tx, s.organizationId, t.id, s.personId, score, comment ?? null, 'portal');
    });
    await this.tellLead(s.organizationId, res);
    return { thanks: true };
  }

  // ------------------------------------------------------------------------------------------ the one-click link

  private async tokenRow(tx: Tx, org: string, token: string) {
    if (!/^[A-Za-z0-9_-]{30,40}$/.test(token)) return null;
    const row = await tx.sdSurveyToken.findFirst({ where: { organizationId: org, tokenHash: sha256(token) } });
    return row && row.expiresAt.getTime() > Date.now() ? row : null;
  }

  /** What the link asks (no personal data): the question and the scale. Reading never uses the link up. */
  async linkInfo(org: string, token: string) {
    return deskSystem(this.tenantPrisma, { organizationId: org, isSuperAdmin: false }, async (tx) => {
      const row = await this.tokenRow(tx, org, token);
      if (!row) throw new NotFoundException('This link has expired.');
      const company = (await tx.organization.findUnique({ where: { id: org }, select: { name: true } }))?.name ?? '';
      if (row.kind === 'csat') {
        const t = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: org, id: row.ticketId! }, select: { number: true } });
        return { kind: 'csat', company, question: `How happy are you with the help on ticket ${t.number}?`, min: 1, max: 5, used: Boolean(row.usedAt) };
      }
      const s = await tx.sdSurvey.findFirstOrThrow({ where: { organizationId: org, id: row.surveyId! }, select: { question: true } });
      return { kind: 'nps', company, question: s.question, min: 0, max: 10, used: Boolean(row.usedAt) };
    });
  }

  /** The click: the first request uses the link up and records the score. */
  async answerLink(org: string, token: string, score: number, comment?: string) {
    const out = await deskSystem(this.tenantPrisma, { organizationId: org, isSuperAdmin: false }, async (tx) => {
      const row = await this.tokenRow(tx, org, token);
      if (!row) throw new NotFoundException('This link has expired.');
      if (row.kind === 'csat' && (score < 1 || score > 5)) throw new BadRequestException('Choose 1 to 5.');
      if (row.kind === 'nps' && (score < 0 || score > 10)) throw new BadRequestException('Choose 0 to 10.');
      const won = await tx.sdSurveyToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
      if (!won.count) throw new ConflictException({ statusCode: 409, code: 'LINK_USED', message: 'You already answered. Thank you.' });
      if (row.kind === 'csat') return { kind: 'csat' as const, ...(await this.rateIn(tx, org, row.ticketId!, row.personId, score, comment ?? null, 'email')) };
      return { kind: 'nps' as const, ...(await this.respondIn(tx, org, row.surveyId!, row.personId, score, comment ?? null)) };
    });
    if (out.lead) await this.tellLead(org, { ticket: out.ticket, lead: out.lead }, out.kind === 'csat' ? 'helpdesk.rating.low' : 'helpdesk.nps.detractor');
    return { thanks: true, canComment: true };
  }

  /** A comment after the one-click answer: once, within an hour of the click. */
  async commentLink(org: string, token: string, comment: string) {
    return deskSystem(this.tenantPrisma, { organizationId: org, isSuperAdmin: false }, async (tx) => {
      const row = await this.tokenRow(tx, org, token);
      if (!row?.usedAt || row.usedAt.getTime() < Date.now() - 3_600_000) throw new NotFoundException('This link has expired.');
      const text = maskPii(comment).text;
      const n =
        row.kind === 'csat'
          ? await tx.sdRating.updateMany({ where: { organizationId: org, ticketId: row.ticketId!, personId: row.personId, comment: null }, data: { comment: text } })
          : await tx.sdSurveyResponse.updateMany({ where: { organizationId: org, surveyId: row.surveyId!, personId: row.personId, comment: null, createdAt: { gte: row.usedAt } }, data: { comment: text } });
      if (!n.count) throw new ConflictException('Your comment is already saved. Thank you.');
      return { thanks: true };
    });
  }

  // ------------------------------------------------------------------------------------------ NPS (US-B-109)

  private requireSurveys(a: DeskActor, deskId: string) {
    if (!has(a, 'desk.survey.manage')) throw new ForbiddenException('You cannot set up surveys (desk.survey.manage).');
    if (!has(a, 'desk.desk.create') && !['lead', 'admin'].includes(a.roles.get(deskId) ?? '')) throw new ForbiddenException('Set up surveys for the desks you lead or run.');
  }

  async surveys(a: DeskActor) {
    if (!has(a, 'desk.survey.manage')) throw new ForbiddenException('You cannot set up surveys (desk.survey.manage).');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const rows = await tx.sdSurvey.findMany({ where: { organizationId: a.ctx.organizationId }, orderBy: { createdAt: 'desc' } });
      const mine = rows.filter((s) => has(a, 'desk.desk.create') || ['lead', 'admin'].includes(a.roles.get(s.deskId) ?? ''));
      const out = [];
      for (const s of mine) {
        const scores = (await tx.sdSurveyResponse.findMany({ where: { organizationId: a.ctx.organizationId, surveyId: s.id }, select: { score: true } })).map((r) => r.score);
        const sent = await tx.sdSurveyToken.count({ where: { organizationId: a.ctx.organizationId, surveyId: s.id } });
        out.push({ id: s.id, deskId: s.deskId, name: s.name, question: s.question, everyDays: s.everyDays, periodDays: s.periodDays, nextRunAt: s.nextRunAt, lastRunAt: s.lastRunAt, active: s.active, version: s.version, sent, answered: scores.length, ...npsOf(scores) });
      }
      return out;
    });
  }

  async saveSurvey(a: DeskActor, id: string | null, dto: SurveyDto) {
    this.requireSurveys(a, dto.deskId);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      const data = { deskId: dto.deskId, name: dto.name, question: dto.question, everyDays: dto.everyDays, periodDays: dto.periodDays, active: dto.active ?? true, ...(dto.startAt ? { nextRunAt: new Date(dto.startAt) } : {}) };
      let rowId: string;
      if (id) {
        const cur = await tx.sdSurvey.findFirst({ where: { organizationId: org, id } });
        if (!cur) throw new NotFoundException('No such survey.');
        this.requireSurveys(a, cur.deskId);
        if (dto.version !== undefined && dto.version !== cur.version) throw new ConflictException('Someone changed this survey. Reload to see the latest.');
        await tx.sdSurvey.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
        rowId = id;
      } else rowId = (await tx.sdSurvey.create({ data: { organizationId: org, ...data, createdBy: a.userId } })).id;
      await audit(tx, a, id ? 'desk.survey.updated' : 'desk.survey.created', 'sd_survey', rowId, data);
      return { id: rowId };
    });
  }

  /** Recent answers with comments (masked), newest first. */
  async answers(a: DeskActor, id: string) {
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const s = await tx.sdSurvey.findFirst({ where: { organizationId: a.ctx.organizationId, id } });
      if (!s) throw new NotFoundException('No such survey.');
      this.requireSurveys(a, s.deskId);
      const rows = await tx.sdSurveyResponse.findMany({ where: { organizationId: a.ctx.organizationId, surveyId: id }, orderBy: { createdAt: 'desc' }, take: 200 });
      const accounts = new Map((await tx.sdCustomerAccount.findMany({ where: { organizationId: a.ctx.organizationId, id: { in: rows.map((r) => r.accountId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
      return rows.map((r) => ({ score: r.score, comment: r.comment, account: r.accountId ? (accounts.get(r.accountId) ?? null) : null, at: r.createdAt }));
    });
  }

  private async respondIn(tx: Tx, org: string, surveyId: string, personId: string, score: number, comment: string | null) {
    const s = await tx.sdSurvey.findFirstOrThrow({ where: { organizationId: org, id: surveyId } });
    const accountId = await contactAccount(tx, org, personId);
    await tx.sdSurveyResponse.create({ data: { organizationId: org, surveyId, deskId: s.deskId, personId, accountId, score, comment: comment ? maskPii(comment).text : null } });
    await audit(tx, { ctx: { organizationId: org, isSuperAdmin: false }, userId: null as unknown as string }, 'desk.survey.answered', 'sd_survey', surveyId, { score, accountId });
    if (score > 6) return { ticket: { id: surveyId, number: s.name }, lead: null };
    // A detractor: a follow-up task to the account owner (when they hold a seat on the desk), else the desk's lead.
    const owner = accountId ? (await tx.sdCustomerAccount.findFirst({ where: { organizationId: org, id: accountId }, select: { ownerUserId: true } }))?.ownerUserId : null;
    const ownerSeat = owner ? await tx.sdDeskMember.findFirst({ where: { organizationId: org, deskId: s.deskId, userId: owner, role: { in: ['agent', 'lead', 'collaborator'] }, ...activeOn(todayIst()) }, select: { id: true } }) : null;
    const to = ownerSeat ? owner! : await this.leadOf(tx, org, s.deskId);
    await tx.sdTask.create({ data: { organizationId: org, deskId: s.deskId, title: `Follow up an NPS answer of ${score} (${s.name})`.slice(0, 200), note: comment ? maskPii(comment).text.slice(0, 2000) : null, assigneeUserId: to, dueAt: new Date(Date.now() + 3 * 86_400_000) } });
    return { ticket: { id: surveyId, number: s.name }, lead: to };
  }

  /** Job: each due survey goes to requesters of the desk's recent tickets who had no NPS survey in the period. */
  async runSurveys(now = new Date()): Promise<number> {
    const due = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string; organization_id: string }[]>`SELECT id, organization_id FROM sd_surveys WHERE active AND next_run_at <= ${now} LIMIT 50`);
    let sent = 0;
    for (const d of due) {
      const batch = await deskSystem(this.tenantPrisma, { organizationId: d.organization_id, isSuperAdmin: false }, async (tx) => {
        const s = await tx.sdSurvey.findFirst({ where: { id: d.id, active: true, nextRunAt: { lte: now } } });
        if (!s) return [];
        await tx.sdSurvey.update({ where: { id: s.id }, data: { lastRunAt: now, nextRunAt: new Date(now.getTime() + s.everyDays * 86_400_000) } });
        const people = await tx.$queryRaw<{ person_id: string; email: string }[]>`
          SELECT DISTINCT t.requester_person_id AS person_id, p.primary_email AS email FROM sd_tickets t
          JOIN persons p ON p.organization_id = t.organization_id AND p.id = t.requester_person_id AND p.status = 'active' AND p.primary_email IS NOT NULL
          WHERE t.organization_id = ${s.organizationId}::uuid AND t.desk_id = ${s.deskId}::uuid AND t.system_state IN ('solved', 'closed')
            AND t.resolved_at > ${now}::timestamptz - make_interval(days => ${s.everyDays}::int) AND NOT t.sensitive
            AND NOT EXISTS (SELECT 1 FROM sd_survey_tokens k WHERE k.organization_id = t.organization_id AND k.person_id = t.requester_person_id AND k.kind = 'nps'
                            AND k.created_at > ${now}::timestamptz - make_interval(days => ${s.periodDays}::int))
            AND NOT EXISTS (SELECT 1 FROM sd_email_suppressions x WHERE x.organization_id = t.organization_id AND x.address = p.primary_email AND x.cleared_at IS NULL)
          LIMIT 500`;
        const desk = await tx.sdDesk.findFirstOrThrow({ where: { organizationId: s.organizationId, id: s.deskId }, select: { name: true } });
        const out: { to: string; link: string; question: string; from: string; org: string }[] = [];
        for (const p of people) out.push({ to: p.email, link: await this.newToken(tx, s.organizationId, { kind: 'nps', surveyId: s.id, personId: p.person_id }), question: s.question, from: desk.name, org: s.organizationId });
        await audit(tx, { ctx: { organizationId: s.organizationId, isSuperAdmin: false }, userId: null as unknown as string }, 'desk.survey.sent', 'sd_survey', s.id, { people: out.length });
        return out;
      });
      for (const m of batch) {
        sent++;
        const scale = Array.from({ length: 11 }, (_, i) => `<a href="${esc(`${m.link}?score=${i}`)}">${i}</a>`).join(' · ');
        void this.email
          .send({ to: m.to, organizationId: m.org, fromName: m.from, subject: 'A quick question', html: `<p>Hello,</p><p>${esc(m.question)}</p><p>0 = not at all, 10 = very likely:</p><p>${scale}</p><p>One click is enough. The link works for ${TOKEN_DAYS} days.</p>`, text: `${m.question}\nOpen ${m.link} to answer (0 = not at all, 10 = very likely).`, headers: { 'Auto-Submitted': 'auto-generated' } })
          .catch((e) => this.logger.warn(`Survey email not sent: ${(e as Error).message}`));
      }
    }
    return sent;
  }
}
