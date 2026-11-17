import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, PrismaService, TenantContext, TenantPrismaService, resolvePermissionGrants } from '@exam-platform/shared';
import { NotificationsService } from '../../notifications/notifications.service';
import { escapeHtml } from '../../notifications/notification-email-render';
import { todayIst } from '../../org-structure/org-validation';
import { mayHoldKeys } from '../../questions/bank/review-nudges.service';
import { AiInvocationService } from '../../ai/ai-invocation.service';
import { JdSkillsClient, matchSkills, planSections, type Level, type ProposedSkill } from './jd-test';
import { ExamsService, type PublishCheck } from '../../exams/exams.service';
import { htmlToText } from '../../service-desk/rich-text';
import type { UpdateExamDto } from '../../exams/dto/update-exam.dto';
import { HIGH_STAKES_KEY, companySetting, modeOf, needsApproval, presetOf, type ProctorMode } from '../asmt-rules';

// Assessments AS-2 (PRC-04 test builder): one test as the designed builder shows it (sections, the blueprint of its
// pool sections, timing, scoring, the proctoring mode and the pre-publish checklist), and the approval a big test needs
// (asmt.high_stakes). Everything else the builder changes goes through the existing /exams routes, which keep their
// own checks (a test is locked once published or started).

type Tx = Prisma.TransactionClient;
/** Who writes and approves tests (the YukthiX key and its older alias). */
const TEST_KEYS = ['asmt.test.manage', 'exam:manage'];

/** Answer 2284: a question as the Sections step's picker shows it (no answer key). */
export interface QuestionChoice {
  id: string;
  text: string;
  type: string;
  difficulty: string;
  marks: number;
  skills: string[];
}

export interface BuilderSection {
  id: string;
  title: string;
  weightPercent: number;
  mode: 'fixed' | 'pool';
  questions: number;
  /** Pool sections: how many are drawn, from which tags and difficulty, and how many approved questions match. */
  poolSize: number | null;
  poolDifficulty: string | null;
  poolTags: string[];
  /** Answer 2284: the pool's skill ids (the skills picker). */
  poolTagIds: string[];
  available: number | null;
  requiredCount: number | null;
  targetMinutes: number | null;
  /** Answer 2154: the least percentage of this section's own marks to pass; null = none. */
  cutoffPercent: number | null;
}

export interface BuilderTest {
  id: string;
  title: string;
  status: string;
  durationMinutes: number;
  passMark: number;
  expectedCandidates: number | null;
  proctoringMode: ProctorMode | 'custom';
  /** AS-6 part 2 (answer 2272): candidates may use the approved assistant; every message is logged. */
  aiAllowed: boolean;
  sections: BuilderSection[];
  checks: PublishCheck[];
  /** Draft and nobody has started it: the builder may change it. */
  editable: boolean;
  approval: {
    needed: boolean;
    threshold: number;
    requestedBy: string | null;
    requestedAt: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    /** The approval still matches the test as it is now. */
    current: boolean;
    /** The viewer may approve (asked for, not theirs, not the author). */
    canApprove: boolean;
  };
  createdAt: string;
}

@Injectable()
export class AsmtTestsService {
  private readonly logger = new Logger(AsmtTestsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly exams: ExamsService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly ai: AiInvocationService,
    private readonly jd: JdSkillsClient,
  ) {}

  private async aiOn(ctx: TenantContext) {
    const on = await this.tenantPrisma.forTenant(ctx, async (tx) => (await companySetting(tx, ctx.organizationId as string, 'asmt.ai_generation')) === 'on');
    if (!on) throw new ForbiddenException('AI drafts are switched off for your company (Settings › Assessments).');
  }

  /** Answer 2151: the skills and level a job description asks for, matched to the company's skills. Nothing is saved. */
  async proposeFromJd(ctx: TenantContext, userId: string, jobDescription: string): Promise<{ level: Level; skills: ProposedSkill[] }> {
    await this.aiOn(ctx);
    const tags = await this.tenantPrisma.forTenant(ctx, (tx) => tx.tag.findMany({ where: { organizationId: ctx.organizationId as string }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 300 }));
    const r = await this.ai.run(ctx, { source: 'asmt.test_from_jd', sourceId: userId }, (p) => this.jd.read(jobDescription, tags.map((t) => t.name), p));
    return { level: r.level, skills: matchSkills(r.skills, tags) };
  }

