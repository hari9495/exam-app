import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { ScopeUser, Viewer, buildViewer, tenantWide } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { groupFeedback, nominationProblem, type PeerEntry, type Relationship } from './peer-rules';
import { PerformanceReviewsService } from './reviews.service';
import type { BlockDto, EntryDto, NominateDto, PeerConfigDto } from './review-dto';

// Performance batch PM5 (M06-BUILD-DESIGN §10, §15.3; PM-5.01 … 5.03): peer and 360° feedback in a review cycle.
//   set-up       HR (perf.cycle.manage) turns it on for a draft cycle: least and most nominees, and a deadline
//   nominations  the employee proposes, the current manager approves, declines or adds, HR can add (Q4); never the
//                employee, their manager, or a pair HR blocked; the picker never says why someone is missing
//   answering    only approved nominees, only before the deadline, only the peer sections (YX-PERF-04, PF-D1)
//   anonymity    peers, reports and others are anonymous; their answers show only as groups of at least
//                perf.anonymity.min_responses (never below 3), smaller groups pool into "Others" or are held back;
//                no response ever carries its author (§10.2); advisory, never in the score
//   reveal       perf.feedback.investigate (no template) reveals one author with a reason, audited, the admins told

const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const asJson = (x: unknown) => x as Prisma.InputJsonValue;
type PeerConfig = { minNominees: number; maxNominees: number; dueOn: string };

