import { PrismaClient } from '@prisma/client';
import { htmlToText } from '../../src/service-desk/rich-text';

// Demo help articles (Kaveri Foods, demo-org; founder 11 Nov 2026, answer 1035): the Help drawer's "This page" (answer
// 942) had nothing to show. Adds three published articles in an employee knowledge-base space, linked by `pages` to
// Home, My leave and the set-up hub. Each goes through the app's states: version 1 by an HR author, reviewed by a
// different person (four eyes), then published. Adds only; each write is audited as coming from this script. Safe to run
// again (an article already there with the same web address is left alone). Run from apps/api:
//   npx ts-node --transpile-only prisma/scripts/demo-help-articles.ts
const prisma = new PrismaClient();
const SOURCE = 'demo set-up script, founder 11 Nov 2026';

const ARTICLES = [
  {
    slug: 'getting-around-home',
    title: 'Getting around your Home page',
    summary: 'What the cards on Home show, and where to go next.',
    pages: ['/yx/home'],
    body: [
      'Home shows what needs you today. Requests waiting for your approval come first, then your own requests and anything new from HR.',
      'Each card opens the page where you can act on it. Your leave balance, your next payslip and your team, if you manage people, are one click away.',
      'Press Ctrl K at any time to search for a person, a page or a request. Press ? to see every shortcut.',
    ],
  },
  {
    slug: 'applying-for-leave',
    title: 'Applying for leave',
    summary: 'How to ask for leave, see your balance and follow your request.',
    pages: ['/yx/time/leave'],
    body: [
      'Open Time, then My leave. Choose Apply for leave, pick the leave type and the days, and say why if your company asks for a reason.',
      'Before you send it, the page shows your balance after this leave. If the days include a holiday or a weekly off, they are not counted.',
      'Your manager is told at once. You can follow the request under My requests, and cancel it while it is still waiting.',
    ],
  },
  {
    slug: 'using-the-set-up-hub',
    title: 'Using the set-up hub',
    summary: 'How the set-up hub shows what is left to set up in each area.',
    pages: ['/yx/settings/setup-hub'],
    body: [
      'The set-up hub shows, for each area, how much of its set-up is done. It reads what each area already holds, so it never asks you anything new.',
      'Blocking checks are the ones an area cannot work without, such as legal entities or leave types. The others can wait. Starter checks count company rules still at the YukthiX starter value.',
      'Open an area to see its checks. Each check opens the page where you finish it. If your company does not use Time & Leave or Payroll in YukthiX, hide that area in Company rules.',
    ],
  },
];

(async () => {
  const log: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = (await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } })).id;
    await tx.$executeRaw`SELECT set_config('app.current_org', ${org}, true)`;
    const audit = (action: string, id: string, meta: object) =>
      tx.$executeRaw`INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (gen_random_uuid(), ${org}::uuid, ${action}, 'sd_kb_article', ${id}, ${JSON.stringify({ ...meta, source: SOURCE })}, now())`;
    // An employee space of an employee desk: what the Help drawer reads for everyone.
    const desks = (await tx.sdDesk.findMany({ where: { organizationId: org, kind: { not: 'customer_support' } }, select: { id: true } })).map((d) => d.id);
    const space = (await tx.sdKbSpace.findMany({ where: { organizationId: org, status: 'active', audience: { in: ['requesters', 'public'] } }, orderBy: { createdAt: 'asc' } })).find((s) => !s.deskId || desks.includes(s.deskId));
    if (!space) throw new Error('demo-org has no employee knowledge-base space.');
    const user = async (email: string) => (await tx.user.findFirst({ where: { organizationId: org, email, status: 'active' }, select: { id: true } }))?.id;
    // hr-tester writes and admin-tester approves; a copy of the demo without them uses two different System Admins.
    const admins = (await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active' }, orderBy: { createdAt: 'asc' }, select: { id: true } })).map((u) => u.id);
    const author = (await user('hr-tester@demo-org.test')) ?? admins[0];
    const reviewer = (await user('admin-tester@demo-org.test')) ?? admins.find((id) => id !== author);
    if (!author || !reviewer || author === reviewer) throw new Error('demo-org needs two different people: an author and a reviewer.');
    for (const a of ARTICLES) {
      if (await tx.sdKbArticle.findFirst({ where: { organizationId: org, spaceId: space.id, language: 'en', slug: a.slug }, select: { id: true } })) {
        log.push(`"${a.title}" already there, nothing to do`);
        continue;
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'sd_kb_number:' + org}, 0))`;
      const [{ n }] = await tx.$queryRaw<{ n: number }[]>`SELECT coalesce(max(number), 0)::int + 1 AS n FROM sd_kb_articles WHERE organization_id = ${org}::uuid`;
      const bodyHtml = a.body.map((p) => `<p>${p}</p>`).join('');
      const now = new Date();
      const review = new Date(now);
      review.setMonth(review.getMonth() + 12);
      const art = await tx.sdKbArticle.create({
        data: { organizationId: org, spaceId: space.id, number: n, slug: a.slug, language: 'en', audience: space.audience, state: 'draft', ownerUserId: author, title: a.title, summary: a.summary, pages: a.pages, reviewDueOn: new Date(review.toISOString().slice(0, 10)), createdBy: author },
      });
      await audit('desk.kb.article_created', art.id, { number: n, spaceId: space.id, pages: a.pages });
      // Version 1 by the HR author, approved by someone else (the four-eyes check), then published.
      await tx.sdKbArticleVersion.create({ data: { organizationId: org, articleId: art.id, version: 1, title: a.title, summary: a.summary, bodyHtml, authorUserId: author, submittedAt: now, reviewedBy: reviewer, reviewedAt: now, publishedAt: now } });
      await audit('desk.kb.article_approved', art.id, { version: 1, reviewedBy: reviewer });
      await tx.sdKbArticle.update({ where: { id: art.id }, data: { bodyHtml, bodyText: htmlToText(bodyHtml), publishedVersion: 1, publishedAt: now, state: 'published' } });
      await audit('desk.kb.article_published', art.id, { version: 1, number: n });
      log.push(`published KB-${n} "${a.title}" for ${a.pages.join(', ')}`);
    }
  });
  console.log(log.join('\n'));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e.message);
  await prisma.$disconnect();
  process.exit(1);
});
