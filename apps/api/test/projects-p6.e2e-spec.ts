import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { gstinCheckChar } from '../src/expenses/checks';
import { financialYear } from '../src/staffing/staffing-rules';
import { ProjectCostService } from '../src/projects/project-cost.service';
import { mondayOf } from '../src/time/time-rules';

// Projects P-6 end to end (PRJ-05, PRJ-06; founder answers 1414 to 1416, 1621, 1622). One invoice engine: unbilled
// project work (time-and-material hours at the bill rate, fixed-fee milestones, retainers, re-billed expenses) becomes
// drafts on the staffing desk's invoices, one per client, each item billed once; the account manager's approval is a
// setting (off by default); only Projects finance bills and corrects; a client sees only their own invoices in the
// portal; a correction of billed time makes a credit note (never more than is left) or a supplementary invoice, a
// locked month an adjustment, and pay recovery follows the setting; revenue for margin is billed revenue; quarters and
// the cost journal.

jest.setTimeout(300_000);

describe('Projects P-6 billing workbench and corrections', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let costs: ProjectCostService;
  const send = jest.fn(async (_m: { to: string; subject: string; html: string }) => ({ success: true }));
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' } };
  type Who = 'admin' | 'fin' | 'boss' | 'am' | 'sfin' | 'e1' | 'e2';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const portal = (method: 'get' | 'post', path: string, t?: string) => {
    const r = request(server())[method](`/api/v1/public/client-portal/${org.A.slug}${path}`);
    return t ? r.set('X-Client-Portal', t) : r;
  };
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const plus = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const M2 = `${today.slice(0, 7)}-01`; // this month
  const M1 = plus(M2, -1).slice(0, 7) + '-01'; // last month (billed)
  const M0 = plus(M1, -1).slice(0, 7) + '-01'; // the month before (locked)
  const w1 = mondayOf(plus(M1, 14));
  const w0 = mondayOf(plus(M0, 14));
  const OURS = (() => {
    const f = '29AABCK1234F1Z';
    return f + gstinCheckChar(f);
  })();
  type Wip = { id: string; project: string; source: string; detail: string; hours: number | null; amount: string; held: string | null; client: string };
  type Draft = { id: string; client: string; taxable: string; cgst: string; sgst: string; igst: string; total: string; version: number; amApprovedAt: string | null };
  const bench = async (month = M1) => (await api('fin', 'get', `/projects/billing?month=${month.slice(0, 7)}`).expect(want(200))).body as { wip: Wip[]; drafts: Draft[]; approver: boolean; amApproval: boolean };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    costs = moduleRef.get(ProjectCostService);

    planId = (await prisma.plan.create({ data: { name: `prj6-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const created = await prisma.organization.create({ data: { name: 'PRJ6 Org A', slug: `prj6-a-${run}`, planId } });
    org.A = { id: created.id, slug: created.slug };
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, string, string[] | null][] = [
      ['admin', 'org_admin', null],
      ['fin', 'panel', ['projects.view', 'projects.manage', 'projects.finance']],
      ['boss', 'panel', ['projects.view', 'projects.manage', 'projects.resource']],
      ['am', 'panel', ['ats.staffing.manage', 'ats.staffing.view']],
      ['sfin', 'panel', ['ats.staffing.billing']],
      ['e1', 'panel', []],
      ['e2', 'panel', []],
    ];
    for (const [who, role, keys] of roster) {
      const o = org.A.id;
      const permissionProfileId = keys ? (await inA((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inA((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@prj6-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `${who}@prj6-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Prj6 Tech', shortName: `PRJ6-${run}`, isDefault: true, gstin: OURS } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Delivery', code: 'DEL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Engineer', code: 'ENG' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    for (const who of ['e1', 'e2'] as const)
      ids[who] = (
        await api('admin', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: plus(M0, -60), userId: users[who], workEmail: `${who}@prj6-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } })
          .expect(want(201))
      ).body.id;
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.enabled', value: 'on' }, { key: 'projects.expenses.enabled', value: 'on' }] }).expect(want(200));
    await api('am', 'put', '/staffing/settings').send({ changes: [{ key: 'staffing.desk.enabled', value: 'on' }] }).expect(want(200));
    ids.series = (await api('am', 'post', '/staffing/invoice-series').send({ legalEntityId: ids.entity, gstin: OURS, financialYear: financialYear(today), prefix: 'P6/', nextNumber: 7 }).expect(want(201))).body.id;
    const client = (name: string, state: string) => ({ name: `${name} ${run}`, legalName: name, state, billingAddress: 'Somewhere', status: 'active', contractStart: '2026-04-01', contractEnd: '2027-03-31', invoiceGrouping: 'month', paymentTermsDays: 30 });
    ids.tn = (await api('am', 'post', '/staffing/clients').send(client('Nilgiri Retail', 'IN-TN')).expect(want(201))).body.id;
    ids.ka = (await api('am', 'post', '/staffing/clients').send(client('Coromandel', 'IN-KA')).expect(want(201))).body.id;
    ids.contact = (await api('am', 'post', `/staffing/clients/${ids.tn}/contacts`).send({ name: 'Meera Pillai', role: 'Finance', email: `meera-${run}@nilgiri.test`, billing: true }).expect(want(201))).body.id;

    const project = async (code: string, body: Record<string, unknown>) => {
      const id = (await api('fin', 'post', '/projects').send({ code, name: `Project ${code}`, startOn: plus(M0, -30), ...body }).expect(want(201))).body.id as string;
      await api('fin', 'post', `/projects/${id}/status`).send({ status: 'active', version: 1 }).expect(want(200));
      return id;
    };
    ids.tm = await project('TM', { billingModel: 'time_material', clientId: ids.tn, billRate: 1600 });
    ids.tmh = await project('TMH', { billingModel: 'time_material', clientId: ids.tn, billRate: 1000, clientApprovesHours: true });
    ids.ff = await project('FF', { billingModel: 'fixed_fee', clientId: ids.ka, fee: 100000 });
    ids.ret = await project('RET', { billingModel: 'retainer', clientId: ids.ka, fee: 50000 });
    await inA(async (tx) => {
      const o = org.A.id;
      ids.msOk = (await tx.projectMilestone.create({ data: { organizationId: o, projectId: ids.ff!, name: 'Design signed off', pct: 40, dueOn: day(plus(M1, 5)), status: 'accepted', completedAt: day(plus(M1, 5)) } })).id;
      ids.msWait = (await tx.projectMilestone.create({ data: { organizationId: o, projectId: ids.ff!, name: 'Go-live', pct: 60, dueOn: day(plus(M1, 20)), status: 'completed', completedAt: day(plus(M1, 20)) } })).id;
      // Last month: e1 16 h and e2 8 h on TM; e1 4 h on TMH waiting for the client. The month before: e1 8 h on TM.
      const sheet = async (who: 'e1' | 'e2', week: string, lines: { projectId: string; minutes: number[]; clientStatus?: string }[]) => {
        const s = await tx.timesheet.create({ data: { organizationId: o, employeeId: ids[who]!, weekStart: day(week), status: 'approved', totalMinutes: lines.reduce((t, l) => t + l.minutes.reduce((a, b) => a + b, 0), 0) } });
        const out: string[] = [];
        for (const l of lines) out.push((await tx.timesheetLine.create({ data: { organizationId: o, timesheetId: s.id, projectId: l.projectId, minutes: l.minutes, clientStatus: l.clientStatus ?? null } })).id);
        return out;
      };
      [ids.l1, ids.lh] = await sheet('e1', w1, [{ projectId: ids.tm!, minutes: [480, 480, 0, 0, 0, 0, 0] }, { projectId: ids.tmh!, minutes: [0, 0, 240, 0, 0, 0, 0], clientStatus: 'waiting' }]);
      [ids.l2] = await sheet('e2', w1, [{ projectId: ids.tm!, minutes: [0, 0, 0, 480, 0, 0, 0] }]);
      [ids.l0] = await sheet('e1', w0, [{ projectId: ids.tm!, minutes: [480, 0, 0, 0, 0, 0, 0] }]);
    });
    // A re-billed expense on TM (P-5, answer 1419), approved.
    await api('admin', 'post', '/expenses/setup/from-starter').expect(want(201));
    const cats = (await api('e1', 'get', '/expenses/categories').expect(200)).body as { code: string; kind: string }[];
    const claim = (await api('e1', 'post', '/expenses/claims').send({ title: 'Client visit' }).expect(want(201))).body as { id: string };
    await api('e1', 'post', `/expenses/claims/${claim.id}/lines`).send({ categoryCode: cats.find((c) => !['mileage', 'per_diem'].includes(c.kind))!.code, spentOn: plus(M1, 9), payMode: 'personal', amount: '1200.00', selfDeclared: true, justification: 'Taxi to the client', projectId: ids.tm, rebill: true }).expect(want(201));
    await inA((tx) => tx.expenseClaim.update({ where: { id: claim.id }, data: { status: 'approved' } }));
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        for (const t of ['staffing_receipt_allocations', 'staffing_receipts', 'staffing_invoice_lines'] as const) await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE organization_id = $1::uuid`, org.A.id);
        await tx.$executeRawUnsafe(`DELETE FROM "staffing_invoices" WHERE organization_id = $1::uuid AND credit_of IS NOT NULL`, org.A.id);
        await tx.$executeRawUnsafe(`DELETE FROM "staffing_invoices" WHERE organization_id = $1::uuid`, org.A.id);
        await tx.organization.deleteMany({ where: { id: org.A.id } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('the new tables have forced RLS with the tenant and portal policies', async () => {
    const rows = await prisma.$queryRaw<{ name: string; forced: boolean; policy: boolean; portal: boolean }[]>`
      SELECT c.relname AS name, c.relforcerowsecurity AS forced,
        EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy,
        EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'portal_none') AS portal
      FROM pg_class c WHERE c.relname IN ('project_billings', 'project_corrections') ORDER BY 1`;
    expect(rows).toEqual([
      { name: 'project_billings', forced: true, policy: true, portal: true },
      { name: 'project_corrections', forced: true, policy: true, portal: true },
    ]);
  });

  it('non-finance staff are refused: workbench, drafts, corrections, bill rate, cost journal', async () => {
    for (const who of ['boss', 'e1', 'sfin'] as const) await api(who, 'get', `/projects/billing?month=${M1.slice(0, 7)}`).expect(403);
    await api('boss', 'post', '/projects/billing/drafts').send({ seriesId: ids.series, month: M1.slice(0, 7), items: [`retainer:${ids.ret}:${M1.slice(0, 7)}`] }).expect(403);
    await api('boss', 'get', `/projects/billing/lines/${ids.l1}`).expect(403);
    await api('boss', 'post', `/projects/billing/lines/${ids.l1}/correct`).send({ hours: 10, reason: 'Booked twice' }).expect(403);
    await api('boss', 'post', '/projects').send({ code: 'NOPE', name: 'Nope', billingModel: 'time_material', clientId: ids.tn, billRate: 900 }).expect(403);
    await api('boss', 'get', `/projects/costs/journal?month=${M1.slice(0, 7)}`).expect(403);
    // The bill rate is hidden from a manager without Projects finance.
    const row = ((await api('boss', 'get', '/projects').expect(200)).body.rows as { code: string; billRate?: unknown }[]).find((r) => r.code === 'TM')!;
    expect(row).not.toHaveProperty('billRate');
    expect(((await api('fin', 'get', '/projects').expect(200)).body.rows as { code: string; billRate?: number }[]).find((r) => r.code === 'TM')!.billRate).toBe(1600);
    await api('fin', 'get', '/projects/billing?month=2026-13').expect(400);
  });

  it('WIP: T&M hours at the bill rate, milestones, the retainer and re-billed expenses; held items say why', async () => {
    const b = await bench();
    expect(b).toMatchObject({ approver: false, amApproval: false });
    const by = (id: string) => b.wip.find((w) => w.id === id);
    expect(by(`hours:${ids.tm}:${ids.e1}`)).toMatchObject({ source: 'Timesheet hours', hours: 16, amount: '25600.00', held: null });
    expect(by(`hours:${ids.tm}:${ids.e2}`)).toMatchObject({ hours: 8, amount: '12800.00', held: null });
    expect(by(`hours:${ids.tmh}:${ids.e1}:held`)).toMatchObject({ hours: 4, held: 'waiting for client approval' });
    expect(by(`milestone:${ids.msOk}`)).toMatchObject({ source: 'Milestone', amount: '40000.00', held: null });
    expect(by(`milestone:${ids.msWait}`)).toMatchObject({ amount: '60000.00', held: 'waiting for client acceptance' });
    expect(by(`retainer:${ids.ret}:${M1.slice(0, 7)}`)).toMatchObject({ source: 'Retainer', amount: '50000.00', held: null });
    expect(b.wip.find((w) => w.source === 'Expense rebill')).toMatchObject({ project: 'TM', amount: '1200.00', held: null });
    // The month before: its own work (its hours, not last month's retainer).
    const before = await bench(M0);
    expect(before.wip.find((w) => w.id === `hours:${ids.tm}:${ids.e1}`)).toMatchObject({ hours: 8 });
    expect(before.wip.some((w) => w.id === `retainer:${ids.ret}:${M1.slice(0, 7)}`)).toBe(false);
  });

  it('drafts: one per client on the staffing invoice engine, GST split by state; held or unknown items are refused', async () => {
    const m = M1.slice(0, 7);
    const exp = (await bench()).wip.find((w) => w.source === 'Expense rebill')!.id;
    await api('fin', 'post', '/projects/billing/drafts').send({ seriesId: ids.series, month: m, items: [`hours:${ids.tmh}:${ids.e1}:held`] }).expect(400);
    await api('fin', 'post', '/projects/billing/drafts').send({ seriesId: ids.series, month: m, items: ['hours:nope'] }).expect(409);
    await api('fin', 'post', '/projects/billing/drafts').send({ seriesId: randomUUID(), month: m, items: [exp] }).expect(400);
    await api('fin', 'post', '/projects/billing/drafts').send({ seriesId: ids.series, month: m, items: [] }).expect(400);
    await inA((tx) => tx.projectBilling.create({ data: { organizationId: org.A.id, projectId: ids.tm!, sourceType: 'hours', sourceId: ids.l0!, invoiceId: randomUUID(), amountPaise: 0n } })).then(
      () => {
        throw new Error('a billing row must name a real invoice');
      },
      () => undefined,
    );
    const items = [`hours:${ids.tm}:${ids.e1}`, `hours:${ids.tm}:${ids.e2}`, exp, `milestone:${ids.msOk}`, `retainer:${ids.ret}:${m}`];
    const r = (await api('fin', 'post', '/projects/billing/drafts').send({ seriesId: ids.series, month: m, items }).expect(want(201))).body as { ids: string[] };
    expect(r.ids).toHaveLength(2);
    const drafts = (await bench()).drafts;
    const tn = drafts.find((x) => x.client === `Nilgiri Retail ${run}`)!;
    const ka = drafts.find((x) => x.client === `Coromandel ${run}`)!;
    // TN: 16 h + 8 h at ₹1,600 + ₹1,200 expense; Karnataka GSTIN to Tamil Nadu: IGST. KA: 40% of ₹1,00,000 + ₹50,000; CGST + SGST.
    expect(tn).toMatchObject({ taxable: '39600.00', igst: '7128.00', cgst: '0.00', total: '46728.00' });
    expect(ka).toMatchObject({ taxable: '90000.00', cgst: '8100.00', sgst: '8100.00', igst: '0.00', total: '106200.00' });
    ids.invTn = tn.id;
    ids.invKa = ka.id;
    const lines = await inA((tx) => tx.staffingInvoiceLine.findMany({ where: { invoiceId: { in: r.ids } } }));
    expect(lines.every((l) => l.projectId)).toBe(true);
    expect((await inA((tx) => tx.projectMilestone.findUniqueOrThrow({ where: { id: ids.msOk } }))).status).toBe('invoiced');
    // One invoice list (1414): staffing finance sees the project drafts in Staffing desk › Invoices.
    const list = (await api('sfin', 'get', '/staffing/invoices').expect(200)).body.rows as { id: string; kind: string }[];
    expect(list.map((x) => x.id).sort()).toEqual([...r.ids].sort());
  });

  it('no line is billed twice: the same items again are refused, the WIP drops them, the database refuses a second row', async () => {
    const m = M1.slice(0, 7);
    await api('fin', 'post', '/projects/billing/drafts').send({ seriesId: ids.series, month: m, items: [`hours:${ids.tm}:${ids.e2}`] }).expect(409);
    const b = await bench();
    expect(b.wip.map((w) => w.id).sort()).toEqual([`hours:${ids.tmh}:${ids.e1}:held`, `milestone:${ids.msWait}`].sort());
    await expect(inA((tx) => tx.projectBilling.create({ data: { organizationId: org.A.id, projectId: ids.tm!, sourceType: 'hours', sourceId: ids.l2!, invoiceId: ids.invTn!, amountPaise: 1n } }))).rejects.toThrow();
    // Deleting a draft frees its work; drafting again bills it once more, once.
    await api('boss', 'delete', `/projects/billing/drafts/${ids.invKa}`).expect(403);
    await api('fin', 'delete', `/projects/billing/drafts/${ids.invKa}`).expect(want(200));
    expect((await bench()).wip.some((w) => w.id === `milestone:${ids.msOk}`)).toBe(true);
    ids.invKa = (await api('fin', 'post', '/projects/billing/drafts').send({ seriesId: ids.series, month: m, items: [`milestone:${ids.msOk}`, `retainer:${ids.ret}:${m}`] }).expect(want(201))).body.ids[0];
    expect(await inA((tx) => tx.projectBilling.count({ where: { invoiceId: ids.invKa } }))).toBe(2);
  });

  it('1415: the account manager approves before finance issues when the company asks; then finance issues on the series', async () => {
    const draft = async (id: string) => (await bench()).drafts.find((x) => x.id === id)!;
    // Off by default: the account manager has nothing to approve.
    await api('am', 'post', `/projects/billing/drafts/${ids.invTn}/approve`).send({ version: 1 }).expect(409);
    expect((await api('am', 'get', '/projects/billing').expect(200)).body).toMatchObject({ approver: true, amApproval: false, drafts: [] });
    await api('boss', 'put', '/projects/settings').send({ changes: [{ key: 'projects.billing.am_approval', value: 'on' }] }).expect(403);
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.billing.am_approval', value: 'on' }] }).expect(want(200));
    const tn = await draft(ids.invTn!);
    expect((await api('fin', 'post', `/projects/billing/drafts/${ids.invTn}/issue`).send({ version: tn.version }).expect(409)).body.message).toMatch(/account manager approves/);
    // The staffing desk's own issue button is held the same way (one engine).
    await api('sfin', 'post', `/staffing/invoices/${ids.invTn}/issue`).send({ version: tn.version }).expect(409);
    await api('fin', 'post', `/projects/billing/drafts/${ids.invTn}/approve`).send({ version: tn.version }).expect(403); // finance is not the account manager
    expect((await api('am', 'get', '/projects/billing').expect(200)).body.drafts.map((x: { id: string }) => x.id).sort()).toEqual([ids.invTn, ids.invKa].sort());
    await api('am', 'post', `/projects/billing/drafts/${ids.invTn}/approve`).send({ version: tn.version + 5 }).expect(409);
    await api('am', 'post', `/projects/billing/drafts/${ids.invTn}/approve`).send({ version: tn.version }).expect(want(201));
    await api('am', 'post', `/projects/billing/drafts/${ids.invTn}/approve`).send({ version: tn.version + 1 }).expect(409);
    const approved = await draft(ids.invTn!);
    expect(approved.amApprovedAt).not.toBeNull();
    await api('boss', 'post', `/projects/billing/drafts/${ids.invTn}/issue`).send({ version: approved.version }).expect(403);
    expect((await api('fin', 'post', `/projects/billing/drafts/${ids.invTn}/issue`).send({ version: approved.version }).expect(want(201))).body.number).toBe('P6/7');
    const ka = await draft(ids.invKa!);
    await api('am', 'post', `/projects/billing/drafts/${ids.invKa}/approve`).send({ version: ka.version }).expect(want(201));
    expect((await api('fin', 'post', `/projects/billing/drafts/${ids.invKa}/issue`).send({ version: ka.version + 1 }).expect(want(201))).body.number).toBe('P6/8');
    await api('fin', 'delete', `/projects/billing/drafts/${ids.invTn}`).expect(409); // issued: never deleted
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.billing.am_approval', value: 'off' }] }).expect(want(200));
  });

  it('a client sees only their own invoices in the portal', async () => {
    await api('am', 'post', `/staffing/clients/${ids.tn}/contacts/${ids.contact}/portal`).send({ access: true }).expect(want(201));
    send.mockClear();
    const email = `meera-${run}@nilgiri.test`;
    await portal('post', '/code').send({ email }).expect(200);
    let code = '';
    for (let i = 0; i < 50 && !code; i++) {
      const m = send.mock.calls.find(([x]) => x.to === email);
      if (m) code = m[0].subject.slice(0, 6);
      else await new Promise((r) => setTimeout(r, 100));
    }
    const t = (await portal('post', '/verify').send({ email, code }).expect(200)).body.token as string;
    const me = (await portal('get', '/me', t).expect(200)).body as { invoices: { id: string; no: string }[] };
    expect(me.invoices.map((x) => x.no)).toEqual(['P6/7']);
    await portal('get', `/invoices/${ids.invKa}/pdf`, t).expect(404);
    await portal('get', `/invoices/${ids.invTn}/pdf`, t).expect(200);
  });

  it('1416: fewer billed hours make a credit note; pay recovery follows the setting; the employee is told', async () => {
    await api('fin', 'post', `/projects/billing/lines/${ids.l1}/correct`).send({ hours: 16, reason: 'No change' }).expect(400);
    await api('fin', 'post', `/projects/billing/lines/${ids.l1}/correct`).send({ hours: 12, reason: 'x' }).expect(400);
    await api('fin', 'post', `/projects/billing/lines/${ids.l1}/correct`).send({ hours: 200, reason: 'Too many' }).expect(400);
    const facts = (await api('fin', 'get', `/projects/billing/lines/${ids.l1}`).expect(200)).body;
    expect(facts).toMatchObject({ project: 'TM', hours: 16, rate: '1600.00', invoice: { number: 'P6/7', status: 'issued' }, locked: false, recovery: false });
    const r = (await api('fin', 'post', `/projects/billing/lines/${ids.l1}/correct`).send({ hours: 12, reason: 'Stand-up booked twice' }).expect(want(201))).body;
    expect(r).toMatchObject({ adjustment: false, document: { kind: 'credit_note', number: 'P6/CN1' }, recoveryHours: 0 });
    const cn = await inA((tx) => tx.staffingInvoice.findFirstOrThrow({ where: { number: 'P6/CN1' }, include: { lines: true } }));
    expect(cn).toMatchObject({ kind: 'credit_note', creditOf: ids.invTn, taxablePaise: 640000n });
    expect(cn.lines[0]!.projectId).toBe(ids.tm);
    const line = await inA((tx) => tx.timesheetLine.findUniqueOrThrow({ where: { id: ids.l1 } }));
    expect(line).toMatchObject({ status: 'corrected', approvedMinutes: [480, 240, 0, 0, 0, 0, 0], reason: 'Stand-up booked twice' });
    // Pay recovery is a setting (default none): on, the next correction down records it.
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.correction.pay_recovery', value: 'next_payroll' }] }).expect(want(200));
    const r2 = (await api('fin', 'post', `/projects/billing/lines/${ids.l1}/correct`).send({ hours: 10, reason: 'Training hour booked here' }).expect(want(201))).body;
    expect(r2).toMatchObject({ document: { kind: 'credit_note', number: 'P6/CN2' }, recoveryHours: 2 });
    expect(await inA((tx) => tx.projectCorrection.findMany({ where: { lineId: ids.l1 }, orderBy: { createdAt: 'asc' }, select: { beforeMinutes: true, afterMinutes: true, recoveryMinutes: true, documentKind: true } }))).toEqual([
      { beforeMinutes: 960, afterMinutes: 720, recoveryMinutes: 0, documentKind: 'credit_note' },
      { beforeMinutes: 720, afterMinutes: 600, recoveryMinutes: 120, documentKind: 'credit_note' },
    ]);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'projects.time.corrected' } }))).toBe(2);
    expect(await inA((tx) => tx.userNotification.count({ where: { recipientUserId: users.e1, type: 'projects.correction' } }))).toBe(2);
  });

  it('1416: more billed hours make a supplementary draft; time on a draft waits; a credit note never exceeds the invoice', async () => {
    const r = (await api('fin', 'post', `/projects/billing/lines/${ids.l2}/correct`).send({ hours: 10, reason: 'Client workshop not booked' }).expect(want(201))).body;
    expect(r.document).toMatchObject({ kind: 'supplementary', number: null });
    const sup = (await bench()).drafts.find((x) => x.id === r.document.id)!;
    expect(sup).toMatchObject({ client: `Nilgiri Retail ${run}`, taxable: '3200.00' });
    expect(await inA((tx) => tx.projectBilling.count({ where: { sourceType: 'correction', invoiceId: r.document.id } }))).toBe(1);
    // e2's line is on that draft no more (it was billed on P6/7); the supplementary is the only new draft.
    await api('fin', 'post', `/projects/billing/drafts/${r.document.id}/issue`).send({ version: sup.version }).expect(want(201));
    // Time on a draft invoice waits for the draft.
    await inA((tx) => tx.timesheetLine.update({ where: { id: ids.lh }, data: { clientStatus: 'approved' } }));
    const d = (await api('fin', 'post', '/projects/billing/drafts').send({ seriesId: ids.series, month: M1.slice(0, 7), items: [`hours:${ids.tmh}:${ids.e1}`] }).expect(want(201))).body.ids[0] as string;
    expect((await api('fin', 'post', `/projects/billing/lines/${ids.lh}/correct`).send({ hours: 3, reason: 'One hour too many' }).expect(409)).body.message).toMatch(/draft invoice/);
    await api('fin', 'delete', `/projects/billing/drafts/${d}`).expect(want(200));
    // A credit note never exceeds what is left on the invoice: staffing finance credits all but ₹100 of P6/7 ...
    const inv = await inA((tx) => tx.staffingInvoice.findUniqueOrThrow({ where: { id: ids.invTn } }));
    const credited = (await inA((tx) => tx.staffingInvoice.aggregate({ where: { creditOf: ids.invTn }, _sum: { taxablePaise: true } })))._sum.taxablePaise ?? 0n;
    const left = inv.taxablePaise - credited;
    await api('sfin', 'post', `/staffing/invoices/${ids.invTn}/credit-note`).send({ amount: ((Number(left) + 100) / 100).toFixed(2), reason: 'Too much' }).expect(400);
    await api('sfin', 'post', `/staffing/invoices/${ids.invTn}/credit-note`).send({ amount: ((Number(left) - 10000) / 100).toFixed(2), reason: 'Discount agreed' }).expect(want(201));
    // ... so taking 1 h (₹1,600) off e1's line would credit more than the ₹100 left: refused, and nothing changes.
    const before = await inA((tx) => tx.timesheetLine.findUniqueOrThrow({ where: { id: ids.l1 } }));
    expect((await api('fin', 'post', `/projects/billing/lines/${ids.l1}/correct`).send({ hours: 9, reason: 'One more hour off' }).expect(400)).body.message).toMatch(/more than what is left/);
    expect(await inA((tx) => tx.timesheetLine.findUniqueOrThrow({ where: { id: ids.l1 } }))).toEqual(before);
    expect(await inA((tx) => tx.projectCorrection.count({ where: { lineId: ids.l1 } }))).toBe(2);
  });

  it('1416: a locked month is never changed; the correction is an adjustment in the current month that the cost job counts', async () => {
    await inA((tx) => tx.payPeriod.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, periodStart: day(M0), periodEnd: day(plus(M1, -1)), stage: 'locked' } }));
    expect((await api('fin', 'get', `/projects/billing/lines/${ids.l0}`).expect(200)).body).toMatchObject({ locked: true, invoice: null, hours: 8 });
    const r = (await api('fin', 'post', `/projects/billing/lines/${ids.l0}/correct`).send({ hours: 6, reason: 'Booked to the wrong project' }).expect(want(201))).body;
    expect(r).toMatchObject({ adjustment: true, document: null });
    expect(await inA((tx) => tx.timesheetLine.findUniqueOrThrow({ where: { id: ids.l0 } }))).toMatchObject({ status: null, minutes: [480, 0, 0, 0, 0, 0, 0] });
    expect(await inA((tx) => tx.projectCorrection.findFirstOrThrow({ where: { lineId: ids.l0 } }))).toMatchObject({ adjustment: true, effectiveMonth: day(M2) });
    // The unbilled line now bills its corrected hours.
    expect((await bench(M0)).wip.find((w) => w.id === `hours:${ids.tm}:${ids.e1}`)).toMatchObject({ hours: 6, amount: '9600.00' });
    await costs.costSweep([org.A.id], today);
    const now = await inA((tx) => tx.projectCost.findFirstOrThrow({ where: { projectId: ids.tm, month: day(M2) } }));
    expect(now.minutes).toBe(-120);
    const m0 = await inA((tx) => tx.projectCost.findFirstOrThrow({ where: { projectId: ids.tm, month: day(M0) } }));
    expect(m0.minutes).toBe(480); // the locked month itself is not restated by the adjustment
  });

  it('1621: revenue for margin is billed revenue for every model, less credit notes; 1622: quarters and the cost journal', async () => {
    const m = M2.slice(0, 7);
    const rows = (await api('fin', 'get', `/projects/costs?month=${m}`).expect(200)).body.rows as { code: string; revenue: string | null }[];
    // TM issued this month: 38,400 + 1,200 (P6/7 lines) + 3,200 (supplementary) − 6,400 − 3,200 (its credit notes); the
    // staffing desk's own credit note names no project.
    expect(rows.find((r) => r.code === 'TM')!.revenue).toBe('33200.00');
    const q = `${M2.slice(0, 4)}-Q${Math.floor((Number(M2.slice(5, 7)) - 1) / 3) + 1}`;
    const quarter = (await api('fin', 'get', `/projects/costs?quarter=${q}`).expect(200)).body;
    expect(quarter.month).toBe(q);
    expect(quarter.rows.some((r: { code: string }) => r.code === 'TM')).toBe(true);
    await api('fin', 'get', '/projects/costs?quarter=2026-Q5').expect(400);
    await api('fin', 'get', '/projects/costs/journal').expect(400);
    const csv = await api('fin', 'get', `/projects/costs/journal?month=${M1.slice(0, 7)}`).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const text = csv.text ?? (csv.body as Buffer).toString('utf8');
    expect(text.split('\r\n')[0]).toBe('Date,Voucher,Account,Cost centre,Debit,Credit,Narration');
    expect(text).toContain('Project cost: expenses');
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'projects.cost.journal_exported' } }))).toBe(1);
  });
});
