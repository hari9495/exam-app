import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ApprovalsEngine, type StepSpec } from '../src/workflow/approvals-engine.service';

// E2 parts 2 and 3 (O25, O26; review items 7, 8 and 9; answer 2788), against the real database (forced RLS):
//   holders of a key for the request's legal entity (scoped grants first, company-wide only when none; ordered);
//   up the manager chain until the approval limit covers the amount, or the grade rank reaches a grade (the requester
//   skipped, the walk going on); and a step's needs checked again at decide, delegation, escalation and reassign.
describe('E2: approvers by key, by limit and by grade, checked again later', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let engine: ApprovalsEngine;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const org = { id: '', slug: '' };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const ctx = () => ({ organizationId: org.id, isSuperAdmin: false });
  const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant(ctx(), fn);
  const api = (who: string, method: 'get' | 'post' | 'put', path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const send = (steps: StepSpec[], o: { requester?: string; personId?: string; amount?: number; entity?: string } = {}) =>
    at((tx) =>
      engine.submit(tx, ctx(), {
        type: 'expense.advance',
        subjectType: 'test',
        subjectId: randomUUID(),
        title: `E2 ${run}`,
        summary: [],
        subjectPersonId: o.personId ?? ids.empPerson!,
        requesterUserId: users[o.requester ?? 'emp']!,
        raisedByUserId: users[o.requester ?? 'emp']!,
        steps,
        payload: { ...(o.amount !== undefined ? { amount: o.amount } : {}), ...(o.entity ? { legal_entity_id: o.entity } : {}) },
        payloadFields: [{ key: 'amount', label: 'Amount', type: 'number' }, { key: 'legal_entity_id', label: 'Legal entity', type: 'text' }],
        fallbackUserIds: [users.hr!],
      }),
    );
  const stepOf = async (id: string) => ((await at((tx) => tx.wfRequest.findFirstOrThrow({ where: { id } }))).steps as { approverIds: string[]; requires?: unknown[] }[])[0]!;
  const openTasks = (requestId: string) => at((tx) => tx.wfTask.findMany({ where: { organizationId: org.id, requestId, status: 'open' } }));
  const keyStep = (scope: 'entity' | 'department' | 'location' = 'entity'): StepSpec[] => [{ name: 'Finance head', approvers: [{ kind: 'key_holders', key: 'payroll.run.approve', scope }], mode: 'any', timeoutHours: 1, onTimeout: 'escalate' }];
  const limitStep: StepSpec[] = [{ name: 'Up to the limit', approvers: [{ kind: 'chain_until', until: 'limit', family: 'expense' }], mode: 'any' }];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    engine = moduleRef.get(ApprovalsEngine);
    engine.register({ key: 'expense.advance', label: 'Expense advance', risk: 'normal', autoActions: false, onDecided: async () => undefined, requesterLink: () => '/yx/expenses' });

    ids.plan = (await prisma.plan.create({ data: { name: `e2a-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const o = await prisma.organization.create({ data: { name: `E2 approvers ${run}`, slug: `e2a-${run}`, planId: ids.plan } });
    Object.assign(org, { id: o.id, slug: o.slug });
    const passwordHash = await argon2.hash(PASSWORD);
    const profile = (name: string, keys: string[]) => at((tx) => tx.permissionProfile.create({ data: { organizationId: org.id, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }));
    const fin = await profile('fin', ['payroll.run.approve']);
    const hr = await profile('hr', ['org.settings.manage']);
    const roster: [string, string, string | null][] = [['admin', 'org_admin', null], ['hr', 'panel', hr.id], ['finWide', 'panel', fin.id], ['finE1', 'panel', null], ['finE1b', 'panel', null], ['emp', 'panel', null], ['mgr', 'panel', null], ['dir', 'panel', null], ['plain', 'panel', null]];
    for (const [who, role, permissionProfileId] of roster) {
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: org.id, email: `${who}@e2a-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(app.getHttpServer()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.slug, email: `${who}@e2a-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await at(async (tx) => {
      const base = { organizationId: org.id };
      ids.e1 = (await tx.legalEntity.create({ data: { ...base, name: `E2 One ${run}`, shortName: `E2O-${run}`, isDefault: true } })).id;
      ids.e2 = (await tx.legalEntity.create({ data: { ...base, name: `E2 Two ${run}`, shortName: `E2T-${run}` } })).id;
      ids.loc = (await tx.location.create({ data: { ...base, legalEntityId: ids.e1, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const d = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...base, id: d, name: 'ENG', code: 'ENG', path: `/${d}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...base, name: 'Engineer', code: 'ENGR' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...base, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      for (const [k, rank] of [['g1', 1], ['g2', 2], ['g3', 3]] as const) ids[k] = (await tx.grade.create({ data: { ...base, name: k.toUpperCase(), code: k.toUpperCase(), rank } })).id;
      // finE1 and finE1b: payroll.run.approve only for entity One.
      for (const who of ['finE1', 'finE1b']) await tx.roleGrant.create({ data: { ...base, userId: users[who]!, permissionProfileId: fin.id, scopeType: 'legal_entity', legalEntityId: ids.e1, validFrom: new Date(`${today}T00:00:00Z`), status: 'active', reason: 'Finance head of entity One' } });
    });
    const hire = async (who: string, grade: string, manager: string | null) => {
      const id = (
        await api('admin', 'post', '/people/employees')
          .send({ legalEntityId: ids.e1, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: today, userId: users[who], workEmail: `${who}@e2a-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, gradeId: ids[grade], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
      return id;
    };
    ids.dirEmp = await hire('dir', 'g3', null);
    ids.mgrEmp = await hire('mgr', 'g2', ids.dirEmp);
    ids.empEmp = await hire('emp', 'g1', ids.mgrEmp);
    ids.empPerson = (await at((tx) => tx.employee.findUniqueOrThrow({ where: { id: ids.empEmp }, select: { personId: true } }))).personId;
    // finE1 reports to plain (who holds no key): their escalation must not reach plain.
    ids.plainEmp = await hire('plain', 'g1', null);
    await hire('finE1', 'g1', ids.plainEmp);
    await at(async (tx) => {
      for (const [g, amount] of [['g2', '50000'], ['g3', '200000']] as const) await tx.approvalLimit.create({ data: { organizationId: org.id, family: 'expense', gradeId: ids[g]!, amount, updatedBy: users.admin! } });
    });
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: org.id } });
        await tx.user.deleteMany({ where: { id: { in: all } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: ids.plan } }).catch(() => undefined);
    await app.close();
  });

  it('key holders of the entity: the scoped grants only (ordered), and the step keeps what it needs', async () => {
    const r = await send(keyStep());
    const s = await stepOf(r.id);
    expect(s.approverIds.sort()).toEqual([users.finE1!, users.finE1b!].sort());
    expect(s.approverIds).not.toContain(users.finWide);
    expect(s.requires).toEqual([{ key: 'payroll.run.approve', scope: 'entity', placeId: ids.e1 }]);
  });

  it('2788: an entity with no scoped holder falls back to the company-wide holders', async () => {
    const s = await stepOf((await send(keyStep(), { entity: ids.e2 })).id);
    expect(s.approverIds).toEqual([users.finWide]);
  });

  it('up the chain until the limit covers it: 30k stops at the manager, 80k walks on to the director', async () => {
    expect((await stepOf((await send(limitStep, { amount: 30000 })).id)).approverIds).toEqual([users.mgr]);
    expect((await stepOf((await send(limitStep, { amount: 80000 })).id)).approverIds).toEqual([users.dir]);
  });

  it('review item 9: the manager raising it for her report is skipped and the walk goes on (not emptied to HR)', async () => {
    expect((await stepOf((await send(limitStep, { amount: 30000, requester: 'mgr' })).id)).approverIds).toEqual([users.dir]);
  });

  it('up the chain until a grade: rank 3 is the director', async () => {
    expect((await stepOf((await send([{ name: 'Director', approvers: [{ kind: 'chain_until', until: 'grade', gradeRank: 3 }], mode: 'any' }])).id)).approverIds).toEqual([users.dir]);
  });

  it('negative: above every limit nobody in the chain qualifies, so the fallback (HR) gets it', async () => {
    expect((await stepOf((await send(limitStep, { amount: 500000 })).id)).approverIds).toEqual([users.hr]);
  });

  it('review item 7: reassigning to someone without the key is refused; to a company-wide holder it moves', async () => {
    const r = await send(keyStep());
    const t = (await openTasks(r.id)).find((x) => x.assigneeUserId === users.finE1)!;
    await api('finE1', 'post', `/workflow/approvals/tasks/${t.id}/reassign`).send({ toUserId: users.plain, reason: 'Away next week, please take it' }).expect(400);
    await api('finE1', 'post', `/workflow/approvals/tasks/${t.id}/reassign`).send({ toUserId: users.finWide, reason: 'Away next week, please take it' }).expect(200);
  });

  it('review item 7: a delegate without the key does not take the task; the approver keeps it', async () => {
    await api('finE1b', 'post', '/workflow/delegations').send({ delegateUserId: users.plain, startsOn: today, endsOn: today }).expect(201);
    const r = await send(keyStep());
    const held = (await openTasks(r.id)).map((x) => x.assigneeUserId);
    expect(held).toContain(users.finE1b);
    expect(held).not.toContain(users.plain);
  });

  it('review item 7: escalation goes to the fallback when the manager lacks the key', async () => {
    const r = await send(keyStep());
    // The shared test database holds other suites' due tasks; tick just this request's (tick() reads 500 at a time).
    const later = new Date(Date.now() + 72 * 3_600_000); // past the company's escalation hours (48 by default)
    type TickOne = { tickOne(tx: unknown, c: unknown, id: string, now: Date, notices: unknown[]): Promise<number> };
    for (const t of await openTasks(r.id)) await at((tx) => (engine as unknown as TickOne).tickOne(tx, ctx(), t.id, later, []));
    const held = (await openTasks(r.id)).map((x) => x.assigneeUserId);
    expect(held).not.toContain(users.plain);
    expect(held).toContain(users.hr);
  });

  it('review item 7: someone who lost the key since the request was sent cannot decide it; the step goes to the fallback', async () => {
    const r = await send(keyStep());
    const t = (await openTasks(r.id)).find((x) => x.assigneeUserId === users.finE1)!;
    await at((tx) => tx.roleGrant.updateMany({ where: { organizationId: org.id, userId: users.finE1! }, data: { status: 'revoked' } }));
    const res = await api('finE1', 'post', `/workflow/approvals/tasks/${t.id}/decide`).send({ decision: 'approve' }).expect(403);
    expect(res.body.message).toMatch(/no longer hold what this step needs/);
    const held = (await openTasks(r.id)).map((x) => x.assigneeUserId);
    expect(held).not.toContain(users.finE1);
    expect(held).toContain(users.hr);
    const req = await at((tx) => tx.wfRequest.findFirstOrThrow({ where: { id: r.id } }));
    expect(req.status).toBe('pending');
  });
});