  /** Answer 2151: the confirmed skills become a draft test, one pool section per skill. Every skill must be the company's. */
  async createFromJd(ctx: TenantContext, userId: string, d: { title: string; level: Level; total: number; skills: { tagId: string; percent: number }[] }) {
    await this.aiOn(ctx);
    const org = ctx.organizationId as string;
    const ids = [...new Set(d.skills.map((s) => s.tagId))];
    if (ids.length !== d.skills.length) throw new BadRequestException('Each skill can be in the test once.');
    const tags = await this.tenantPrisma.forTenant(ctx, (tx) => tx.tag.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, name: true } }));
    if (tags.length !== ids.length) throw new BadRequestException('Map every skill to one of your skills first.');
    const name = new Map(tags.map((t) => [t.id, t.name]));
    const plan = planSections(d.skills.map((s) => ({ tagId: s.tagId, name: name.get(s.tagId)!, percent: s.percent })), d.total);
    const exam = await this.exams.create(ctx, userId, { title: d.title });
    for (const s of plan) {
      const sec = await this.exams.createSection(ctx, exam.id, { title: s.title });
      await this.exams.updateSection(ctx, userId, exam.id, sec.id, { selectionMode: 'pool', poolSize: s.poolSize, poolDifficulty: d.level, poolTagIds: [s.tagId], weightPercent: s.weightPercent, title: s.title });
    }
    await this.audit.record(ctx, { actorUserId: userId, action: 'exam.created_from_job_description', entityType: 'exam', entityId: exam.id, metadata: { sections: plan.length, level: d.level } });
    return { id: exam.id };
  }

  private async find(tx: Tx, org: string, id: string) {
    const exam = await tx.exam.findFirst({
      where: { id, organizationId: org },
      include: { sections: { orderBy: { orderIndex: 'asc' }, include: { _count: { select: { questions: true } }, poolTags: { include: { tag: { select: { name: true } } } } } } },
    });
    if (!exam) throw new NotFoundException('Test not found');
    return exam;
  }

  async get(ctx: TenantContext, userId: string, id: string): Promise<BuilderTest> {
    const checks = await this.exams.publishChecks(ctx, id);
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const org = ctx.organizationId as string;
      const exam = await this.find(tx, org, id);
      const threshold = Number(await companySetting(tx, org, HIGH_STAKES_KEY));
      const started = await tx.attempt.count({ where: { examId: id } });
      const names = await this.names(tx, org, [exam.approvalRequestedBy, exam.approvedBy]);
      const sections: BuilderSection[] = [];
      for (const s of exam.sections) {
        const pool = s.selectionMode === 'pool';
        sections.push({
          id: s.id,
          title: s.title,
          weightPercent: s.weightPercent,
          mode: pool ? 'pool' : 'fixed',
          questions: s._count.questions,
          poolSize: pool ? s.poolSize : null,
          poolDifficulty: pool ? s.poolDifficulty : null,
          poolTags: pool ? s.poolTags.map((t) => t.tag.name) : [],
          poolTagIds: pool ? s.poolTags.map((t) => t.tagId) : [],
          available: pool
            ? await tx.question.count({ where: { organizationId: org, status: 'active', ...(s.poolDifficulty ? { difficulty: s.poolDifficulty } : {}), AND: s.poolTags.map((t) => ({ tags: { some: { tagId: t.tagId } } })) } })
            : null,
          requiredCount: s.requiredCount,
          targetMinutes: s.targetDurationMinutes,
          cutoffPercent: s.cutoffPercent,
        });
      }
      const current = exam.approvedBy !== null && exam.approvedFingerprint === (await this.exams.fingerprintOf(tx, ctx, id));
      return {
        id: exam.id,
        title: exam.title,
        status: exam.status,
        durationMinutes: exam.durationMinutes,
        passMark: exam.passCriteriaPercent,
        expectedCandidates: exam.expectedCandidates,
        proctoringMode: modeOf(exam),
        aiAllowed: exam.aiAllowed,
        sections,
        checks,
        editable: exam.status === 'draft' && started === 0,
        approval: {
          needed: needsApproval(exam.expectedCandidates, threshold),
          threshold,
          requestedBy: exam.approvalRequestedBy ? (names.get(exam.approvalRequestedBy) ?? 'Someone') : null,
          requestedAt: exam.approvalRequestedAt?.toISOString() ?? null,
          approvedBy: exam.approvedBy ? (names.get(exam.approvedBy) ?? 'Someone') : null,
          approvedAt: exam.approvedAt?.toISOString() ?? null,
          current,
          canApprove: exam.status === 'draft' && exam.approvalRequestedBy !== null && !current && userId !== exam.approvalRequestedBy && userId !== exam.createdBy,
        },
        createdAt: exam.createdAt.toISOString(),
      };
    });
  }

  /**
   * Answer 2284: the designed Sections step's question picker. A fixed section's chosen questions, and the bank's live
   * questions it may add (not already in another section of this test), searched by words, difficulty and skill. Test
   * writers read the question text and its skills, never the answer key. Changes go through the existing
   * PUT /exams/:id/sections/:sectionId/questions (which locks a published or started test).
   */
  async questionChoices(ctx: TenantContext, id: string, sectionId: string, f: { search?: string; difficulty?: string; tagId?: string }): Promise<{ chosen: QuestionChoice[]; choices: QuestionChoice[] }> {
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const org = ctx.organizationId as string;
      const section = await tx.examSection.findFirst({ where: { id: sectionId, examId: id, exam: { organizationId: org } }, select: { id: true } });
      if (!section) throw new NotFoundException('Section not found');
      const links = await tx.examSectionQuestion.findMany({ where: { section: { examId: id } }, select: { sectionId: true, questionId: true }, orderBy: { orderIndex: 'asc' } });
      const mine = links.filter((l) => l.sectionId === sectionId).map((l) => l.questionId);
      const elsewhere = links.filter((l) => l.sectionId !== sectionId).map((l) => l.questionId);
      const select = { id: true, text: true, type: true, difficulty: true, marks: true, tags: { select: { tag: { select: { name: true } } } } } as const;
      const shape = (q: { id: string; text: string; type: string; difficulty: string; marks: number; tags: { tag: { name: string } }[] }): QuestionChoice => ({
        id: q.id,
        text: htmlToText(q.text).slice(0, 240),
        type: q.type,
        difficulty: q.difficulty,
        marks: q.marks,
        skills: q.tags.map((t) => t.tag.name),
      });
      const chosenRows = mine.length ? await tx.question.findMany({ where: { organizationId: org, id: { in: mine } }, select }) : [];
      const byId = new Map(chosenRows.map((q) => [q.id, q]));
      const choices = await tx.question.findMany({
        where: {
          organizationId: org,
          status: 'active',
          id: { notIn: [...mine, ...elsewhere] },
          ...(f.search ? { text: { contains: f.search, mode: 'insensitive' as const } } : {}),
          ...(f.difficulty ? { difficulty: f.difficulty } : {}),
          ...(f.tagId ? { tags: { some: { tagId: f.tagId } } } : {}),
        },
        select,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return { chosen: mine.map((q) => byId.get(q)).filter((q): q is NonNullable<typeof q> => Boolean(q)).map(shape), choices: choices.map(shape) };
    });
  }

  /** Answer 2287. */
  restore(ctx: TenantContext, userId: string, id: string) {
    return this.exams.restore(ctx, userId, id);
  }

  /** Answer 2285: the skills (question tags) by name, for mapping and pool skills; no questions, no counts. */
  async skills(ctx: TenantContext): Promise<{ id: string; name: string }[]> {
    return this.tenantPrisma.forTenant(ctx, (tx) => tx.tag.findMany({ where: { organizationId: ctx.organizationId as string }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 2000 }));
  }

  async defaults(ctx: TenantContext): Promise<{ proctorMode: ProctorMode; highStakes: number; aiDrafts: boolean }> {
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const org = ctx.organizationId as string;
      return { proctorMode: (await companySetting(tx, org, 'asmt.proctor_mode')) as ProctorMode, highStakes: Number(await companySetting(tx, org, HIGH_STAKES_KEY)), aiDrafts: (await companySetting(tx, org, 'asmt.ai_generation')) === 'on' };
    });
  }

  private async names(tx: Tx, org: string, ids: (string | null)[]) {
    const want = ids.filter((x): x is string => !!x);
    if (!want.length) return new Map<string, string>();
    const users = await tx.user.findMany({ where: { organizationId: org, id: { in: want } }, select: { id: true, name: true, email: true } });
    return new Map(users.map((u) => [u.id, u.name || u.email]));
  }

  /** Answer 2007: set the test's switches to a named mode (through the exams service, which refuses a locked test). */
  async setMode(ctx: TenantContext, userId: string, id: string, mode: ProctorMode) {
    // Only the switches change (an update without a title keeps it).
    await this.exams.update(ctx, userId, id, presetOf(mode) as Partial<UpdateExamDto> as UpdateExamDto);
    await this.audit.record(ctx, { actorUserId: userId, action: 'exam.proctoring_mode_set', entityType: 'exam', entityId: id, metadata: { mode } });
    return { mode };
  }

  /** AS-6 part 2 (answer 2272): the AI-allowed switch (a locked test refuses, as any other change). */
  async setAiAllowed(ctx: TenantContext, userId: string, id: string, allowed: boolean) {
    await this.exams.update(ctx, userId, id, { aiAllowed: allowed } as UpdateExamDto);
    await this.audit.record(ctx, { actorUserId: userId, action: 'exam.ai_allowed_set', entityType: 'exam', entityId: id, metadata: { allowed } });
    return { aiAllowed: allowed };
  }

  /** asmt.high_stakes: ask another person to approve this test as it is now. */
  async requestApproval(ctx: TenantContext, userId: string, id: string) {
    const org = ctx.organizationId as string;
    const asked = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const org = ctx.organizationId as string;
      const exam = await this.find(tx, org, id);
      if (exam.status !== 'draft') throw new BadRequestException('Only a draft test is approved before publishing.');
      const threshold = Number(await companySetting(tx, org, HIGH_STAKES_KEY));
      if (!needsApproval(exam.expectedCandidates, threshold)) throw new BadRequestException(`Only a test for more than ${threshold} candidates needs an approver. Publish it when the checklist is ready.`);
      // A new request replaces an earlier approval (the test may have changed since).
      await tx.exam.update({ where: { id }, data: { approvalRequestedBy: userId, approvalRequestedAt: new Date(), approvedBy: null, approvedAt: null, approvedFingerprint: null } });
      return { title: exam.title, author: exam.createdBy, people: await mayHoldKeys(tx, org, TEST_KEYS, todayIst()) };
    });
    await this.audit.record(ctx, { actorUserId: userId, action: 'exam.approval_requested', entityType: 'exam', entityId: id });
    await this.tellApprovers(ctx, id, userId, asked).catch((e: unknown) => this.logger.error(e));
    return { requested: true };
  }

  /** Answer 2158: a bell note to everyone who may approve the test (the tests key), never the asker or the author. */
  private async tellApprovers(ctx: TenantContext, id: string, asker: string, a: { title: string; author: string | null; people: { id: string; role: string; permission_profile_id: string | null }[] }) {
    const org = ctx.organizationId as string;
    const to: string[] = [];
    for (const p of a.people) {
      if (p.id === asker || p.id === a.author) continue;
      const keys = await resolvePermissionGrants(this.prisma, this.tenantPrisma, { role: p.role, organizationId: org, permissionProfileId: p.permission_profile_id, userId: p.id }, TEST_KEYS);
      if (TEST_KEYS.some((k) => keys.has(k))) to.push(p.id);
    }
    if (!to.length) return;
    const text = `"${a.title}" waits for your approval before it is published. Open it in Hire › Assessments › Tests.`;
    await this.notifications.notifySystem(ctx, to, 'asmt.test.approval_requested', { entityType: 'exam', entityId: id, contextText: text, linkPath: `/yx/hiring/assessments/tests/${id}` }, { subject: 'A test waits for your approval', html: `<p>${escapeHtml(text)}</p>` });
  }

  /** asmt.high_stakes: a second person (neither the asker nor the author) approves the test as it is now. */
  async approve(ctx: TenantContext, userId: string, id: string) {
    const fingerprint = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const org = ctx.organizationId as string;
      const exam = await this.find(tx, org, id);
      if (exam.status !== 'draft') throw new BadRequestException('Only a draft test is approved before publishing.');
      if (!exam.approvalRequestedBy) throw new BadRequestException('Nobody has asked for approval of this test yet.');
      if (userId === exam.approvalRequestedBy || userId === exam.createdBy) throw new ForbiddenException('Another person approves this test: not the one who asked, and not its author.');
      const fp = await this.exams.fingerprintOf(tx, ctx, id);
      if (exam.approvedBy && exam.approvedFingerprint === fp) throw new ConflictException('This test is already approved as it is.');
      await tx.exam.update({ where: { id }, data: { approvedBy: userId, approvedAt: new Date(), approvedFingerprint: fp } });
      return fp;
    });
    await this.audit.record(ctx, { actorUserId: userId, action: 'exam.approved', entityType: 'exam', entityId: id, metadata: { fingerprint } });
    return { approved: true };
  }
}
