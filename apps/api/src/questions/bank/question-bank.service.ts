import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { SETTINGS, resolveSetting } from '../../org-structure/settings-registry';
import { QuestionsService } from '../questions.service';
import type { CreateQuestionDto } from '../dto/create-question.dto';
import { changedFields, closestDuplicate, isMajorChange, missingAltText, normalized, type QuestionContent } from './bank-rules';

type Tx = Prisma.TransactionClient;
type Row = Prisma.QuestionGetPayload<{ include: { options: true; tags: { include: { tag: true } } } }>;

export const BANK_LANGUAGES = ['hi', 'ta', 'te'] as const;
export type BankLanguage = (typeof BANK_LANGUAGES)[number];
const OPEN = ['draft', 'in_review', 'changes_requested'];

/** The person working in the bank, in their own session (the controller refuses while acting). */
export interface Who {
  ctx: TenantContext;
  userId: string;
}

/**
 * Assessments AS-1 (answers 2009, 2010, 2017): the question bank's review, versions and translations, on the existing
 * question engine (QuestionsService writes the question; this service decides when).
 *
 * - A new question starts as a draft nobody can use. Its author submits it; another person approves it (a collection in
 *   asmt.bank.second_approver_collections needs a second approver, a third person). AI drafts are reviewed like any
 *   other: their author is the person who asked for them.
 * - A change to an approved question is a revision; the question in use stays as it is until the revision is approved.
 *   A big change (text, options, answer key) makes the next version; old attempts keep theirs (the version approved
 *   before they started) and item statistics count only answers to the new one.
 * - Submitting checks alt text (every image) and looks for a possible duplicate (asmt.bank.duplicate_percent); a
 *   reviewer confirms "not a duplicate" before approving.
 * - Translations (asmt.languages, none besides English by default) are per version, each reviewed by another person.
 * Every step is audited. The database also refuses a reviewer who is the author.
 */