@Injectable()
export class PerformancePeerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly reviews: PerformanceReviewsService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, ['perf.cycle.manage', 'perf.review.view', 'perf.concern.seal', 'perf.feedback.investigate']);
  }

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  private async tell(org: string, users: (string | null)[], type: string, text: string, link: string) {
    const to = [...new Set(users.filter((u): u is string => Boolean(u)))];
    if (to.length) await this.notifications.notifySystem({ organizationId: org, isSuperAdmin: false }, to, type, { entityType: 'performance', entityId: org, contextText: text, linkPath: link }, { subject: text, html: `<p>${text}. Open YukthiX to see it.</p>` }).catch(() => undefined);
  }

  private async names(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = await tx.employee.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
    return new Map(rows.map((e) => [e.id, [e.preferredName || e.givenName, e.familyName].filter(Boolean).join(' ')]));
  }

  private async blocked(tx: Tx, org: string, a: string, b: string) {
    const today = todayIst();
    return Boolean(await tx.reviewerBlock.findFirst({ where: { organizationId: org, endedBy: null, OR: [{ employeeA: a, employeeB: b }, { employeeA: b, employeeB: a }], AND: [{ OR: [{ untilOn: null }, { untilOn: { gte: asDate(today) } }] }] } }));
  }

  private async review(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const r = await tx.review.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!r) throw new NotFoundException('No such review.');
    const a = await this.reviews.accessOf(tx, c, v, r);
    const cycle = await tx.reviewCycle.findFirstOrThrow({ where: { id: r.cycleId } });
    const peer = (cycle.peerFeedback as PeerConfig | null) ?? null;
    return { r, a, cycle, peer, hr: tenantWide(v, 'perf.cycle.manage') && !v.actingForOther };
  }

  // ------------------------------------------------------------------------------------------ set-up (PM-5.01)

  async configure(ctx: TenantContext, user: ScopeUser, cycleId: string, dto: PeerConfigDto | null) {
    const v = await this.viewer(user);
    if (!tenantWide(v, 'perf.cycle.manage') || v.actingForOther) throw new ForbiddenException('Review cycles are run by HR with company-wide access.');
    if (dto && dto.maxNominees < dto.minNominees) throw new BadRequestException('The most nominees cannot be fewer than the least.');
    if (dto && dto.dueOn < todayIst()) throw new BadRequestException('The feedback deadline cannot be in the past.');
    return this.run(ctx, async (tx, c) => {
      const n = await tx.reviewCycle.updateMany({ where: { organizationId: c.organizationId, id: cycleId, status: 'draft' }, data: { peerFeedback: dto ? asJson({ minNominees: dto.minNominees, maxNominees: dto.maxNominees, dueOn: dto.dueOn }) : Prisma.DbNull, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Only a draft cycle changes its peer feedback.');
      await audit(tx, c, 'perf.cycle.peer_feedback', 'review_cycle', cycleId, { on: Boolean(dto) });
      return { peerFeedback: dto };
    });
  }

  // ------------------------------------------------------------------------------------------ nominations (PM-5.01)

  async nominations(ctx: TenantContext, user: ScopeUser, reviewId: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const { r, a, peer, hr } = await this.review(tx, c, v, reviewId);
      if (!a.own && !a.manager && !a.chain && !a.scope && !hr) throw new NotFoundException('No such review.');
      const rows = peer ? await tx.feedbackNomination.findMany({ where: { organizationId: c.organizationId, reviewId }, orderBy: { createdAt: 'asc' } }) : [];
      const people = await this.names(tx, c.organizationId, rows.map((x) => x.reviewerEmployeeId));
      const open = Boolean(peer) && r.status === 'open' && todayIst() <= peer!.dueOn;
      return {
        peer,
        nominations: rows.map((x) => ({ id: x.id, reviewer: people.get(x.reviewerEmployeeId) ?? '', reviewerEmployeeId: x.reviewerEmployeeId, relationship: x.relationship, proposedBy: x.proposedBy, status: x.status })),
        can: { propose: open && a.own, decide: open && a.manager, add: open && (a.manager || hr) },
      };
    });
  }

  /** People who may be nominated: searched on the server, never the employee, their manager, someone already asked, or a blocked pair. */
  async options(ctx: TenantContext, user: ScopeUser, reviewId: string, q: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const { r, a, hr } = await this.review(tx, c, v, reviewId);
      if (!a.own && !a.manager && !hr) throw new NotFoundException('No such review.');
      const today = todayIst();
      const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      const rows = await tx.$queryRaw<{ id: string; name: string }[]>`
        SELECT e.id::text, concat_ws(' ', COALESCE(NULLIF(e.preferred_name, ''), e.given_name), e.family_name) AS name FROM employees e
        WHERE e.organization_id = ${org}::uuid AND e.user_id IS NOT NULL AND e.id <> ${r.employeeId}::uuid AND e.id <> ${r.managerEmployeeId}::uuid
          AND EXISTS (SELECT 1 FROM employments m WHERE m.organization_id = e.organization_id AND m.employee_id = e.id AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date))
          AND NOT EXISTS (SELECT 1 FROM feedback_nominations n WHERE n.organization_id = e.organization_id AND n.review_id = ${reviewId}::uuid AND n.reviewer_employee_id = e.id AND n.status <> 'withdrawn')
          AND NOT EXISTS (SELECT 1 FROM reviewer_blocks b WHERE b.organization_id = e.organization_id AND b.ended_by IS NULL AND (b.until_on IS NULL OR b.until_on >= ${today}::date)
                          AND ((b.employee_a = e.id AND b.employee_b = ${r.employeeId}::uuid) OR (b.employee_b = e.id AND b.employee_a = ${r.employeeId}::uuid)))
          AND (${q} = '' OR concat_ws(' ', e.given_name, e.family_name, e.preferred_name) ILIKE ${like})
        ORDER BY 2 LIMIT 25`;
      return rows.map((x) => ({ id: x.id, name: x.name }));
    });
  }

  async nominate(ctx: TenantContext, user: ScopeUser, reviewId: string, dto: NominateDto) {
    const v = await this.viewer(user);
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const { r, a, peer, hr } = await this.review(tx, c, v, reviewId);
      if (!a.own && !a.manager && !a.chain && !a.scope && !hr) throw new NotFoundException('No such review.');
      if (!peer) throw new ConflictException('This cycle does not ask colleagues for feedback.');
      if (r.status !== 'open' || todayIst() > peer.dueOn) throw new ConflictException('Nominations for this review are closed.');
      const by: 'employee' | 'manager' | 'hr' | null = a.own ? 'employee' : a.manager ? 'manager' : hr ? 'hr' : null;
      if (!by) throw new ForbiddenException('The employee, their manager or HR nominates.');
      if (dto.reviewerEmployeeId === r.employeeId || dto.reviewerEmployeeId === r.managerEmployeeId) throw new BadRequestException('The employee and their manager give their views in their own stages.');
      // The same answer for a blocked pair as for anyone who cannot be asked: the reason is never shown (§15.3).
      const who = await tx.employee.findFirst({ where: { organizationId: org, id: dto.reviewerEmployeeId }, select: { userId: true } });
      if (!who?.userId || (await this.blocked(tx, org, r.employeeId, dto.reviewerEmployeeId))) throw new BadRequestException('This person cannot be asked for feedback on this review.');
      const counts = await tx.feedbackNomination.groupBy({ by: ['status'], where: { organizationId: org, reviewId }, _count: { _all: true } });
      const count = (s: string[]) => counts.filter((x) => s.includes(x.status)).reduce((t, x) => t + x._count._all, 0);
      const problem = nominationProblem({ approved: count(['approved', 'submitted']), proposed: count(['proposed']), max: peer.maxNominees, adding: by === 'employee' ? 'propose' : 'approve' });
      if (problem) throw new ConflictException(problem);
      const status = by === 'employee' ? 'proposed' : 'approved';
      const cur = await tx.feedbackNomination.findFirst({ where: { organizationId: org, reviewId, reviewerEmployeeId: dto.reviewerEmployeeId } });
      if (cur && cur.status !== 'withdrawn' && cur.status !== 'declined') throw new ConflictException('This person is already nominated.');
      const data = { relationship: dto.relationship, proposedBy: by, status, decidedBy: by === 'employee' ? null : v.userId, createdBy: v.userId };
      const x = cur ? await tx.feedbackNomination.update({ where: { id: cur.id }, data }) : await tx.feedbackNomination.create({ data: { organizationId: org, reviewId, reviewerEmployeeId: dto.reviewerEmployeeId, ...data } });
      await audit(tx, c, 'perf.nomination.added', 'feedback_nomination', x.id, { by, status });
      const mgr = await tx.employee.findFirst({ where: { organizationId: org, id: r.managerEmployeeId }, select: { userId: true } });
      return { id: x.id, status, notify: status === 'approved' ? who.userId : (mgr?.userId ?? null) };
    });
    void this.tell(ctx.organizationId!, [out.notify], out.status === 'approved' ? 'perf.feedback.task' : 'perf.nomination.proposed', out.status === 'approved' ? 'You were asked for feedback on a colleague' : 'A nomination is waiting for you', out.status === 'approved' ? '/yx/performance/feedback-tasks' : `/yx/performance/reviews/${reviewId}`);
    return { id: out.id, status: out.status };
  }

  /** The current manager approves or declines what the employee proposed. */
  async decide(ctx: TenantContext, user: ScopeUser, id: string, approve: boolean) {
    const v = await this.viewer(user);
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const x = await tx.feedbackNomination.findFirst({ where: { organizationId: org, id } });
      if (!x) throw new NotFoundException('No such nomination.');
      const { r, a, peer } = await this.review(tx, c, v, x.reviewId);
      if (!a.manager) throw new ForbiddenException('The employee’s manager decides nominations.');
      if (x.status !== 'proposed') throw new ConflictException('This nomination is already decided.');
      if (!peer || r.status !== 'open' || todayIst() > peer.dueOn) throw new ConflictException('Nominations for this review are closed.');
      if (approve) {
        const approved = await tx.feedbackNomination.count({ where: { organizationId: org, reviewId: x.reviewId, status: { in: ['approved', 'submitted'] } } });
        const problem = nominationProblem({ approved, proposed: 0, max: peer.maxNominees, adding: 'approve' });
        if (problem) throw new ConflictException(problem);
      }
      await tx.feedbackNomination.update({ where: { id }, data: { status: approve ? 'approved' : 'declined', decidedBy: v.userId } });
      await audit(tx, c, approve ? 'perf.nomination.approved' : 'perf.nomination.declined', 'feedback_nomination', id, {});
      return approve ? ((await tx.employee.findFirst({ where: { organizationId: org, id: x.reviewerEmployeeId }, select: { userId: true } }))?.userId ?? null) : null;
    });
    if (out) void this.tell(ctx.organizationId!, [out], 'perf.feedback.task', 'You were asked for feedback on a colleague', '/yx/performance/feedback-tasks');
    return { id, status: approve ? 'approved' : 'declined' };
  }

  async withdraw(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const x = await tx.feedbackNomination.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!x) throw new NotFoundException('No such nomination.');
      const { a } = await this.review(tx, c, v, x.reviewId);
      if (!a.own || x.proposedBy !== 'employee') throw new ForbiddenException('Only the employee withdraws their own proposal.');
      if (x.status !== 'proposed') throw new ConflictException('Only a proposal not yet decided is withdrawn.');
      await tx.feedbackNomination.update({ where: { id }, data: { status: 'withdrawn' } });
      return { id, status: 'withdrawn' };
    });
  }

  // ------------------------------------------------------------------------------------------ answering (PM-5.01, PF-D1)

  private async mine(tx: Tx, org: string, v: Viewer, reviewId: string) {
    if (!v.userId || v.actingForOther) return null;
    const me = await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } });
    if (!me) return null;
    return tx.feedbackNomination.findFirst({ where: { organizationId: org, reviewId, reviewerEmployeeId: me.id, status: { in: ['approved', 'submitted'] } } });
  }

  /** What I am asked to answer, with only what I need: the person, the cycle, the deadline. */
  async tasks(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!v.userId || v.actingForOther) return [];
      const me = await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } });
      if (!me) return [];
      const rows = await tx.feedbackNomination.findMany({ where: { organizationId: org, reviewerEmployeeId: me.id, status: { in: ['approved', 'submitted'] } }, orderBy: { createdAt: 'desc' } });
      const reviews = await tx.review.findMany({ where: { organizationId: org, id: { in: rows.map((x) => x.reviewId) } } });
      const cycles = new Map((await tx.reviewCycle.findMany({ where: { organizationId: org, id: { in: [...new Set(reviews.map((r) => r.cycleId))] } } })).map((x) => [x.id, x]));
      const people = await this.names(tx, org, reviews.map((r) => r.employeeId));
      return rows.flatMap((x) => {
        const r = reviews.find((y) => y.id === x.reviewId);
        if (!r) return [];
        const cyc = cycles.get(r.cycleId)!;
        const due = (cyc.peerFeedback as PeerConfig | null)?.dueOn ?? null;
        return [{ id: x.id, reviewId: r.id, employee: people.get(r.employeeId) ?? '', cycle: cyc.name, dueOn: due, done: x.status === 'submitted', open: x.status === 'approved' && r.status === 'open' && Boolean(due) && todayIst() <= due! }];
      });
    });
  }

  /** The questions a nominee answers, and their own draft; nothing else of the review. */
  async form(ctx: TenantContext, user: ScopeUser, reviewId: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const n = await this.mine(tx, org, v, reviewId);
      if (!n) throw new NotFoundException('No such review.');
      const { r, cycle, peer } = await this.review(tx, c, v, reviewId);
      const tpl = await this.reviews.templateOf(tx, org, cycle);
      const items = this.reviews.itemsOf(tpl).filter((q) => tpl.sections.find((s) => s.id === q.sectionId)!.whoAnswers.includes('peer'));
      const entry = await tx.reviewEntry.findFirst({ where: { organizationId: org, reviewId, stage: 'peer', authorUserId: v.userId! } });
      const people = await this.names(tx, org, [r.employeeId]);
      return {
        reviewId,
        employee: people.get(r.employeeId) ?? '',
        cycle: cycle.name,
        dueOn: peer?.dueOn ?? null,
        anonymous: true,
        sections: tpl.sections.filter((s) => items.some((q) => q.sectionId === s.id)).map((s) => ({ id: s.id, title: s.title, questions: items.filter((q) => q.sectionId === s.id).map((q) => ({ id: q.id, text: q.text, answer: q.answer, required: q.required, maxChars: q.maxChars, wholeSection: q.id === s.id })) })),
        levels: tpl.levels.map((l) => ({ value: Number(l.value.toString()), label: l.label })),
        entry: entry ? { status: entry.status, answers: entry.answers, comment: entry.comment } : null,
        can: { answer: n.status === 'approved' && r.status === 'open' && Boolean(peer) && todayIst() <= peer!.dueOn },
      };
    });
  }

  async answer(ctx: TenantContext, user: ScopeUser, reviewId: string, dto: EntryDto, submit: boolean) {
    const v = await this.viewer(user);
    await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const n = await this.mine(tx, org, v, reviewId);
      if (!n) throw new NotFoundException('No such review.');
      if (n.status === 'submitted') throw new ConflictException('You already sent your feedback.');
      const { r, cycle, peer } = await this.review(tx, c, v, reviewId);
      if (r.status !== 'open' || !peer || todayIst() > peer.dueOn) throw new ConflictException('Feedback for this review is closed.');
      const answers = this.reviews.answersFor('peer', await this.reviews.templateOf(tx, org, cycle), { ...dto, overallRating: null }, submit);
      const me = n.reviewerEmployeeId;
      const data = { answers: asJson(answers), comment: dto.comment?.trim() || null, ...(submit ? { status: 'submitted', submittedAt: new Date() } : {}) };
      const cur = await tx.reviewEntry.findFirst({ where: { organizationId: org, reviewId, stage: 'peer', authorUserId: v.userId! } });
      if (cur) await tx.reviewEntry.update({ where: { id: cur.id }, data: { ...data, version: { increment: 1 } } });
      // The author is kept only to investigate abuse (§10.3); anonymous answers never show it.
      else await tx.reviewEntry.create({ data: { organizationId: org, reviewId, stage: 'peer', authorUserId: v.userId!, authorEmployeeId: me, relationship: n.relationship, anonymous: true, ...data } });
      if (submit) await tx.feedbackNomination.update({ where: { id: n.id }, data: { status: 'submitted' } });
    });
    return this.form(ctx, user, reviewId);
  }

  /** §10.2: grouped, anonymous; for the manager, the chain above and HR in scope; for the employee after release. */
  async grouped(ctx: TenantContext, user: ScopeUser, reviewId: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const { r, a, peer } = await this.review(tx, c, v, reviewId);
      if (!(a.manager || a.chain || a.scope || (a.own && r.releasedAt))) {
        if (a.own) return { advisory: true, peer, released: false, shown: [], heldBack: 0, responses: 0 };
        throw new NotFoundException('No such review.');
      }
      const rows = await tx.reviewEntry.findMany({ where: { organizationId: org, reviewId, stage: 'peer', status: 'submitted' }, select: { id: true, relationship: true, answers: true, comment: true, sealedAt: true } });
      const min = Number(await settingFor(tx, c, 'perf.anonymity.min_responses', { legalEntityId: r.legalEntityId }));
      // A sealed answer still counts and keeps its ratings; its texts are gone (§15.3).
      const g = groupFeedback(rows.map((x): PeerEntry => ({ id: x.id, relationship: x.relationship as Relationship, answers: (x.sealedAt ? Object.fromEntries(Object.entries(x.answers as PeerEntry['answers']).map(([k, a]) => [k, { rating: a.rating ?? null, text: null }])) : x.answers) as PeerEntry['answers'], comment: x.sealedAt ? null : x.comment })), min);
      return { advisory: true, peer, released: Boolean(r.releasedAt), responses: rows.length, ...g };
    });
  }

  // ------------------------------------------------------------------------------------------ reviewer blocks (§15.3)

  private sealer(v: Viewer) {
    if (!v.grants.has('perf.concern.seal') || v.actingForOther) throw new ForbiddenException('Only HR who handle concerns manage reviewer blocks.');
  }

  async blocks(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    this.sealer(v);
    return this.run(ctx, async (tx, c) => {
      const rows = await tx.reviewerBlock.findMany({ where: { organizationId: c.organizationId, endedBy: null }, orderBy: { createdAt: 'desc' } });
      const people = await this.names(tx, c.organizationId, rows.flatMap((b) => [b.employeeA, b.employeeB]));
      return rows.map((b) => ({ id: b.id, a: people.get(b.employeeA) ?? '', b: people.get(b.employeeB) ?? '', employeeA: b.employeeA, employeeB: b.employeeB, reasonCode: b.reasonCode, untilOn: b.untilOn?.toISOString().slice(0, 10) ?? null }));
    });
  }

  /** Blocking a pair also withdraws any open nomination between them, without telling either why. */
  async block(ctx: TenantContext, user: ScopeUser, dto: BlockDto) {
    const v = await this.viewer(user);
    this.sealer(v);
    if (dto.employeeA === dto.employeeB) throw new BadRequestException('Choose two different people.');
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      if ((await tx.employee.count({ where: { organizationId: org, id: { in: [dto.employeeA, dto.employeeB] } } })) !== 2) throw new BadRequestException('Choose two people of this company.');
      const b = await tx.reviewerBlock.create({ data: { organizationId: org, employeeA: dto.employeeA, employeeB: dto.employeeB, reasonCode: dto.reasonCode, untilOn: dto.untilOn ? asDate(dto.untilOn) : null, setBy: v.userId } });
      const open = await tx.$queryRaw<{ id: string }[]>`
        SELECT n.id::text FROM feedback_nominations n JOIN reviews r ON r.organization_id = n.organization_id AND r.id = n.review_id
        WHERE n.organization_id = ${org}::uuid AND n.status IN ('proposed', 'approved')
          AND ((r.employee_id = ${dto.employeeA}::uuid AND n.reviewer_employee_id = ${dto.employeeB}::uuid) OR (r.employee_id = ${dto.employeeB}::uuid AND n.reviewer_employee_id = ${dto.employeeA}::uuid))`;
      if (open.length) await tx.feedbackNomination.updateMany({ where: { organizationId: org, id: { in: open.map((x) => x.id) } }, data: { status: 'withdrawn' } });
      await audit(tx, c, 'perf.reviewer_block.set', 'reviewer_block', b.id, { reasonCode: dto.reasonCode, withdrawn: open.length });
      return { id: b.id, withdrawn: open.length };
    });
  }

  async endBlock(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    this.sealer(v);
    return this.run(ctx, async (tx, c) => {
      const n = await tx.reviewerBlock.updateMany({ where: { organizationId: c.organizationId, id, endedBy: null }, data: { endedBy: v.userId } });
      if (!n.count) throw new NotFoundException('No such block.');
      await audit(tx, c, 'perf.reviewer_block.ended', 'reviewer_block', id, {});
      return { id };
    });
  }

  // ------------------------------------------------------------------------------------------ sealing review comments (§15.3)

  /** For HR who handle concerns: the texts of a review's entries, sealed ones too; never the author of an anonymous one. */
  async sealable(ctx: TenantContext, user: ScopeUser, reviewId: string) {
    const v = await this.viewer(user);
    this.sealer(v);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.review.findFirst({ where: { organizationId: org, id: reviewId }, select: { id: true } }))) throw new NotFoundException('No such review.');
      const rows = await tx.reviewEntry.findMany({ where: { organizationId: org, reviewId, status: 'submitted' }, orderBy: { submittedAt: 'asc' } });
      const people = await this.names(tx, org, rows.filter((e) => !e.anonymous).map((e) => e.authorEmployeeId));
      return rows.map((e) => ({
        id: e.id,
        stage: e.stage,
        author: e.anonymous ? null : (people.get(e.authorEmployeeId ?? '') ?? ''),
        texts: [...Object.values(e.answers as PeerEntry['answers']).map((a) => a?.text).filter((t): t is string => Boolean(t)), ...(e.comment ? [e.comment] : [])],
        sealed: Boolean(e.sealedAt),
        sealReason: e.sealReason,
      }));
    });
  }

  /** Seals one entry's texts: its ratings stay; everyone but the sealer sees it removed; the reason is audited. */
  async sealEntry(ctx: TenantContext, user: ScopeUser, entryId: string, reason: string) {
    const v = await this.viewer(user);
    this.sealer(v);
    return this.run(ctx, async (tx, c) => {
      const e = await tx.reviewEntry.findFirst({ where: { organizationId: c.organizationId, id: entryId } });
      if (!e) throw new NotFoundException('No such review entry.');
      if (e.sealedAt) throw new ConflictException('This entry is already sealed.');
      await tx.reviewEntry.update({ where: { id: entryId }, data: { sealedAt: new Date(), sealedBy: v.userId, sealReason: reason } });
      await audit(tx, c, 'perf.review_entry.sealed', 'review_entry', entryId, { reason });
      return { id: entryId, sealed: true };
    });
  }

  // ------------------------------------------------------------------------------------------ investigating abuse (§10.3)

  /** The anonymous answers of a review, with no author, for the investigator to pick the one in question. */
  async entries(ctx: TenantContext, user: ScopeUser, reviewId: string) {
    const v = await this.viewer(user);
    if (!v.grants.has('perf.feedback.investigate') || v.actingForOther) throw new ForbiddenException('Investigating an answer needs perf.feedback.investigate.');
    return this.run(ctx, async (tx, c) =>
      (await tx.reviewEntry.findMany({ where: { organizationId: c.organizationId, reviewId, stage: 'peer', status: 'submitted' }, select: { id: true, answers: true, comment: true } })).map((x) => ({ id: x.id, answers: x.answers, comment: x.comment })),
    );
  }

  async reveal(ctx: TenantContext, user: ScopeUser, entryId: string, reason: string) {
    const v = await this.viewer(user);
    if (!v.grants.has('perf.feedback.investigate') || v.actingForOther) throw new ForbiddenException('Investigating an answer needs perf.feedback.investigate.');
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = await tx.reviewEntry.findFirst({ where: { organizationId: org, id: entryId, stage: 'peer' } });
      if (!e) throw new NotFoundException('No such answer.');
      const people = await this.names(tx, org, [e.authorEmployeeId]);
      await audit(tx, c, 'perf.review_entry.author_revealed', 'review_entry', entryId, { reason });
      const admins = (await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active' }, select: { id: true } })).map((u) => u.id);
      return { author: people.get(e.authorEmployeeId ?? '') ?? '', admins };
    });
    void this.tell(ctx.organizationId!, out.admins, 'perf.feedback.author_revealed', 'The author of an anonymous review answer was revealed', '/yx/admin/audit');
    return { author: out.author };
  }
}
