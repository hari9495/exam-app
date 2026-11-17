import { Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { collusionClusters, isoWeek, timingText, weightedKappa, type WrongAnswers } from './integrity-reports-rules';

// AS-5 part 3 (PRC-20): a test's integrity reports for the people who review integrity. Collusion (identical wrong
// answers), code similarity (from the integrity analysis) and inter-rater agreement (the double marks of AS-6). Reports
// point reviewers at attempts; they never change a score. Exporting is audited.

const DONE = ['submitted', 'auto_submitted', 'force_submitted', 'pending_manual_grade'];
/** Identical wrong answers that link two attempts (shortcut: a constant until the founder asks for a company setting). */
const MIN_SAME = 5;
/** The agreement the chart draws as its target line (the design's 0.70). */
const KAPPA_TARGET = 0.7;

export interface IntegrityReportView {
  test: { id: string; title: string };
  attempts: number;
  minSame: number;
  clusters: { id: string; who: string[]; same: number; timing: string; incident: string }[];
  sizes: { size: '2' | '3' | '4' | '5+'; clusters: number }[];
  pairs: { pair: string; question: string; similarity: number }[];
  agreement: { weeks: { week: string; kappa: number }[]; target: number; markers: { pair: string; moderated: number; of: number }[]; doubleMarked: number };
}

@Injectable()
export class IntegrityReportsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async view(ctx: TenantContext, examId: string): Promise<IntegrityReportView> {
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId }, select: { id: true, title: true } });
      if (!exam) throw new NotFoundException('Test not found');
      const attempts = await tx.attempt.findMany({
        where: { examId, status: { in: DONE } },
        select: { id: true, startedAt: true, invitation: { select: { candidate: { select: { name: true, email: true } } } }, integrityAnalysis: { select: { flagsJson: true } }, integrityIncident: { select: { status: true } } },
        take: 20000,
      });
      const who = new Map(attempts.map((a) => [a.id, a.invitation.candidate.name?.trim() || a.invitation.candidate.email]));
      const incident = new Map(attempts.map((a) => [a.id, a.integrityIncident?.status ?? null]));

      // Collusion: the wrong choice answers of each submitted attempt.
      const wrong = await tx.answer.findMany({ where: { attempt: { examId, status: { in: DONE } }, isCorrect: false }, select: { attemptId: true, questionId: true, selectedOptionIdsJson: true } });
      const byAttempt = new Map<string, WrongAnswers>(attempts.map((a) => [a.id, { attemptId: a.id, startedAt: a.startedAt, wrong: new Map() }]));
      for (const w of wrong) {
        const picked = parseIds(w.selectedOptionIdsJson);
        if (picked.length) byAttempt.get(w.attemptId)?.wrong.set(w.questionId, [...picked].sort().join(','));
      }
      const found = collusionClusters([...byAttempt.values()], MIN_SAME);
      const clusters = found.map((c, i) => {
        const open = c.attemptIds.filter((id) => incident.get(id)).length;
        return { id: `CL-${String(i + 1).padStart(2, '0')}`, who: c.attemptIds.map((id) => who.get(id) ?? 'Candidate'), same: c.same, timing: timingText(c.startSpreadMinutes), incident: open ? `${open} of ${c.attemptIds.length} in review` : 'Not raised' };
      });
      const sizes = (['2', '3', '4', '5+'] as const).map((size) => ({ size, clusters: found.filter((c) => (size === '5+' ? c.attemptIds.length >= 5 : c.attemptIds.length === Number(size))).length }));

      // Code similarity: the matches the integrity analysis stored, one row per pair and question.
      const seen = new Set<string>();
      const raw: { a: string; b: string; questionId: string; similarity: number }[] = [];
      for (const a of attempts)
        for (const f of parseFlags(a.integrityAnalysis?.flagsJson ?? null)) {
          if (f.type !== 'similarity_match' || !f.counterpartAttemptId || !f.questionId || typeof f.similarity !== 'number' || !who.has(f.counterpartAttemptId)) continue;
          const key = `${[a.id, f.counterpartAttemptId].sort().join('|')}|${f.questionId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          raw.push({ a: a.id, b: f.counterpartAttemptId, questionId: f.questionId, similarity: f.similarity });
        }
      const questionIds = [...new Set(raw.map((r) => r.questionId))];

      // Agreement: the first two marks on each double-marked answer; a third mark means it was moderated.
      const marks = await tx.answerMark.findMany({ where: { attemptId: { in: attempts.map((a) => a.id) } }, select: { attemptId: true, questionId: true, markerUserId: true, round: true, marks: true, createdAt: true }, orderBy: { round: 'asc' }, take: 50000 });
      const byAnswer = new Map<string, typeof marks>();
      marks.forEach((m) => (byAnswer.get(`${m.attemptId}|${m.questionId}`) ?? byAnswer.set(`${m.attemptId}|${m.questionId}`, []).get(`${m.attemptId}|${m.questionId}`)!).push(m));
      const doubles = [...byAnswer.values()].filter((l) => l.some((m) => m.round === 1) && l.some((m) => m.round === 2));
      const markQuestionIds = [...new Set(doubles.map((l) => l[0]!.questionId))];
      const questions = await tx.question.findMany({ where: { id: { in: [...new Set([...questionIds, ...markQuestionIds])] } }, select: { id: true, text: true, marks: true } });
      const q = new Map(questions.map((x) => [x.id, x]));
      const pairs = raw
        .map((r) => ({ pair: `${who.get(r.a)} · ${who.get(r.b)}`, question: short(q.get(r.questionId)?.text ?? 'Question'), similarity: Math.round(r.similarity * 100) }))
        .sort((x, y) => y.similarity - x.similarity);

      const markers = await tx.user.findMany({ where: { id: { in: [...new Set(doubles.flatMap((l) => l.map((m) => m.markerUserId)))] } }, select: { id: true, name: true, email: true } });
      const markerName = new Map(markers.map((u) => [u.id, u.name?.trim() || u.email]));
      const weeks = new Map<string, { a: number; b: number; max: number }[]>();
      const markerPairs = new Map<string, { moderated: number; of: number }>();
      for (const l of doubles) {
        const one = l.find((m) => m.round === 1)!;
        const two = l.find((m) => m.round === 2)!;
        const week = isoWeek(two.createdAt);
        (weeks.get(week) ?? weeks.set(week, []).get(week)!).push({ a: one.marks, b: two.marks, max: q.get(one.questionId)?.marks ?? Math.max(one.marks, two.marks, 1) });
        const key = [markerName.get(one.markerUserId) ?? 'Marker', markerName.get(two.markerUserId) ?? 'Marker'].sort().join(' · ');
        const p = markerPairs.get(key) ?? { moderated: 0, of: 0 };
        p.of++;
        if (l.some((m) => m.round === 3)) p.moderated++;
        markerPairs.set(key, p);
      }
      const weekOrder = [...new Set(doubles.map((l) => l.find((m) => m.round === 2)!.createdAt).sort((a, b) => a.getTime() - b.getTime()).map(isoWeek))].slice(-8);
      return {
        test: exam,
        attempts: attempts.length,
        minSame: MIN_SAME,
        clusters,
        sizes,
        pairs,
        agreement: {
          weeks: weekOrder.map((week) => ({ week, kappa: weightedKappa(weeks.get(week)!) })).filter((w): w is { week: string; kappa: number } => w.kappa !== null),
          target: KAPPA_TARGET,
          markers: [...markerPairs.entries()].map(([pair, v]) => ({ pair, ...v })).filter((m) => m.moderated > 0).sort((a, b) => b.moderated - a.moderated),
          doubleMarked: doubles.length,
        },
      };
    });
  }

  /** The three reports as one workbook; who exported it is recorded. */
  async export(ctx: TenantContext, userId: string, examId: string): Promise<{ file: Buffer; name: string }> {
    const v = await this.view(ctx, examId);
    const book = new ExcelJS.Workbook();
    const sheet = (name: string, header: string[], rows: (string | number)[][]) => {
      const s = book.addWorksheet(name);
      s.addRow(header).font = { bold: true };
      rows.forEach((r) => s.addRow(r));
    };
    sheet('Collusion', ['Cluster', 'Candidates', 'Identical wrong answers', 'Timing', 'Incident'], v.clusters.map((c) => [c.id, c.who.join(', '), c.same, c.timing, c.incident]));
    sheet('Code similarity', ['Pair', 'Question', 'Similarity %'], v.pairs.map((p) => [p.pair, p.question, p.similarity]));
    sheet('Agreement', ['Week', 'Weighted kappa'], v.agreement.weeks.map((w) => [w.week, w.kappa]));
    await this.tenantPrisma.forTenant(ctx, (tx) => AuditService.recordIn(tx, ctx, { actorUserId: userId, action: 'asmt.integrity_report.exported', entityType: 'exam', entityId: examId, metadata: { clusters: v.clusters.length, pairs: v.pairs.length } }));
    return { file: Buffer.from(await book.xlsx.writeBuffer()), name: `integrity-reports-${examId.slice(0, 8)}.xlsx` };
  }
}

function parseIds(json: string): string[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function parseFlags(json: string | null): { type?: string; counterpartAttemptId?: string; questionId?: string; similarity?: number }[] {
  try {
    const v = JSON.parse(json ?? '[]') as unknown;
    return Array.isArray(v) ? (v as { type?: string }[]) : [];
  } catch {
    return [];
  }
}

const short = (t: string) => (t.length > 60 ? `${t.slice(0, 57)}…` : t);