@Injectable()
export class QuestionBankService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly questions: QuestionsService,
  ) {}

  private tx<T>(w: Who, fn: (tx: Tx, org: string) => Promise<T>) {
    return this.tenantPrisma.forTenant(w.ctx, (tx) => fn(tx, w.ctx.organizationId as string));
  }

  /** A company setting's value (company scope; its default when not set). */
  private async setting(tx: Tx, org: string, key: keyof typeof SETTINGS & string): Promise<string> {
    const rows = await tx.setting.findMany({ where: { organizationId: org, key } });
    return String(resolveSetting(SETTINGS[key], rows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: r.validFrom ? r.validFrom.toISOString().slice(0, 10) : null })), { tenant: org }, null).value);
  }

  async settings(w: Who) {
    return this.tx(w, async (tx, org) => ({
      languages: (await this.setting(tx, org, 'asmt.languages')).split(',').filter((l): l is BankLanguage => (BANK_LANGUAGES as readonly string[]).includes(l)),
      secondApproverCollections: this.commaList(await this.setting(tx, org, 'asmt.bank.second_approver_collections')),
      duplicatePercent: Number(await this.setting(tx, org, 'asmt.bank.duplicate_percent')),
      provisionalAnswers: Number(await this.setting(tx, org, 'asmt.item_stats.provisional_answers')),
      packs: this.commaList(await this.setting(tx, org, 'asmt.packs')),
    }));
  }

  private commaList(v: string) {
    return v.split(',').map((x) => x.trim()).filter(Boolean);
  }

  private async row(tx: Tx, org: string, id: string): Promise<Row> {
    const r = await tx.question.findFirst({ where: { id, organizationId: org }, include: { options: { orderBy: { orderIndex: 'asc' } }, tags: { include: { tag: true } } } });
    if (!r) throw new NotFoundException('No such question.');
    return r;
  }

  /** The question as it stands (stored image addresses, never signed ones). */
  private contentOf(r: Row): QuestionContent {
    let allowed: string[] | undefined;
    try {
      allowed = r.allowedLanguages ? (JSON.parse(r.allowedLanguages) as string[]) : undefined;
    } catch {
      allowed = undefined;
    }
    return {
      type: r.type,
      text: r.text,
      topic: r.topic,
      category: r.category,
      difficulty: r.difficulty,
      marks: r.marks,
      negativeMarks: r.negativeMarks,
      partialCredit: r.partialCredit,
      tags: r.tags.map((t) => t.tag.name).sort(),
      languageMode: r.languageMode,
      allowedLanguages: allowed,
      starterCode: r.starterCode,
      allowStdin: r.allowStdin,
      modelAnswer: r.modelAnswer,
      snippetCode: r.snippetCode,
      snippetLanguage: r.snippetLanguage,
      imageUrl: r.imageUrl,
      imageAlt: r.imageAlt,
      options: r.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, imageUrl: o.imageUrl })),
      optionAlts: Array.isArray(r.optionAlts) ? (r.optionAlts as (string | null)[]) : [],
      codeTests: r.codeTestsJson ? (JSON.parse(r.codeTestsJson) as QuestionContent['codeTests']) : undefined,
    };
  }

  /** The existing question payload for QuestionsService, from proposed content. */
  private dtoOf(c: QuestionContent): CreateQuestionDto {
    return {
      type: c.type,
      text: c.text,
      topic: c.topic ?? undefined,
      category: c.category ?? undefined,
      difficulty: c.difficulty,
      marks: c.marks,
      negativeMarks: c.negativeMarks ?? 0,
      partialCredit: c.partialCredit ?? false,
      tags: c.tags ?? [],
      languageMode: c.languageMode,
      allowedLanguages: c.allowedLanguages,
      starterCode: c.starterCode ?? undefined,
      allowStdin: c.allowStdin ?? false,
      modelAnswer: c.modelAnswer ?? undefined,
      snippetCode: c.snippetCode ?? undefined,
      snippetLanguage: c.snippetLanguage ?? undefined,
      imageUrl: c.imageUrl ?? undefined,
      options: c.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, imageUrl: o.imageUrl ?? undefined })),
      codeTests: c.codeTests?.map((t) => ({ ...t })),
    } as CreateQuestionDto;
  }

  /**
   * Changes a revision only if nobody changed it since it was read (its row version): two reviewers pressing at once
   * cannot both act on it.
   */
  private async claim(tx: Tx, id: string, rowVersion: number, data: Prisma.QuestionRevisionUpdateManyMutationInput) {
    const { count } = await tx.questionRevision.updateMany({ where: { id, rowVersion }, data: { ...data, rowVersion: { increment: 1 } } });
    if (!count) throw new ConflictException('This change was updated; reload it.');
  }

  /** A reviewer's comments per field: a few short notes, nothing else. */
  private comments(c: Record<string, unknown>): Record<string, string> {
    const e = Object.entries(c);
    if (e.length > 30 || e.some(([k, v]) => k.length > 50 || typeof v !== 'string' || v.length > 1000)) throw new BadRequestException('Comments: up to 30 fields, 1,000 characters each.');
    return c as Record<string, string>;
  }

  private async names(tx: Tx, ids: (string | null | undefined)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const users = await tx.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true, email: true } });
    return new Map(users.map((u) => [u.id, u.name || u.email]));
  }

  // ---------------------------------------------------------------------------------------------- the bank (PRC-01)

  /** Every question with its review state, version and approved languages. */
  async list(w: Who, q: { status?: 'draft' | 'in_review' | 'approved' | 'retired'; collection?: string; search?: string }) {
    return this.tx(w, async (tx, org) => {
      const rows = await tx.question.findMany({
        where: { organizationId: org, ...(q.collection ? { category: q.collection } : {}), ...(q.search ? { text: { contains: q.search, mode: 'insensitive' } } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: { id: true, text: true, type: true, topic: true, category: true, difficulty: true, status: true, version: true, aiGenerated: true, createdAt: true, lastApprovedAt: true, revisions: { where: { state: { in: OPEN } }, select: { state: true, kind: true } }, translations: { where: { state: 'approved' }, select: { language: true, version: true } } },
      });
      const out = rows.map((r) => {
        const open = r.revisions[0];
        const status = r.status === 'archived' ? 'retired' : open?.state === 'in_review' ? 'in_review' : r.status === 'active' ? 'approved' : 'draft';
        return {
          id: r.id,
          text: r.text,
          type: r.type,
          topic: r.topic,
          collection: r.category,
          difficulty: r.difficulty,
          status,
          version: r.version,
          openChange: open ? { state: open.state, kind: open.kind } : null,
          languages: ['en', ...r.translations.filter((t) => t.version === r.version).map((t) => t.language)],
          aiDrafted: r.aiGenerated,
          updatedAt: (r.lastApprovedAt ?? r.createdAt).toISOString(),
        };
      });
      return q.status ? out.filter((r) => r.status === q.status) : out;
    });
  }

  /** One question for its writer: content (with the answer key), the open change, versions, translations. */
  async get(w: Who, id: string) {
    const out = await this.read(w, id);
    // Answer 2143: the candidate preview shows the images through short-lived signed links, keyed by the stored value
    // (the content keeps the stored value, so saving never writes a link back).
    const stored = [out.content, out.openChange?.content].flatMap((c) => (c ? [c.imageUrl, ...c.options.map((o) => o.imageUrl)] : [])).filter((u): u is string => Boolean(u));
    const images: Record<string, string> = {};
    for (const u of new Set(stored)) {
      const signed = await this.questions.signedImage(u);
      if (signed) images[u] = signed;
    }
    return { ...out, images };
  }

  private async read(w: Who, id: string) {
    return this.tx(w, async (tx, org) => {
      const r = await this.row(tx, org, id);
      const revisions = await tx.questionRevision.findMany({ where: { questionId: id, organizationId: org }, orderBy: { createdAt: 'desc' } });
      const translations = await tx.questionTranslation.findMany({ where: { questionId: id, organizationId: org }, orderBy: [{ version: 'desc' }, { language: 'asc' }] });
      const people = await this.names(tx, [r.createdBy, r.lastApprovedBy, ...revisions.flatMap((v) => [v.authorId, v.reviewerId, v.secondReviewerId]), ...translations.flatMap((t) => [t.authorId, t.reviewerId])]);
      const open = revisions.find((v) => OPEN.includes(v.state)) ?? null;
      return {
        id: r.id,
        status: r.status === 'archived' ? 'retired' : open?.state === 'in_review' ? 'in_review' : r.status === 'active' ? 'approved' : 'draft',
        version: r.version,
        aiDrafted: r.aiGenerated,
        author: people.get(r.createdBy) ?? null,
        approvedBy: r.lastApprovedBy ? people.get(r.lastApprovedBy) ?? null : null,
        approvedAt: r.lastApprovedAt?.toISOString() ?? null,
        content: this.contentOf(r),
        openChange: open && { id: open.id, kind: open.kind, state: open.state, version: open.version, content: open.content as unknown as QuestionContent, mine: open.authorId === w.userId, note: open.note, fieldComments: open.fieldComments, duplicate: open.duplicatePercent != null ? { percent: open.duplicatePercent, questionId: open.duplicateOf, cleared: Boolean(open.duplicateClearedBy) } : null, rowVersion: open.rowVersion },
        history: revisions.map((v) => ({ id: v.id, kind: v.kind, state: v.state, version: v.version, author: people.get(v.authorId) ?? '', reviewer: v.reviewerId ? people.get(v.reviewerId) ?? '' : null, secondReviewer: v.secondReviewerId ? people.get(v.secondReviewerId) ?? '' : null, at: (v.secondReviewedAt ?? v.reviewedAt ?? v.submittedAt ?? v.createdAt).toISOString(), note: v.note })),
        translations: translations.map((t) => ({ id: t.id, language: t.language, version: t.version, state: t.state, text: t.text, options: t.options, aiAssisted: t.aiAssisted, author: people.get(t.authorId) ?? '', reviewer: t.reviewerId ? people.get(t.reviewerId) ?? null : null, mine: t.authorId === w.userId, note: t.note, rowVersion: t.rowVersion })),
      };
    });
  }

  // ---------------------------------------------------------------------------------------------- writing (PRC-02)

  /** A new question: a draft nobody can use until it is submitted and approved by another person. */
  async create(w: Who, raw: QuestionContent) {
    const c = normalized(raw);
    const q = await this.questions.create(w.ctx, w.userId, this.dtoOf(c), { status: 'draft' });
    await this.tx(w, (tx) => tx.question.update({ where: { id: q.id }, data: { imageAlt: c.imageAlt ?? null, optionAlts: (c.optionAlts ?? []) as Prisma.InputJsonValue } }));
    return { id: q.id };
  }

  /**
   * Saving: a draft that was never approved is changed in place. An approved question is never changed here: the change
   * becomes (or updates) its open revision, big or small, and the question in use stays until it is approved.
   */
  async save(w: Who, id: string, raw: QuestionContent) {
    const c = normalized(raw);
    const r = await this.tx(w, (tx, org) => this.row(tx, org, id));
    if (r.status === 'archived') throw new ConflictException('This question is retired.');
    const open = await this.tx(w, (tx, org) => tx.questionRevision.findFirst({ where: { questionId: id, organizationId: org, state: { in: OPEN } } }));
    if (open && open.authorId !== w.userId) throw new ConflictException('Someone else is changing this question; their change is waiting.');
    if (open?.state === 'in_review') throw new ConflictException('This change is in review. Withdraw it to change it again.');
    if (r.status === 'draft' && !r.lastApprovedAt) {
      // Four eyes: whoever approves a new question must not have written any of it, so only its author changes a draft.
      if (r.createdBy !== w.userId) throw new ForbiddenException('Only the question’s author changes a draft. Ask for changes in review instead.');
      await this.questions.update(w.ctx, w.userId, id, this.dtoOf(c));
      await this.tx(w, async (tx) => {
        await tx.question.update({ where: { id }, data: { imageAlt: c.imageAlt ?? null, optionAlts: (c.optionAlts ?? []) as Prisma.InputJsonValue } });
        if (open) await tx.questionRevision.update({ where: { id: open.id }, data: { state: 'draft', content: c as unknown as Prisma.InputJsonValue, rowVersion: { increment: 1 } } });
      });
      return { saved: 'draft' as const };
    }
    const before = normalized(this.contentOf(r));
    if (!changedFields(before, c).length) throw new BadRequestException('Nothing has changed.');
    const major = isMajorChange(before, c);
    return this.tx(w, async (tx, org) => {
      const data = { kind: major ? 'major' : 'minor', version: major ? r.version + 1 : r.version, content: c as unknown as Prisma.InputJsonValue, state: 'draft' };
      if (open) await tx.questionRevision.update({ where: { id: open.id }, data: { ...data, rowVersion: { increment: 1 } } });
      else await tx.questionRevision.create({ data: { organizationId: org, questionId: id, authorId: w.userId, ...data } });
      await AuditService.recordIn(tx, w.ctx, { actorUserId: w.userId, action: 'question.change_drafted', entityType: 'question', entityId: id, metadata: { kind: data.kind, version: data.version } });
      return { saved: data.kind as 'major' | 'minor', version: data.version };
    });
  }

  /** Submit for review: alt text on every image, and a possible duplicate found (a reviewer must clear it). */
  async submit(w: Who, id: string) {
    return this.tx(w, async (tx, org) => {
      const r = await this.row(tx, org, id);
      let open = await tx.questionRevision.findFirst({ where: { questionId: id, organizationId: org, state: { in: OPEN } } });
      if (open && open.authorId !== w.userId) throw new ForbiddenException('Only the person who made this change submits it.');
      if (open?.state === 'in_review') throw new ConflictException('This is already in review.');
      if (!open) {
        if (r.status !== 'draft') throw new BadRequestException('Change the question first; then submit the change.');
        if (r.createdBy !== w.userId) throw new ForbiddenException('Only the question’s author submits it.');
        open = await tx.questionRevision.create({ data: { organizationId: org, questionId: id, authorId: w.userId, kind: 'new', version: 1, content: this.contentOf(r) as unknown as Prisma.InputJsonValue } });
      }
      const content = open.content as unknown as QuestionContent;
      const missing = missingAltText(content);
      if (missing.length) throw new BadRequestException(`Add alt text to ${missing.join(' and ')} before you submit.`);
      const threshold = Number(await this.setting(tx, org, 'asmt.bank.duplicate_percent'));
      const others = await tx.question.findMany({ where: { organizationId: org, id: { not: id }, status: { in: ['draft', 'active'] } }, select: { id: true, text: true }, take: 20_000 });
      const dup = closestDuplicate(content.text, others, threshold);
      const needsSecond = content.category ? this.commaList(await this.setting(tx, org, 'asmt.bank.second_approver_collections')).map((x) => x.toLowerCase()).includes(content.category.toLowerCase()) : false;
      await tx.questionRevision.update({ where: { id: open.id }, data: { state: 'in_review', submittedAt: new Date(), needsSecond, duplicateOf: dup?.id ?? null, duplicatePercent: dup?.percent ?? null, duplicateClearedBy: null, reviewerId: null, reviewedAt: null, rowVersion: { increment: 1 } } });
      await AuditService.recordIn(tx, w.ctx, { actorUserId: w.userId, action: 'question.submitted', entityType: 'question', entityId: id, metadata: { revision: open.id, kind: open.kind, version: open.version, duplicatePercent: dup?.percent ?? null, needsSecond } });
      return { state: 'in_review' as const, duplicate: dup, needsSecond };
    });
  }

  /** The author takes their change back (it can be changed again, or dropped). */
  async withdraw(w: Who, id: string) {
    return this.tx(w, async (tx, org) => {
      const open = await tx.questionRevision.findFirst({ where: { questionId: id, organizationId: org, state: { in: OPEN } } });
      if (!open) throw new NotFoundException('There is no change to withdraw.');
      if (open.authorId !== w.userId) throw new ForbiddenException('Only the person who made this change withdraws it.');
      await tx.questionRevision.update({ where: { id: open.id }, data: { state: open.kind === 'new' ? 'draft' : 'withdrawn', submittedAt: null, rowVersion: { increment: 1 } } });
      await AuditService.recordIn(tx, w.ctx, { actorUserId: w.userId, action: 'question.change_withdrawn', entityType: 'question', entityId: id, metadata: { revision: open.id } });
    });
  }

  // ---------------------------------------------------------------------------------------------- review (PRC-03)

  /** What waits for this person: changes in review by someone else (a second approval: not the first approver). */
  async queue(w: Who) {
    return this.tx(w, async (tx, org) => {
      const rows = await tx.questionRevision.findMany({ where: { organizationId: org, state: 'in_review', authorId: { not: w.userId } }, orderBy: { submittedAt: 'asc' }, include: { question: { include: { options: { orderBy: { orderIndex: 'asc' } }, tags: { include: { tag: true } } } } } });
      const mine = rows.filter((r) => r.reviewerId !== w.userId);
      const dupIds = mine.map((r) => r.duplicateOf).filter((x): x is string => Boolean(x));
      const dups = new Map((await tx.question.findMany({ where: { organizationId: org, id: { in: dupIds } }, select: { id: true, text: true } })).map((q) => [q.id, q.text]));
      const people = await this.names(tx, mine.flatMap((r) => [r.authorId, r.reviewerId]));
      const translations = await tx.questionTranslation.findMany({ where: { organizationId: org, state: 'in_review', authorId: { not: w.userId } }, include: { question: { select: { text: true, options: { orderBy: { orderIndex: 'asc' }, select: { text: true } } } } }, orderBy: { updatedAt: 'asc' } });
      const tPeople = await this.names(tx, translations.map((t) => t.authorId));
      return {
        changes: mine.map((r) => {
          const before = r.kind === 'new' ? null : this.contentOf(r.question);
          const after = r.content as unknown as QuestionContent;
          return {
            id: r.id,
            questionId: r.questionId,
            kind: r.kind,
            fromVersion: r.kind === 'new' ? null : r.question.version,
            toVersion: r.version,
            author: people.get(r.authorId) ?? '',
            aiDrafted: r.question.aiGenerated,
            submittedAt: r.submittedAt!.toISOString(),
            before,
            after,
            changed: before ? changedFields(before, after) : [],
            duplicate: r.duplicatePercent != null ? { percent: r.duplicatePercent, questionId: r.duplicateOf, text: r.duplicateOf ? dups.get(r.duplicateOf) ?? '' : '', cleared: Boolean(r.duplicateClearedBy) } : null,
            secondApproval: r.needsSecond ? { firstBy: r.reviewerId ? people.get(r.reviewerId) ?? '' : null } : null,
            rowVersion: r.rowVersion,
          };
        }),
        translations: translations.map((t) => ({ id: t.id, questionId: t.questionId, language: t.language, version: t.version, english: { text: t.question.text, options: t.question.options.map((o) => o.text) }, text: t.text, options: t.options, aiAssisted: t.aiAssisted, author: tPeople.get(t.authorId) ?? '', submittedAt: t.updatedAt.toISOString(), rowVersion: t.rowVersion })),
      };
    });
  }

  private async openForReview(tx: Tx, org: string, revisionId: string, w: Who, rowVersion: number) {
    const r = await tx.questionRevision.findFirst({ where: { id: revisionId, organizationId: org } });
    if (!r) throw new NotFoundException('No such change.');
    if (r.state !== 'in_review') throw new ConflictException('This change is not waiting for review.');
    if (r.rowVersion !== rowVersion) throw new ConflictException('This change was updated; reload it.');
    if (r.authorId === w.userId) throw new ForbiddenException('You made this change: another person reviews it.');
    return r;
  }

  /** "Not a duplicate": a reviewer confirms after comparing; only then can it be approved. */
  async clearDuplicate(w: Who, revisionId: string, rowVersion: number) {
    return this.tx(w, async (tx, org) => {
      const r = await this.openForReview(tx, org, revisionId, w, rowVersion);
      if (r.duplicatePercent == null) throw new BadRequestException('No possible duplicate was found for this change.');
      await this.claim(tx, r.id, rowVersion, { duplicateClearedBy: w.userId });
      await AuditService.recordIn(tx, w.ctx, { actorUserId: w.userId, action: 'question.duplicate_cleared', entityType: 'question', entityId: r.questionId, metadata: { revision: r.id, duplicateOf: r.duplicateOf, percent: r.duplicatePercent } });
    });
  }

  /**
   * Approve: another person (and, for a collection that needs it, a third). The last approval puts the change into the
   * question through the existing engine: a new question becomes usable; a big change makes the next version.
   */
  async approve(w: Who, revisionId: string, rowVersion: number, raw: Record<string, unknown> = {}) {
    const comments = this.comments(raw);
    const step = await this.tx(w, async (tx, org) => {
      const r = await this.openForReview(tx, org, revisionId, w, rowVersion);
      if (r.duplicatePercent != null && !r.duplicateClearedBy) throw new ConflictException('Confirm "not a duplicate" first.');
      const content = r.content as unknown as QuestionContent;
      const missing = missingAltText(content);
      if (missing.length) throw new ConflictException(`Alt text is missing on ${missing.join(' and ')}.`);
      if (r.needsSecond && !r.reviewerId) {
        await this.claim(tx, r.id, rowVersion, { reviewerId: w.userId, reviewedAt: new Date(), fieldComments: comments as Prisma.InputJsonValue });
        await AuditService.recordIn(tx, w.ctx, { actorUserId: w.userId, action: 'question.first_approval', entityType: 'question', entityId: r.questionId, metadata: { revision: r.id } });
        return { done: false as const, r };
      }
      if (r.needsSecond && r.reviewerId === w.userId) throw new ForbiddenException('You gave the first approval: another person gives the second.');
      // Hold the change for this approval before the question changes (a second reviewer now gets "reload it").
      await this.claim(tx, r.id, rowVersion, {});
      return { done: true as const, r };
    });
    if (!step.done) return { state: 'in_review' as const, waitingFor: 'second approval' };
    const r = step.r;
    const content = r.content as unknown as QuestionContent;
    // The question in use changes only now, through the existing engine (its checks, the answer-key stamp).
    await this.questions.update(w.ctx, w.userId, r.questionId, this.dtoOf(content));
    return this.tx(w, async (tx) => {
      const now = new Date();
      await tx.question.update({
        where: { id: r.questionId },
        data: { status: 'active', version: r.version, imageAlt: content.imageAlt ?? null, optionAlts: (content.optionAlts ?? []) as Prisma.InputJsonValue, lastApprovedBy: w.userId, lastApprovedAt: now, ...(r.kind === 'major' ? { answerKeyChangedAt: now } : {}) },
      });
      await this.claim(tx, r.id, rowVersion + 1, { state: 'approved', ...(r.needsSecond ? { secondReviewerId: w.userId, secondReviewedAt: now } : { reviewerId: w.userId, reviewedAt: now, fieldComments: comments as Prisma.InputJsonValue }) });
      await AuditService.recordIn(tx, w.ctx, { actorUserId: w.userId, action: 'question.approved', entityType: 'question', entityId: r.questionId, metadata: { revision: r.id, kind: r.kind, version: r.version, author: r.authorId } });
      return { state: 'approved' as const, version: r.version };
    });
  }

  /** Ask for changes, with a note and comments per field; the author is told in the app. */
  async requestChanges(w: Who, revisionId: string, rowVersion: number, note: string, raw: Record<string, unknown> = {}) {
    const comments = this.comments(raw);
    return this.tx(w, async (tx, org) => {
      const r = await this.openForReview(tx, org, revisionId, w, rowVersion);
      await this.claim(tx, r.id, rowVersion, { state: 'changes_requested', note, fieldComments: comments as Prisma.InputJsonValue, reviewerId: null, reviewedAt: null });
      await tx.userNotification.create({ data: { organizationId: org, recipientUserId: r.authorId, actorUserId: w.userId, type: 'asmt.question.changes_requested', entityType: 'question', entityId: r.questionId, contextText: note.slice(0, 500), linkPath: `/yx/hiring/assessments/questions/${r.questionId}` } });
      await AuditService.recordIn(tx, w.ctx, { actorUserId: w.userId, action: 'question.changes_requested', entityType: 'question', entityId: r.questionId, metadata: { revision: r.id, note } });
    });
  }

  // ---------------------------------------------------------------------------------------------- translations

  private async language(tx: Tx, org: string, language: string): Promise<BankLanguage> {
    const on = (await this.setting(tx, org, 'asmt.languages')).split(',');
    if (!(BANK_LANGUAGES as readonly string[]).includes(language) || !on.includes(language)) throw new BadRequestException('This language is not switched on for questions (Settings › Assessments).');
    return language as BankLanguage;
  }

  /** Write (or change) a translation of the question's current version; it stays a draft until submitted. */
  async saveTranslation(w: Who, id: string, language: string, t: { text: string; options: string[]; aiAssisted?: boolean }) {
    return this.tx(w, async (tx, org) => {
      const lang = await this.language(tx, org, language);
      const r = await this.row(tx, org, id);
      if (r.status !== 'active') throw new ConflictException('Translate an approved question.');
      if (t.options.length !== r.options.length) throw new BadRequestException(`Translate all ${r.options.length} options, in the same order.`);
      const existing = await tx.questionTranslation.findUnique({ where: { questionId_version_language: { questionId: id, version: r.version, language: lang } } });
      if (existing?.state === 'in_review') throw new ConflictException('This translation is in review.');
      const data = { text: t.text, options: t.options as Prisma.InputJsonValue, aiAssisted: Boolean(t.aiAssisted), state: 'draft', authorId: w.userId, reviewerId: null, reviewedAt: null, note: null };
      if (existing) await tx.questionTranslation.update({ where: { id: existing.id }, data: { ...data, rowVersion: { increment: 1 } } });
      else await tx.questionTranslation.create({ data: { organizationId: org, questionId: id, version: r.version, language: lang, ...data } });
      await AuditService.recordIn(tx, w.ctx, { actorUserId: w.userId, action: 'question.translation_drafted', entityType: 'question', entityId: id, metadata: { language: lang, version: r.version, aiAssisted: Boolean(t.aiAssisted) } });
    });
  }

  async submitTranslation(w: Who, id: string, language: string) {
    return this.tx(w, async (tx, org) => {
      const lang = await this.language(tx, org, language);
      const r = await this.row(tx, org, id);
      const t = await tx.questionTranslation.findUnique({ where: { questionId_version_language: { questionId: id, version: r.version, language: lang } } });
      if (!t || !['draft', 'changes_requested'].includes(t.state)) throw new ConflictException('There is no translation draft to submit.');
      if (t.authorId !== w.userId) throw new ForbiddenException('Only its writer submits a translation.');
      await tx.questionTranslation.update({ where: { id: t.id }, data: { state: 'in_review', rowVersion: { increment: 1 } } });
      await AuditService.recordIn(tx, w.ctx, { actorUserId: w.userId, action: 'question.translation_submitted', entityType: 'question', entityId: id, metadata: { language: lang, version: r.version } });
    });
  }

  /** A person other than its writer approves a translation, or asks for changes (answer 2010). */
  async decideTranslation(w: Who, translationId: string, rowVersion: number, approve: boolean, note?: string) {
    return this.tx(w, async (tx, org) => {
      const t = await tx.questionTranslation.findFirst({ where: { id: translationId, organizationId: org } });
      if (!t) throw new NotFoundException('No such translation.');
      if (t.state !== 'in_review') throw new ConflictException('This translation is not waiting for review.');
      if (t.rowVersion !== rowVersion) throw new ConflictException('This translation was updated; reload it.');
      if (t.authorId === w.userId) throw new ForbiddenException('You wrote this translation: another person reviews it.');
      if (!approve && !note?.trim()) throw new BadRequestException('Say what to change.');
      const { count } = await tx.questionTranslation.updateMany({ where: { id: t.id, rowVersion }, data: approve ? { state: 'approved', reviewerId: w.userId, reviewedAt: new Date(), rowVersion: { increment: 1 } } : { state: 'changes_requested', note: note!.trim(), rowVersion: { increment: 1 } } });
      if (!count) throw new ConflictException('This translation was updated; reload it.');
      await AuditService.recordIn(tx, w.ctx, { actorUserId: w.userId, action: approve ? 'question.translation_approved' : 'question.translation_changes_requested', entityType: 'question', entityId: t.questionId, metadata: { language: t.language, version: t.version } });
    });
  }
}
