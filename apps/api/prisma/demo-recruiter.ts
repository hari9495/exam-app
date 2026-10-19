import { PrismaClient, Prisma } from '@prisma/client';

// Recruiter demo for the YukthiX Home (founder decision 19 Oct 2026): gives Neha (recruiter@demo-org.test) two open jobs
// she created and manages, five candidates at different stages (one waiting 10 days), an interview today with her on
// the panel and a draft offer for her to send. Runs as the company (RLS context of demo-org, as Neha), never as the
// platform, and finds before it creates, so running it again changes nothing but today's interview time.
//   npm run demo:recruiter            (DATABASE_URL picks the database; never point it at someone else's)
const prisma = new PrismaClient();
const ORG_SLUG = 'demo-org';
const RECRUITER = 'recruiter@demo-org.test';
const JOBS = ['Quality Analyst', 'Plant Engineer'];
// [name, email, job, stage index (0 = first stage), days in that stage]
const PEOPLE: [string, string, number, number, number][] = [
  ['Ananya Kulkarni', 'ananya.demo@example.test', 0, 2, 2],
  ['Rohit Sharma', 'rohit.demo@example.test', 0, 0, 10],
  ['Meena Iyer', 'meena.demo@example.test', 0, 1, 3],
  ['Farhan Sheikh', 'farhan.demo@example.test', 1, 2, 1],
  ['Priya Menon', 'priya.demo@example.test', 1, 3, 2],
];

// Today at 3:00 pm India time, for an hour.
function todayAtThree() {
  const ist = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const startsAt = new Date(`${ist}T15:00:00+05:30`);
  return { startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000) };
}

async function main() {
  // The organization and the recruiter are looked up as the platform (read only), then everything is written as Neha.
  const { orgId, nehaId } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = await tx.organization.findUnique({ where: { slug: ORG_SLUG }, select: { id: true } });
    if (!org) throw new Error(`No company with slug ${ORG_SLUG}: seed the database first.`);
    const neha = await tx.user.findFirst({ where: { organizationId: org.id, email: RECRUITER }, select: { id: true } });
    if (!neha) throw new Error(`${RECRUITER} not found: seed the database first.`);
    return { orgId: org.id, nehaId: neha.id };
  });

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org', ${orgId}, true), set_config('app.is_super_admin', 'off', true), set_config('app.current_user_id', ${nehaId}, true)`;
      const o = { organizationId: orgId };
      const pipeline = await tx.pipeline.findFirst({
        where: { ...o, isDefault: true },
        include: { stages: { where: { category: { not: 'rejected' } }, orderBy: { position: 'asc' }, include: { statuses: { orderBy: { position: 'asc' } } } } },
      });
      if (!pipeline || pipeline.stages.length < 4) throw new Error('demo-org has no default hiring pipeline: open Hiring › Jobs once, or seed it first.');

      const jobIds: string[] = [];
      for (const title of JOBS) {
        const found = await tx.job.findFirst({ where: { ...o, title, createdById: nehaId, deletedAt: null }, select: { id: true } });
        jobIds.push(found?.id ?? (await tx.job.create({ data: { ...o, title, status: 'open', createdById: nehaId, hiringManagerId: nehaId, pipelineId: pipeline.id, location: 'Hosur plant' } })).id);
      }

      const entries: string[] = [];
      for (const [name, email, job, stage, days] of PEOPLE) {
        const candidate = await tx.candidate.upsert({ where: { organizationId_email: { organizationId: orgId, email } }, create: { ...o, name, email }, update: {} });
        const statusId = pipeline.stages[stage].statuses[0].id;
        const at = new Date(Date.now() - days * 86_400_000);
        const entry = await tx.pipelineEntry.upsert({
          where: { jobId_candidateId: { jobId: jobIds[job], candidateId: candidate.id } },
          create: { ...o, jobId: jobIds[job], candidateId: candidate.id, enteredVia: 'manual', statusId, stageEnteredAt: at, createdAt: at },
          update: {},
        });
        entries.push(entry.id);
      }

      // Today's interview: Farhan, with Neha on the panel.
      const farhan = PEOPLE.findIndex((p) => p[0] === 'Farhan Sheikh');
      const entry = await tx.pipelineEntry.findUniqueOrThrow({ where: { id: entries[farhan] }, select: { id: true, candidateId: true } });
      const { startsAt, endsAt } = todayAtThree();
      const existing = await tx.interview.findFirst({ where: { ...o, pipelineEntryId: entry.id }, select: { id: true, confirmedSlotId: true } });
      if (existing?.confirmedSlotId) {
        await tx.interviewSlot.update({ where: { id: existing.confirmedSlotId }, data: { startsAt, endsAt } });
      } else {
        const iv = existing ?? (await tx.interview.create({ data: { ...o, pipelineEntryId: entry.id, candidateId: entry.candidateId, status: 'confirmed', location: 'Board room 2', timeZone: 'Asia/Kolkata', sentByUserId: nehaId } }));
        const slot = await tx.interviewSlot.create({ data: { ...o, interviewId: iv.id, startsAt, endsAt } });
        await tx.interview.update({ where: { id: iv.id }, data: { status: 'confirmed', confirmedSlotId: slot.id } });
        if (!(await tx.interviewPanelist.findFirst({ where: { ...o, interviewId: iv.id, userId: nehaId } }))) await tx.interviewPanelist.create({ data: { ...o, interviewId: iv.id, userId: nehaId } });
      }

      // A draft offer for Priya (offer stage), waiting for Neha to send it.
      const priya = PEOPLE.findIndex((p) => p[0] === 'Priya Menon');
      const offerEntry = await tx.pipelineEntry.findUniqueOrThrow({ where: { id: entries[priya] }, select: { id: true, candidateId: true } });
      if (!(await tx.offer.findFirst({ where: { ...o, pipelineEntryId: offerEntry.id }, select: { id: true } }))) {
        const start = new Date(Date.now() + 45 * 86_400_000);
        await tx.offer.create({
          data: {
            ...o,
            pipelineEntryId: offerEntry.id,
            candidateId: offerEntry.candidateId,
            compensation: '₹9,00,000 a year',
            startDate: start,
            expiresAt: new Date(Date.now() + 14 * 86_400_000),
            status: 'draft',
            letterSubject: 'Your offer from Kaveri Foods',
            letterBody: 'Dear Priya, we are happy to offer you the role of Plant Engineer.',
          } satisfies Prisma.OfferUncheckedCreateInput,
        });
      }
    },
    { timeout: 60_000 },
  );
}

main()
  .then(() => console.log(`Recruiter demo ready for ${RECRUITER}: 2 jobs, 5 candidates, an interview today, a draft offer.`))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
