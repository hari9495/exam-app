import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PDFDocument } from 'pdf-lib';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { ReviewDraftClient, type ReviewDraftInput } from '../src/performance/review-draft.client';

// Performance builder 3 end to end against the real database (forced RLS, the app role):
//   PRF-17 the review assistant: off by default, drafting only for the current manager through the AI service with no
//          names sent, "not configured" when there is no provider; the bias check is rules only and never changes the
//          review; rating spread against peers; each Accept / Ignore audited
//   PRF-15 escalation only after HR answered, once, within the window; attachments through the file pipeline; only
//          perf.dispute.manage holders read the case (every view audited); legal hold, decision and an evidence export
//          (PDF in the file store, hashes in the audit log) with optimistic versions; the rating never changes
//   PRF-13 the new manager's and HR's hand-over lists (a plan only for HR with perf.pip.manage), a goal re-aligned once
//   PRF-16 coach nudges from the manager's own team data, dismiss, opt-out, company off; the suggested 1:1 agenda
//   and companies stay apart throughout.

describe('Performance builder 3 (PRF-13 … PRF-17)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const reports = ['divya', 'meena', 'ravi', 'sunil', 'tara'] as const;
  type Who = 'adminA' | 'adminB' | 'head' | 'priya' | 'karthik' | (typeof reports)[number] | 'hr' | 'hr2' | 'legal';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const drafts: ReviewDraftInput[] = [];
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1/performance${path}`).set('Authorization', `Bearer ${token[who]}`);
  const setting = (key: string, value: string) => request(server()).put('/api/v1/org/settings').set('Authorization', `Bearer ${token.adminA}`).send({ key, scopeType: 'tenant', value }).expect(200);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const audits = (action: string, entityId?: string) => inA((tx) => tx.auditLog.findMany({ where: { action, ...(entityId ? { entityId } : {}) } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async () => ({ success: true })) })
      // The AI model is never called from tests: the client records what it would send.
      .overrideProvider(ReviewDraftClient)
      .useValue({ generate: jest.fn(async (input: ReviewDraftInput) => (drafts.push(input), { draft: 'The employee automated 310 of 400 cases.' })) })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `b3-plan-${run}`, candidateLimit: 1, aiCreditLimit: 5, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `B3 Org ${k}`, slug: `b3-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['head', 'A', 'panel', []],
      ['priya', 'A', 'panel', []],
      ['karthik', 'A', 'panel', []],
      ...reports.map((w): [Who, 'A', string, string[]] => [w, 'A', 'panel', []]),
      ['hr', 'A', 'panel', ['perf.cycle.manage', 'perf.review.view']],
      ['hr2', 'A', 'panel', ['perf.cycle.manage', 'perf.pip.manage']],
      ['legal', 'A', 'panel', ['perf.dispute.manage']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@b3-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@b3-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      for (const [k, name, code] of [['sales', 'Sales', 'SAL'], ['ops', 'Operations', 'OPS']]) {
        const deptId = randomUUID();
        ids[k] = (await tx.department.create({ data: { ...x, id: deptId, name, code, path: `/${deptId}/` } })).id;
      }
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, given: string, code: string, manager: string | null, dept: string) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Moving existing staff onto YukthiX', givenName: given, familyName: `Raghunathan${run.slice(0, 3)}`, employeeCode: code, joinedOn: '2022-01-03', userId: users[who], workEmail: `${who}@b3-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids[dept], designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    emp.head = await hire('head', 'Arun', 'KF-001', null, 'ops');
    emp.priya = await hire('priya', 'Priya', 'KF-002', emp.head, 'ops');
    emp.karthik = await hire('karthik', 'Karthik', 'KF-003', emp.head, 'ops');
    let i = 4;
    for (const w of reports) emp[w] = await hire(w, w[0].toUpperCase() + w.slice(1), `KF-00${i++}`, emp.priya, 'sales');
    await request(server()).post('/api/v1/performance/setup/from-starter').set('Authorization', `Bearer ${token.adminA}`).expect(201);
    const templates = (await api('adminA', 'get', '/templates').expect(200)).body as { id: string; kind: string }[];
    const sales = { id: 'root', join: 'and', items: [{ id: 'c1', field: 'department_id', operator: 'is', value: ids.sales }] };
    const c = (await api('adminA', 'post', '/cycles').send({ name: `H1 ${run}`, kind: 'half_yearly', periodFrom: shift(today, -120), periodTo: shift(today, 10), templateId: templates.find((t) => t.kind === 'half_yearly')!.id, population: sales, stages: [{ key: 'manager', dueOn: shift(today, 10) }], eligibilityRules: { cutoffMonths: 0, rateLeavers: false } }).expect(201)).body;
    ids.cycle = c.id;
    await api('adminA', 'post', `/cycles/${c.id}/launch`).send({ version: c.version }).expect(200);
    for (const w of reports) ids[`r_${w}`] = (await api(w, 'get', '/reviews?view=mine').expect(200)).body[0].id;
    // A colleague's praise that names Divya: it may help the draft, but her name must not reach the model.
    await inA((tx) => tx.feedbackItem.create({ data: { organizationId: org.A.id, fromEmployeeId: emp.meena, toEmployeeId: emp.divya, kind: 'praise', text: 'Divya fixed the Line-3 checklist in a day.', visibility: 'private' } }));
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('PRF-17: the assistant is off by default, only for the current manager, and says when AI is not set up', async () => {
    const rid = ids.r_divya;
    await api('divya', 'get', `/reviews/${rid}/assistant`).expect(404);
    await api('karthik', 'get', `/reviews/${rid}/assistant`).expect(404);
    await api('adminB', 'get', `/reviews/${rid}/assistant`).expect(404);
    expect((await api('priya', 'get', `/reviews/${rid}/assistant`).expect(200)).body).toEqual({ enabled: false, reason: 'company-off' });
    expect((await api('priya', 'post', `/reviews/${rid}/assistant/draft`).expect(409)).body.message).toMatch(/off for your company/);
    await setting('perf.ai.review_assistant', 'on');
    const key = process.env.ANTHROPIC_API_KEY;
    try {
      process.env.ANTHROPIC_API_KEY = '';
      expect((await api('priya', 'get', `/reviews/${rid}/assistant`).expect(200)).body).toEqual({ enabled: false, reason: 'not-configured' });
      expect((await api('priya', 'post', `/reviews/${rid}/assistant/draft`).expect(400)).body.message).toMatch(/not configured/);
      expect(drafts).toHaveLength(0);
      process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
      expect((await api('priya', 'get', `/reviews/${rid}/assistant`).expect(200)).body).toEqual({ enabled: true, reason: null });
      const d = (await api('priya', 'post', `/reviews/${rid}/assistant/draft`).expect(200)).body;
      expect(d.draft).toMatch(/310 of 400/);
      expect(d.basis).toMatch(/goals, feedback received and 1:1 notes/);
    } finally {
      process.env.ANTHROPIC_API_KEY = key;
    }
    expect(drafts).toHaveLength(1);
    expect(JSON.stringify(drafts[0])).not.toMatch(/Divya|Raghunathan/i);
    expect(drafts[0].feedback[0].text).toBe('the employee fixed the Line-3 checklist in a day.');
    expect(await inA((tx) => tx.aiCreditUsage.count({ where: { source: 'perf_review_draft', sourceId: rid } }))).toBe(1);
    await api('meena', 'post', `/reviews/${rid}/assistant/draft`).expect(404);
  });

  it('PRF-17: the bias check is rules only, never changes the review, and each Accept / Ignore is audited', async () => {
    const rid = ids.r_divya;
    const flags = (await api('priya', 'post', `/reviews/${rid}/assistant/check`).send({ text: 'She is emotional in meetings. Good job overall.', rating: 3 }).expect(200)).body as { id: string; kind: string; match: string }[];
    expect(flags.map((f) => [f.kind, f.match])).toEqual([
      ['Gendered or loaded word', 'emotional'],
      ['Vague, no example', 'Good job'],
    ]);
    expect((await api('priya', 'post', `/reviews/${rid}/assistant/check`).send({ text: 'Automated 310 of 400 cases.', rating: 4 }).expect(200)).body).toEqual([]);
    await api('priya', 'post', `/reviews/${rid}/assistant/check`).send({ rating: 3 }).expect(400);
    await api('priya', 'post', `/reviews/${rid}/assistant/check`).send({ text: 'x', rating: 11 }).expect(400);
    await api('divya', 'post', `/reviews/${rid}/assistant/check`).send({ text: 'x' }).expect(404);
    await api('priya', 'post', `/reviews/${rid}/assistant/flags`).send({ flagId: flags[0].id, kind: flags[0].kind, decision: 'accepted' }).expect(200);
    await api('priya', 'post', `/reviews/${rid}/assistant/flags`).send({ flagId: flags[1].id, kind: flags[1].kind, decision: 'maybe' }).expect(400);
    expect((await audits('perf.review.bias_flag', rid)).map((a) => JSON.parse(a.metadataJson ?? '{}').decision)).toEqual(['accepted']);
    const r = (await api('priya', 'get', `/reviews/${rid}`).expect(200)).body;
    expect(r.managerEntry).toBeNull();
    expect(r.status).toBe('open');
  });

  it('PRF-17: rating spread against peers once the manager has rated everyone the same', async () => {
    for (const w of reports) {
      const rid = ids[`r_${w}`];
      const r = (await api('priya', 'get', `/reviews/${rid}`).expect(200)).body as { template: { sections: { questions: { id: string; answer: string }[] }[] } };
      const answers = r.template.sections.flatMap((s) => s.questions.map((q) => (q.answer === 'text' ? { questionId: q.id, text: 'Notes' } : { questionId: q.id, rating: 4 })));
      await api('priya', 'post', `/reviews/${rid}/entries/manager/submit`).send({ answers }).expect(200);
    }
    const flags = (await api('priya', 'post', `/reviews/${ids.r_divya}/assistant/check`).send({ text: 'Automated 310 of 400 cases.', rating: 4 }).expect(200)).body as { kind: string; match: string }[];
    expect(flags).toEqual([expect.objectContaining({ kind: 'Rating spread against peers', match: 'All 5 of your ratings this cycle are 4.00' })]);
    // Drafting is for an open review only.
    expect((await api('priya', 'post', `/reviews/${ids.r_divya}/assistant/draft`).expect(409)).body.message).toMatch(/finished/);
  });

  it('PRF-15: escalate only after HR answered, once; attachments go through the file pipeline', async () => {
    const rid = ids.r_divya;
    await api('adminA', 'post', `/cycles/${ids.cycle}/release`).expect(200);
    let mine = (await api('divya', 'get', `/reviews/${rid}/dispute`).expect(200)).body;
    expect(mine).toMatchObject({ canEscalate: false, dispute: null });
    expect(mine.why).toMatch(/disagreement on the review first/);
    const grounds = 'Goal 2 was rated low although the supplier strike caused the delay, which my manager accepted in writing.';
    await api('divya', 'post', `/reviews/${rid}/dispute`).send({ grounds, sought: 'rereview' }).expect(409);
    await api('divya', 'post', `/reviews/${rid}/disagree`).send({ text: 'The supplier strike caused the delay on goal 2.' }).expect(200);
    expect((await api('divya', 'post', `/reviews/${rid}/dispute`).send({ grounds, sought: 'rereview' }).expect(409)).body.message).toMatch(/not answered/);
    const [dis] = (await api('hr', 'get', `/cycles/${ids.cycle}/disagreements`).expect(200)).body as { id: string }[];
    await api('hr', 'post', `/disagreements/${dis.id}/decide`).send({ status: 'not_upheld', hrNote: 'The rating reflects the whole year.' }).expect(200);
    mine = (await api('divya', 'get', `/reviews/${rid}/dispute`).expect(200)).body;
    expect(mine).toMatchObject({ canEscalate: true, escalateBy: shift(today, 15) });
    await api('divya', 'post', `/reviews/${rid}/dispute`).send({ grounds: 'Too short', sought: 'rereview' }).expect(400);
    await api('divya', 'post', `/reviews/${rid}/dispute`).send({ grounds, sought: 'money' }).expect(400);
    await api('meena', 'post', `/reviews/${rid}/dispute`).send({ grounds, sought: 'rereview' }).expect(404);
    await api('adminB', 'post', `/reviews/${rid}/dispute`).send({ grounds, sought: 'rereview' }).expect(404);
    mine = (await api('divya', 'post', `/reviews/${rid}/dispute`).send({ grounds, sought: 'rereview' }).expect(201)).body;
    expect(mine.dispute).toMatchObject({ ref: 'PRF-D-0001', status: 'raised' });
    expect(mine.steps.map((s: { label: string; status: string }) => `${s.label}:${s.status}`)).toEqual(['Disagreement raised:done', 'HR reply:done', 'Escalated:done', 'Decision:current']);
    ids.dispute = mine.dispute.id;
    expect((await api('divya', 'post', `/reviews/${rid}/dispute`).send({ grounds, sought: 'rereview' }).expect(409)).body.message).toMatch(/already escalated/);
    const told = await inA((tx) => tx.userNotification.findMany({ where: { type: 'perf.dispute' } }));
    expect(told.map((n) => n.recipientUserId)).toEqual([users.legal]);

    const doc = await PDFDocument.create();
    doc.addPage();
    const pdf = Buffer.from(await doc.save());
    mine = (await api('divya', 'post', `/disputes/${ids.dispute}/files`).attach('file', pdf, 'strike-letter.pdf').expect(201)).body;
    expect(mine.dispute.files.map((f: { name: string }) => f.name)).toEqual(['strike-letter.pdf']);
    await api('divya', 'post', `/disputes/${ids.dispute}/files`).attach('file', Buffer.from('MZ not a pdf'), 'evil.pdf').expect(400);
    await api('divya', 'post', `/disputes/${ids.dispute}/files`).expect(400);
    await api('meena', 'post', `/disputes/${ids.dispute}/files`).attach('file', pdf, 'x.pdf').expect(404);
  });

  it('PRF-15: only dispute handlers read the case, every view is audited; legal hold and decision are versioned', async () => {
    const id = ids.dispute;
    await api('hr', 'get', '/disputes').expect(403);
    await api('priya', 'get', `/disputes/${id}`).expect(403);
    await api('divya', 'get', `/disputes/${id}`).expect(403);
    expect([403, 404]).toContain((await api('adminA', 'get', `/disputes/${id}`)).status);
    expect([403, 404]).toContain((await api('adminB', 'get', `/disputes/${id}`)).status);
    expect((await api('legal', 'get', '/disputes').expect(200)).body).toEqual([expect.objectContaining({ id, ref: 'PRF-D-0001', status: 'raised', legalHold: false })]);
    const rec = (await api('legal', 'get', `/disputes/${id}`).expect(200)).body;
    expect(rec.evidence.map((e: { kind: string }) => e.kind)).toEqual(expect.arrayContaining(['Review as released', 'Review version', 'Stage history', 'Disagreement and HR reply', 'Escalation', 'Attachment', 'Audit log']));
    expect(rec.evidence.every((e: { hash: string }) => /^[0-9a-f]{64}$/.test(e.hash))).toBe(true);
    expect(rec.signatories).toEqual([{ value: users.legal, label: `legal ${run}` }]);
    expect(await audits('perf.dispute.viewed', id)).toHaveLength(1);
    await api('legal', 'post', `/disputes/${id}/legal-hold`).send({ on: true, version: rec.version + 1 }).expect(409);
    const held = (await api('legal', 'post', `/disputes/${id}/legal-hold`).send({ on: true, version: rec.version }).expect(200)).body;
    expect(held.legalHold).toBe(true);
    await api('legal', 'post', `/disputes/${id}/legal-hold`).send({ on: true, version: held.version }).expect(409);
    await api('legal', 'post', `/disputes/${id}/legal-hold`).send({ on: 'yes', version: held.version }).expect(400);
    ids.version = String(held.version);
    ids.evidence = JSON.stringify(rec.evidence.map((e: { id: string }) => e.id));
  });

  it('PRF-15: the evidence export is a PDF in the file store, logged with every hash', async () => {
    const id = ids.dispute;
    const items = JSON.parse(ids.evidence) as string[];
    await api('legal', 'post', `/disputes/${id}/export`).send({ items: [], signatoryUserId: users.legal }).expect(400);
    await api('legal', 'post', `/disputes/${id}/export`).send({ items: ['nope'], signatoryUserId: users.legal }).expect(400);
    await api('legal', 'post', `/disputes/${id}/export`).send({ items, signatoryUserId: users.hr }).expect(400);
    await api('legal', 'post', `/disputes/${id}/export`).send({ items: [items[0], items[0]], signatoryUserId: users.legal }).expect(400);
    await api('priya', 'post', `/disputes/${id}/export`).send({ items, signatoryUserId: users.legal }).expect(403);
    const out = (await api('legal', 'post', `/disputes/${id}/export`).send({ items, signatoryUserId: users.legal }).expect(200)).body;
    expect(out.ref).toBe('PRF-D-0001-EXP-01');
    const [logged] = await audits('perf.dispute.exported', id);
    const meta = JSON.parse(logged.metadataJson ?? '{}');
    expect(meta.items).toHaveLength(items.length);
    expect(meta.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    const file = await api('legal', 'get', `/disputes/${id}/exports/${out.exportId}/file`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    expect((file.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(file.headers['content-disposition']).toMatch(/attachment; filename="PRF-D-0001-EXP-01.pdf"/);
    expect(await audits('perf.dispute.export_downloaded', id)).toHaveLength(1);
    expect((await api('legal', 'get', `/disputes/${id}`).expect(200)).body.exports).toEqual([expect.objectContaining({ ref: 'PRF-D-0001-EXP-01', items: items.length })]);
    await api('adminB', 'get', `/disputes/${id}/exports/${out.exportId}/file`).expect((r) => expect([403, 404]).toContain(r.status));
  });

  it('PRF-15: the decision is recorded once and never changes the rating; the employee sees it', async () => {
    const id = ids.dispute;
    const before = (await api('legal', 'get', `/disputes/${id}`).expect(200)).body;
    await api('legal', 'post', `/disputes/${id}/decision`).send({ decision: 'not_upheld', note: 'Short', version: before.version }).expect(400);
    await api('legal', 'post', `/disputes/${id}/decision`).send({ decision: 'not_upheld', note: 'The rating reflects the full year of results.', version: before.version - 1 }).expect(409);
    const done = (await api('legal', 'post', `/disputes/${id}/decision`).send({ decision: 'not_upheld', note: 'The rating reflects the full year of results.', version: before.version }).expect(200)).body;
    expect(done).toMatchObject({ status: 'resolved', decision: 'not_upheld' });
    await api('legal', 'post', `/disputes/${id}/decision`).send({ decision: 'upheld', note: 'Changing my mind now.', version: done.version }).expect(409);
    const mine = (await api('divya', 'get', `/reviews/${ids.r_divya}/dispute`).expect(200)).body;
    expect(mine.dispute).toMatchObject({ status: 'resolved', decision: 'not_upheld' });
    expect(mine.score).toBe(4);
    const pdf = Buffer.from(await (await PDFDocument.create()).save());
    await api('divya', 'post', `/disputes/${id}/files`).attach('file', pdf, 'late.pdf').expect(409);
  });

  it('PRF-13: the new manager and HR see the hand-overs; a goal is re-aligned once; plans only for HR with the plan key', async () => {
    await inA(async (tx) => {
      const o = org.A.id;
      ids.period = (await tx.goalPeriod.create({ data: { organizationId: o, name: `FY ${run}`, fromOn: day(shift(today, -60)), toOn: day(shift(today, 120)) } })).id;
      const goal = (owner: string, title: string, parentGoalId: string | null = null) => tx.goal.create({ data: { organizationId: o, periodId: ids.period, ownerType: 'person', ownerEmployeeId: owner, kind: 'kpi', title, status: 'active', weight: 50, parentGoalId } });
      ids.priyaGoal = (await goal(emp.priya, 'Cut rejects to 2%')).id;
      ids.karthikGoal = (await goal(emp.karthik, 'Zero line stops')).id;
      ids.otherGoal = (await goal(emp.head, 'Company quality')).id;
      ids.divyaGoal = (await goal(emp.divya, 'Seal-strength rejects', ids.priyaGoal)).id;
      ids.meenaGoal = (await goal(emp.meena, 'Batch records', ids.priyaGoal)).id;
      const t = (employeeId: string, artefactType: string, artefactId: string, decisionNeeded = false) => tx.perfOwnerTransfer.create({ data: { organizationId: o, employeeId, oldManagerEmployeeId: emp.priya, newManagerEmployeeId: emp.karthik, effectiveOn: day(today), artefactType, artefactId, decisionNeeded } });
      ids.hReview = (await t(emp.divya, 'review', ids.r_divya)).id;
      ids.hGoal = (await t(emp.divya, 'goal_parent', ids.divyaGoal, true)).id;
      ids.hGoal2 = (await t(emp.meena, 'goal_parent', ids.meenaGoal, true)).id;
      ids.hPip = (await t(emp.meena, 'pip', randomUUID())).id;
    });
    const mine = (await api('karthik', 'get', '/handover-list').expect(200)).body as { id: string; artefact: string; status: string; from: string; to: string }[];
    expect(mine).toHaveLength(4);
    expect(mine.find((r) => r.id === ids.hGoal)).toMatchObject({ artefact: 'Goal parent', status: 'Needs decision', from: expect.stringMatching(/^Priya/), to: expect.stringMatching(/^Karthik/) });
    expect(mine.find((r) => r.id === ids.hReview)).toMatchObject({ artefact: 'Manager review stage', status: 'Moved' });
    expect((await api('priya', 'get', '/handover-list').expect(200)).body).toEqual([]);
    expect((await api('divya', 'get', '/handover-list').expect(200)).body).toEqual([]);
    expect((await api('adminB', 'get', '/handover-list').expect(200)).body).toEqual([]);
    await api('divya', 'get', '/handover-list/all').expect(403);
    expect(((await api('hr', 'get', '/handover-list/all').expect(200)).body as { id: string }[]).map((r) => r.id).sort()).toEqual([ids.hReview, ids.hGoal, ids.hGoal2].sort());
    expect((await api('hr2', 'get', '/handover-list/all').expect(200)).body).toHaveLength(4);

    expect((await api('karthik', 'get', `/handover-list/${ids.hGoal}/parent-options`).expect(200)).body).toEqual([{ value: ids.karthikGoal, label: 'Zero line stops' }]);
    await api('divya', 'get', `/handover-list/${ids.hGoal}/parent-options`).expect(404);
    await api('priya', 'post', `/handover-list/${ids.hGoal}/decide`).send({ decision: 'unaligned' }).expect(404);
    await api('adminB', 'post', `/handover-list/${ids.hGoal}/decide`).send({ decision: 'unaligned' }).expect(404);
    await api('karthik', 'post', `/handover-list/${ids.hGoal}/decide`).send({ decision: 'realigned' }).expect(400);
    await api('karthik', 'post', `/handover-list/${ids.hGoal}/decide`).send({ decision: 'move' }).expect(400);
    await api('karthik', 'post', `/handover-list/${ids.hGoal}/decide`).send({ decision: 'realigned', parentGoalId: ids.otherGoal }).expect(400);
    expect((await api('karthik', 'post', `/handover-list/${ids.hReview}/decide`).send({ decision: 'unaligned' }).expect(409)).body.message).toMatch(/needs no decision/);
    const done = (await api('karthik', 'post', `/handover-list/${ids.hGoal}/decide`).send({ decision: 'realigned', parentGoalId: ids.karthikGoal, note: 'Same line now' }).expect(200)).body;
    expect(done).toMatchObject({ status: 'Decided', decision: 'realigned', note: 'Same line now' });
    expect((await inA((tx) => tx.goal.findUniqueOrThrow({ where: { id: ids.divyaGoal } }))).parentGoalId).toBe(ids.karthikGoal);
    await api('karthik', 'post', `/handover-list/${ids.hGoal}/decide`).send({ decision: 'unaligned' }).expect(409);
    // HR decides the other one: left unaligned.
    expect((await api('hr', 'post', `/handover-list/${ids.hGoal2}/decide`).send({ decision: 'unaligned' }).expect(200)).body.status).toBe('Decided');
    expect((await inA((tx) => tx.goal.findUniqueOrThrow({ where: { id: ids.meenaGoal } }))).parentGoalId).toBeNull();
    expect((await audits('perf.handover.decided')).map((a) => a.entityId).sort()).toEqual([ids.hGoal, ids.hGoal2].sort());
  });

  it('PRF-16: coach nudges come from the manager’s own team; dismiss, opt out and company off', async () => {
    await setting('perf.coach.frequency', 'weekly');
    expect((await api('karthik', 'get', '/coach').expect(200)).body).toMatchObject({ state: 'not-manager', nudges: [] });
    expect((await api('divya', 'get', '/coach').expect(200)).body.state).toBe('not-manager');
    await inA(async (tx) => {
      const o = org.A.id;
      // Priya gave Meena feedback last week and held 1:1s with everyone but Divya; Divya's 1:1 is 9 days late; her goal is off track.
      await tx.feedbackItem.create({ data: { organizationId: o, fromEmployeeId: emp.priya, toEmployeeId: emp.meena, kind: 'praise', text: 'Thanks for the batch records.' } });
      for (const w of ['meena', 'ravi', 'sunil', 'tara']) await tx.oneOnOne.create({ data: { organizationId: o, employeeId: emp[w], managerEmployeeId: emp.priya, on: day(shift(today, -7)), status: 'held' } });
      ids.late = (await tx.oneOnOne.create({ data: { organizationId: o, employeeId: emp.divya, managerEmployeeId: emp.priya, on: day(shift(today, -9)) } })).id;
      ids.next = (await tx.oneOnOne.create({ data: { organizationId: o, employeeId: emp.divya, managerEmployeeId: emp.priya, on: day(shift(today, 3)) } })).id;
      await tx.oneOnOneAction.create({ data: { organizationId: o, oneOnOneId: ids.late, ownerEmployeeId: emp.divya, text: 'August reject data by batch', dueOn: day(shift(today, 5)) } });
      ids.goalP = (await tx.goalPeriod.findFirstOrThrow({ where: { name: `FY ${run}` } })).id;
      await tx.goalCheckin.create({ data: { organizationId: o, goalId: ids.divyaGoal, on: day(shift(today, -3)), values: {}, progress: 20, confidence: 'off_track' } });
    });
    const c = (await api('priya', 'get', '/coach').expect(200)).body as { state: string; weekOf: string; nudges: { id: string; person: string; signal: string; action: string }[] };
    expect(c.state).toBe('ready');
    const divya = c.nudges.find((n) => n.person.startsWith('Divya'))!;
    expect(divya.signal).toBe('No feedback from you yet. 1:1 overdue by 9 days. Goal “Seal-strength rejects” is off track.');
    expect(c.nudges.find((n) => n.person.startsWith('Meena'))).toBeUndefined();
    expect(c.nudges.map((n) => n.person.split(' ')[0]).sort()).toEqual(['Divya', 'Ravi', 'Sunil', 'Tara']);
    await api('priya', 'post', '/coach/dismiss').send({ key: '' }).expect(400);
    const after = (await api('priya', 'post', '/coach/dismiss').send({ key: divya.id }).expect(200)).body;
    expect(after.nudges.map((n: { id: string }) => n.id)).not.toContain(divya.id);
    await api('priya', 'post', '/coach/dismiss').send({ key: divya.id }).expect(200);
    expect((await api('priya', 'post', '/coach/opt-out').send({ optedOut: true }).expect(200)).body).toMatchObject({ optedOut: true, nudges: [] });
    await api('priya', 'post', '/coach/opt-out').send({ optedOut: 'yes' }).expect(400);
    expect((await api('priya', 'post', '/coach/opt-out').send({ optedOut: false }).expect(200)).body.nudges).toHaveLength(3);
    await setting('perf.coach.frequency', 'off');
    expect((await api('priya', 'get', '/coach').expect(200)).body).toMatchObject({ state: 'company-off', nudges: [] });
    await setting('perf.coach.frequency', 'weekly');
  });

  it('PRF-16: the suggested 1:1 agenda is for the 1:1’s manager only and skips what is already on it', async () => {
    const s = (await api('priya', 'get', `/one-on-ones/${ids.next}/suggested-agenda`).expect(200)).body as { id: string; text: string; why: string }[];
    expect(s.map((x) => x.text)).toEqual(['Seal-strength rejects: agree one next step', 'Follow up: August reject data by batch']);
    await api('divya', 'get', `/one-on-ones/${ids.next}/suggested-agenda`).expect(404);
    await api('karthik', 'get', `/one-on-ones/${ids.next}/suggested-agenda`).expect(404);
    await api('adminB', 'get', `/one-on-ones/${ids.next}/suggested-agenda`).expect(404);
    await api('priya', 'get', '/one-on-ones/not-a-uuid/suggested-agenda').expect(400);
    await api('priya', 'post', `/one-on-ones/${ids.next}/agenda`).send({ text: 'Follow up: August reject data by batch' }).expect((r) => expect([200, 201]).toContain(r.status));
    expect(((await api('priya', 'get', `/one-on-ones/${ids.next}/suggested-agenda`).expect(200)).body as { text: string }[]).map((x) => x.text)).toEqual(['Seal-strength rejects: agree one next step']);
  });
});
