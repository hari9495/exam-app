/**
 * Seeds fixtures for the candidate spike test: one published exam, N candidates,
 * and N invitations, writing the redeem tokens to load/tokens.json.
 *
 * Run against the LOCAL database only. It creates a dedicated org so it can never
 * be confused with, or clean up over, real data.
 *
 *   node load/seed-load-fixtures.js 1000
 */
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const COUNT = Number(process.argv[2] ?? 200);
const ORG_SLUG = 'loadtest-org';
const QUESTION_COUNT = 5;

/**
 * Every tenant-scoped table is behind row-level security, so a bare PrismaClient sees
 * and writes nothing. The app sets the same two session-context keys in
 * TenantPrismaService; this mirrors it as super-admin because seeding legitimately
 * spans creating the org and then writing inside it.
 *
 * sp_set_session_context is scoped to the physical connection, so every statement has
 * to run inside one interactive transaction -- separate calls can land on different
 * pooled connections and silently lose the context.
 */
async function asSuperAdmin(prisma, fn) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_current_org', @value = NULL`;
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 1`;
      return fn(tx);
    },
    { timeout: 600_000, maxWait: 60_000 },
  );
}

async function main() {
  const prisma = new PrismaClient();
  const stamp = Date.now();

  const { exam, questionIds, tokens, org } = await asSuperAdmin(prisma, async (tx) => {
    // Organization.planId is required, so borrow whichever plan already exists rather
    // than inventing one -- this fixture must not change billing-shaped reference data.
    const plan = await tx.plan.findFirst();
    if (!plan) {
      throw new Error('No Plan rows exist; run the app seed first so a plan is available.');
    }

    const org =
      (await tx.organization.findFirst({ where: { slug: ORG_SLUG } })) ??
      (await tx.organization.create({
        data: { name: 'Load Test Org', slug: ORG_SLUG, region: 'local', planId: plan.id },
      }));

    // Exam.createdBy is required. This user exists only to own the fixture exam; it is
    // never logged into, so the password hash is a deliberately unusable placeholder.
    const owner =
      (await tx.user.findFirst({ where: { organizationId: org.id } })) ??
      (await tx.user.create({
        data: {
          organizationId: org.id,
          email: `load-owner@${ORG_SLUG}.invalid`,
          passwordHash: 'not-a-real-hash-load-fixture-only',
          role: 'recruiter',
          status: 'active',
        },
      }));

    const exam = await tx.exam.create({
      data: {
        organizationId: org.id,
        title: `Load Test Exam ${stamp}`,
        status: 'published',
        durationMinutes: 120,
        passCriteriaPercent: 40,
        createdBy: owner.id,
      },
    });

    const section = await tx.examSection.create({
      data: { examId: exam.id, title: 'Section One', orderIndex: 0, selectionMode: 'fixed' },
    });

    // Fixed-mode questions: deliberately simple, so the test measures request handling
    // rather than question-selection cost. A pool section would add randomisation work
    // to every single attempt start and confound the numbers.
    const questionIds = [];
    for (let q = 0; q < QUESTION_COUNT; q += 1) {
      const question = await tx.question.create({
        data: {
          organizationId: org.id,
          type: 'single_mcq',
          text: `Load test question ${q + 1}`,
          difficulty: 'easy',
          marks: 1,
          status: 'active',
          createdBy: owner.id,
          options: {
            create: [
              { text: 'Correct', isCorrect: true, orderIndex: 0 },
              { text: 'Wrong', isCorrect: false, orderIndex: 1 },
            ],
          },
        },
      });
      questionIds.push(question.id);
      await tx.examSectionQuestion.create({
        data: { sectionId: section.id, questionId: question.id, orderIndex: q },
      });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const tokens = [];

    // Batched so a large N does not open thousands of simultaneous statements against
    // SQL Server -- seeding is setup, not the thing under test.
    const BATCH = 50;
    for (let start = 0; start < COUNT; start += BATCH) {
      const size = Math.min(BATCH, COUNT - start);
      await Promise.all(
        Array.from({ length: size }, async (_, offset) => {
          const n = start + offset;
          const candidate = await tx.candidate.create({
            data: {
              organizationId: org.id,
              email: `load-${stamp}-${n}@loadtest.invalid`,
              name: `Load Candidate ${n}`,
              status: 'active',
            },
          });
          const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
          await tx.invitation.create({
            data: {
              examId: exam.id,
              candidateId: candidate.id,
              token,
              status: 'invited',
              expiresAt,
            },
          });
          tokens.push(token);
        }),
      );
      process.stdout.write(`\rseeded ${Math.min(start + BATCH, COUNT)}/${COUNT}`);
    }

    return { exam, questionIds, tokens, org };
  });

  const out = { examId: exam.id, organizationId: org.id, questionIds, tokens, seededAt: stamp };
  fs.writeFileSync(path.join(__dirname, 'tokens.json'), JSON.stringify(out, null, 2));
  console.log(`\nseeded exam ${exam.id} with ${tokens.length} invitations -> load/tokens.json`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
