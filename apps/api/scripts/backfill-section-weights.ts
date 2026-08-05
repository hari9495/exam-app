import { PrismaService } from '@exam-platform/shared';
import { computeDefaultWeights } from '../src/exams/section-weight-defaults';

// One-shot repair for environments whose exam_sections rows predate weightPercent (the column
// was added nullable, backfilled here, then made NOT NULL -- see
// docs/superpowers/plans/2026-08-05-section-weightage.md Tasks 1/3). Already run against
// production; kept for any local/dev database still sitting in the nullable window, where the
// NOT NULL migration would otherwise fail. Idempotent: a database with no NULL weights is a no-op.
async function main() {
  const prisma = new PrismaService();

  await prisma.$transaction(
    async (tx) => {
      // Bypass RLS: exam_sections isn't itself RLS-protected, but this query's nested
      // `question` include joins through the `questions` table, which IS RLS-protected
      // (see apps/api/prisma/migrations/20260707130003_question_bank_rls). With no session
      // context set, that join is silently filtered to zero rows -- no error, no warning.
      // Same pattern as apps/api/prisma/seed.ts main().
      await tx.$executeRawUnsafe(
        "EXEC sp_set_session_context @key=N'app_is_super_admin', @value=1",
      );

      // Raw, not `where: { weightPercent: null }`: once the follow-up NOT NULL migration lands,
      // the generated Prisma types no longer admit a null filter on this column, so the typed
      // form stops compiling -- even though a not-yet-migrated database can still hold NULLs,
      // which is exactly the case this script exists to repair.
      const nullRows = await tx.$queryRawUnsafe<{ id: string }[]>(
        'SELECT [id] FROM [dbo].[exam_sections] WHERE [weight_percent] IS NULL',
      );
      if (nullRows.length === 0) {
        console.log('Nothing to do: every exam_sections row already has a weight_percent.');
        return;
      }

      const sections = await tx.examSection.findMany({
        where: { id: { in: nullRows.map((row) => row.id) } },
        include: { questions: { include: { question: { select: { marks: true } } } } },
      });

      const byExamId = new Map<string, typeof sections>();
      for (const section of sections) {
        const list = byExamId.get(section.examId) ?? [];
        list.push(section);
        byExamId.set(section.examId, list);
      }

      let updated = 0;
      for (const [examId, examSections] of byExamId) {
        const weights = computeDefaultWeights(
          examSections.map((section) => ({
            id: section.id,
            selectionMode: section.selectionMode as 'fixed' | 'pool',
            totalMarks: section.questions.reduce((sum, link) => sum + link.question.marks, 0),
          })),
        );
        for (const section of examSections) {
          const weightPercent = weights.get(section.id) ?? 0;
          await tx.examSection.update({ where: { id: section.id }, data: { weightPercent } });
          updated += 1;
        }
        console.log(`Exam ${examId}: ${examSections.length} section(s) backfilled`);
      }
      console.log(`Done. ${updated} section(s) updated across ${byExamId.size} exam(s).`);
    },
    { timeout: 30000 },
  );

  await prisma.$disconnect();
}

main();
