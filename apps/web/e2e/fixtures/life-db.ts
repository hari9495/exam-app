import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

// Direct database set-up for the lifecycle 6f e2e (same database as the API under test): give a seeded employee a
// joining checklist that started a few days ago with one "read" step of their own, so My first 30 days can be shown
// without walking a whole joiner through pre-boarding (the API e2e covers that path). Undone after the test.

function databaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const env = readFileSync(join(__dirname, '../../../api/.env'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('Set E2E_DATABASE_URL or DATABASE_URL in apps/api/.env');
  return line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const addDays = (iso: string, n: number) => new Date(day(iso).getTime() + n * 86_400_000).toISOString().slice(0, 10);

async function asSuper<T>(fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>): Promise<T> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      return fn(tx);
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** A joining checklist anchored `daysAgo` days back for the employee who signs in as `email`; returns its id. */
export async function startFirstDays(email: string, daysAgo: number, stepTitle: string): Promise<string> {
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const anchor = addDays(today, -daysAgo);
  return asSuper(async (tx) => {
    const found = await tx.user.findFirstOrThrow({ where: { email } });
    const user = { ...found, organizationId: found.organizationId! };
    const emp = await tx.employee.findFirstOrThrow({ where: { userId: user.id } });
    const employment = await tx.employment.findFirstOrThrow({ where: { employeeId: emp.id, exitedOn: null } });
    const template = await tx.journeyTemplate.findFirstOrThrow({ where: { organizationId: user.organizationId, kind: 'onboarding' } });
    // The app role never deletes checklist rows, so a run reuses the one from the last run.
    const old = await tx.journey.findFirst({ where: { organizationId: user.organizationId, subjectType: 'employment', subjectId: employment.id, kind: 'onboarding' } });
    const data = { anchorOn: day(anchor), status: 'active', progress: 0 };
    const j = old
      ? await tx.journey.update({ where: { id: old.id }, data })
      : await tx.journey.create({ data: { organizationId: user.organizationId, kind: 'onboarding', personId: emp.personId, subjectType: 'employment', subjectId: employment.id, templateId: template.id, templateVersion: template.version, ...data } });
    const step = { title: stepTitle, kind: 'read', config: { text: 'Working hours, leave and holidays are in YukthiX under Time.' }, ownerType: 'person', assigneeUserId: user.id, dueOffsetDays: daysAgo, dueOn: day(today), required: false, sortOrder: 0, status: 'open', completedAt: null, completedBy: null };
    // Her own read step, and an HR step that keeps the checklist running after she reads (as a real one would).
    const hrStep = { title: 'Collect Form 11 (PF declaration)', kind: 'tick', config: {}, ownerType: 'hr', assigneeUserId: null, dueOffsetDays: 3, dueOn: day(addDays(anchor, 3)), required: true, sortOrder: 1, status: 'open', completedAt: null, completedBy: null };
    for (const [key, data] of [['welcome_read', { ...step, required: true }], ['hr_form_11', hrStep]] as const) {
      const t = await tx.journeyTask.findFirst({ where: { journeyId: j.id, key } });
      if (t) await tx.journeyTask.update({ where: { id: t.id }, data: { ...data, version: { increment: 1 } } });
      else await tx.journeyTask.create({ data: { organizationId: user.organizationId, journeyId: j.id, key, ...data } });
    }
    return j.id;
  });
}

/** Closes that checklist again, so the person's landing page is back to normal for other tests. */
export async function endFirstDays(journeyId: string): Promise<void> {
  await asSuper((tx) => tx.journey.update({ where: { id: journeyId }, data: { status: 'done' } }));
}
