import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantContext } from '@exam-platform/shared';
import { SETTINGS, resolveSetting } from '../../org-structure/settings-registry';
import { closestDuplicate, missingAltText, type QuestionContent } from './bank-rules';

// Assessments AS-1 and its follow-ups (answers 2009, 2121): the steps every way into the review queue shares, so the
// bank editor, bulk upload and AI drafts send a question for review the same way (alt text, duplicate check, second
// approver), inside the caller's transaction.

type Tx = Prisma.TransactionClient;
export type BankRow = Prisma.QuestionGetPayload<{ include: { options: true; tags: { include: { tag: true } } } }>;

/** A company setting's value (company scope; its default when not set). */
export async function companySetting(tx: Tx, org: string, key: keyof typeof SETTINGS & string): Promise<string> {
  const rows = await tx.setting.findMany({ where: { organizationId: org, key } });
  return String(resolveSetting(SETTINGS[key], rows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: r.validFrom ? r.validFrom.toISOString().slice(0, 10) : null })), { tenant: org }, null).value);
}

export const commaList = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

/** The question as it stands (stored image addresses, never signed ones). */
export function contentOf(r: BankRow): QuestionContent {
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
    options: [...r.options].sort((a, b) => a.orderIndex - b.orderIndex).map((o) => ({ text: o.text, isCorrect: o.isCorrect, imageUrl: o.imageUrl })),
    optionAlts: Array.isArray(r.optionAlts) ? (r.optionAlts as (string | null)[]) : [],
    codeTests: r.codeTestsJson ? (JSON.parse(r.codeTestsJson) as QuestionContent['codeTests']) : undefined,
  };
}

/**
 * Puts an open revision in review: every image has alt text (else 400), a possible duplicate is recorded for the
 * reviewer to clear, and a collection in asmt.bank.second_approver_collections needs a second approver. Audited.
 */
export async function sendForReview(tx: Tx, ctx: TenantContext, org: string, questionId: string, open: { id: string; kind: string; version: number; content: Prisma.JsonValue }, actorUserId: string, source: 'bank' | 'bulk_upload' | 'ai_draft' = 'bank') {
  const content = open.content as unknown as QuestionContent;
  const missing = missingAltText(content);
  if (missing.length) throw new BadRequestException(`Add alt text to ${missing.join(' and ')} before you submit.`);
  const threshold = Number(await companySetting(tx, org, 'asmt.bank.duplicate_percent'));
  const others = await tx.question.findMany({ where: { organizationId: org, id: { not: questionId }, status: { in: ['draft', 'active'] } }, select: { id: true, text: true }, take: 20_000 });
  const dup = closestDuplicate(content.text, others, threshold);
  const needsSecond = content.category ? commaList(await companySetting(tx, org, 'asmt.bank.second_approver_collections')).map((x) => x.toLowerCase()).includes(content.category.toLowerCase()) : false;
  await tx.questionRevision.update({ where: { id: open.id }, data: { state: 'in_review', submittedAt: new Date(), needsSecond, duplicateOf: dup?.id ?? null, duplicatePercent: dup?.percent ?? null, duplicateClearedBy: null, reviewerId: null, reviewedAt: null, rowVersion: { increment: 1 } } });
  await AuditService.recordIn(tx, ctx, { actorUserId, action: 'question.submitted', entityType: 'question', entityId: questionId, metadata: { revision: open.id, kind: open.kind, version: open.version, duplicatePercent: dup?.percent ?? null, needsSecond, source } });
  return { duplicate: dup, needsSecond };
}

/**
 * Answer 2121: a draft made by bulk upload or by AI goes straight into the review queue, with the person who uploaded or
 * asked for it as its author (so another person reviews it). The question itself stays a draft until approved.
 */
export async function queueNewQuestion(tx: Tx, ctx: TenantContext, org: string, questionId: string, authorId: string, source: 'bulk_upload' | 'ai_draft') {
  const r = await tx.question.findFirstOrThrow({ where: { id: questionId, organizationId: org }, include: { options: true, tags: { include: { tag: true } } } });
  const open = await tx.questionRevision.create({ data: { organizationId: org, questionId, authorId, kind: 'new', version: 1, content: contentOf(r) as unknown as Prisma.InputJsonValue } });
  return sendForReview(tx, ctx, org, questionId, open, authorId, source);
}
