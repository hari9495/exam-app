import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { ReverificationService } from '../src/documents/reverification.service';
import { addMonths, dueStatus } from '../src/documents/reverification-rules';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// PPL-42 re-verification cycles end to end against the real database (forced RLS): HR's dated rules per legal entity,
// who is due and overdue (the maths from the last verification or the joining day), the document class of each type,
// asking for a fresh copy through the documents engine, the daily reminders, what the person and their manager see on
// the record, people without the key, and another company kept apart.
describe('People: re-verification cycles (PPL-42)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let reverification: ReverificationService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrB' | 'hr' | 'entHr' | 'mgr' | 'emp' | 'old' | 'none';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const verified = (personId: string, typeKey: string, on: string) =>
    inA(async (tx) => {
      const data = { status: 'verified', verifiedAt: new Date(`${on}T06:00:00Z`) };
      const d = await tx.document.findFirst({ where: { organizationId: org.A.id, personId, typeKey } });
      if (d) await tx.document.update({ where: { id: d.id }, data });
      else await tx.document.create({ data: { organizationId: org.A.id, personId, typeKey, ...data } });
    });
  const due = async (who: Who) => (await api(who, 'get', '/documents/reverification/due').expect(200)).body.rows as { ruleId: string; employeeId: string; typeName: string; due: string; status: string; request: string; lastVerified: string | null; name: string }[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(BlobStorageService)
      .useValue(createFakeBlobStorage())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    reverification = moduleRef.get(ReverificationService);

    const planId = (await prisma.plan.create({ data: { name: `reverif-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Reverif Org ${k}`, slug: `reverif-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrB', 'B', 'panel', tpl('hr_admin')],
      ['hr', 'A', 'panel', tpl('hr_admin')],
      ['entHr', 'A', 'panel', null],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['old', 'A', 'panel', null],
      ['none', 'A', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@reverif-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.e1 = (await tx.legalEntity.create({ data: { ...o, name: 'Reverif Foods', shortName: `RF-${run}`, isDefault: true } })).id;
      ids.e2 = (await tx.legalEntity.create({ data: { ...o, name: 'Reverif Plants', shortName: `RP-${run}` } })).id;
      ids.l1 = (await tx.location.create({ data: { ...o, legalEntityId: ids.e1, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      ids.l2 = (await tx.location.create({ data: { ...o, legalEntityId: ids.e2, name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Finance', code: 'FIN', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      // Entity HR: HR Executive (document.manage, Personal class, not Confidential) for the second legal entity only.
      const role = await tx.permissionProfile.create({ data: { ...o, name: `ent-hr-${run}`, permissionsJson: JSON.stringify(tpl('hr_executive')) } });
      await tx.roleGrant.create({ data: { ...o, userId: users.entHr, permissionProfileId: role.id, scopeType: 'legal_entity', legalEntityId: ids.e2, validFrom: new Date('2026-01-01T00:00:00Z'), status: 'active', reason: 'Plant HR', grantedBy: users.adminA } });
    });
    for (const [who, k] of Object.entries({ adminA: 'A', adminB: 'B', hrB: 'B', hr: 'A', entHr: 'A', mgr: 'A', emp: 'A', old: 'A', none: 'A' }) as [Who, 'A' | 'B'][]) {
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@reverif-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    const hire = async (who: Who, code: string, entity: string, location: string, joinedOn: string, manager: string | null) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({ legalEntityId: entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Records moved in from the old system', givenName: who, familyName: run, employeeCode: code, joinedOn, userId: users[who], workEmail: `${who}@reverif-${run}.test`, assignment: { locationId: location, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.mgrEmp = await hire('mgr', 'R-001', ids.e1, ids.l1, '2024-01-08', null);
    ids.empEmp = await hire('emp', 'R-002', ids.e1, ids.l1, '2026-04-06', ids.mgrEmp);
    ids.oldEmp = await hire('old', 'R-003', ids.e2, ids.l2, '2024-01-08', null);
    ids.hrEmp = await hire('hr', 'R-004', ids.e1, ids.l1, '2024-01-08', null);
    for (const k of ['mgr', 'emp', 'old'] as const) ids[`${k}Person`] = await inA(async (tx) => (await tx.employee.findFirstOrThrow({ where: { id: ids[`${k}Emp`] } })).personId);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
  });

  it('rules need document.manage over the legal entity: company-wide HR, entity HR for its entity only, never another company', async () => {
    await api('emp', 'get', '/documents/reverification/rules').expect(403);
    await api('none', 'get', '/documents/reverification/rules').expect(403);
    await api('mgr', 'post', '/documents/reverification/rules').send({ typeKey: 'pan_card', everyMonths: 12, validFrom: today }).expect(403);
    await api('hr', 'post', '/documents/reverification/rules').send({ typeKey: 'nope_type', everyMonths: 12, validFrom: today }).expect(400);
    await api('hr', 'post', '/documents/reverification/rules').send({ typeKey: 'pan_card', everyMonths: 0, validFrom: today }).expect(400);
    await api('hr', 'post', '/documents/reverification/rules').send({ typeKey: 'pan_card', everyMonths: 12, validFrom: today, onRoleChange: true }).expect(400);
    ids.panRule = (await api('hr', 'post', '/documents/reverification/rules').send({ typeKey: 'pan_card', everyMonths: 12, validFrom: today }).expect(201)).body.id;
    // Entity HR: not a company-wide rule, not another entity, but its own entity.
    await api('entHr', 'post', '/documents/reverification/rules').send({ typeKey: 'photo', everyMonths: 6, validFrom: today }).expect(403);
    await api('entHr', 'post', '/documents/reverification/rules').send({ legalEntityId: ids.e1, typeKey: 'photo', everyMonths: 6, validFrom: today }).expect(403);
    ids.photoRule = (await api('entHr', 'post', '/documents/reverification/rules').send({ legalEntityId: ids.e2, typeKey: 'photo', everyMonths: 6, validFrom: today }).expect(201)).body.id;
    await api('entHr', 'post', `/documents/reverification/rules/${ids.panRule}/end`).send({}).expect(404);
    const mine = (await api('entHr', 'get', '/documents/reverification/rules').expect(200)).body;
    expect(mine.canManageCompany).toBe(false);
    expect(mine.entities.map((e: { id: string }) => e.id)).toEqual([ids.e2]);
    expect(mine.rules.find((r: { id: string }) => r.id === ids.panRule).canManage).toBe(false);
    // Another company sees none of it and cannot reach it.
    expect((await api('hrB', 'get', '/documents/reverification/rules').expect(200)).body.rules).toEqual([]);
    await api('hrB', 'post', `/documents/reverification/rules/${ids.panRule}/end`).send({}).expect(404);
    await api('hrB', 'post', '/documents/reverification/rules').send({ legalEntityId: ids.e1, typeKey: 'pan_card', everyMonths: 12, validFrom: today }).expect(404);
  });

  it('due and overdue: N months after the last verification, or after joining; a rule from a later date is not in force', async () => {
    await verified(ids.oldPerson, 'pan_card', addDays(addMonths(today, -12), -1)); // overdue by a day
    await verified(ids.mgrPerson, 'pan_card', addDays(addMonths(today, -12), 10)); // due in 10 days
    const rows = (await due('hr')).filter((r) => r.ruleId === ids.panRule);
    const of = (e: string) => rows.find((r) => r.employeeId === e)!;
    expect(of(ids.oldEmp)).toMatchObject({ due: addDays(today, -1), status: 'overdue', request: 'not asked', lastVerified: addDays(addMonths(today, -12), -1) });
    expect(of(ids.mgrEmp)).toMatchObject({ due: addDays(today, 10), status: 'due soon' });
    expect(of(ids.empEmp)).toMatchObject({ due: addMonths('2026-04-06', 12), lastVerified: null, status: dueStatus(addMonths('2026-04-06', 12), today) });
    expect(rows.some((r) => r.employeeId === ids.hrEmp)).toBe(false); // never one's own
    expect(rows.map((r) => r.due)).toEqual([...rows.map((r) => r.due)].sort());
    // The photo rule is for the second entity only.
    expect((await due('hr')).filter((r) => r.ruleId === ids.photoRule).map((r) => r.employeeId)).toEqual([ids.oldEmp]);
    // A rule that starts tomorrow is not in force yet.
    const later = (await api('hr', 'post', '/documents/reverification/rules').send({ typeKey: 'education', everyMonths: 1, validFrom: addDays(today, 1) }).expect(201)).body.id;
    expect((await due('hr')).some((r) => r.ruleId === later)).toBe(false);
  });

  it('the document class of each type and the scope decide the rows; no key, no list', async () => {
    const rows = await due('entHr');
    // HR Executive in the second entity: the Personal photo there, not the Confidential PAN card, not the first entity.
    expect(rows.map((r) => `${r.ruleId}:${r.employeeId}`)).toEqual([`${ids.photoRule}:${ids.oldEmp}`]);
    await api('mgr', 'get', '/documents/reverification/due').expect(403);
    await api('none', 'get', '/documents/reverification/due').expect(403);
    expect((await api('hrB', 'get', '/documents/reverification/due').expect(200)).body.rows).toEqual([]);
    await api('entHr', 'post', '/documents/reverification/ask').send({ ruleId: ids.panRule, employeeId: ids.oldEmp }).expect(404);
    await api('hrB', 'post', '/documents/reverification/ask').send({ ruleId: ids.panRule, employeeId: ids.oldEmp }).expect(404);
    await api('emp', 'post', '/documents/reverification/ask').send({ ruleId: ids.panRule, employeeId: ids.oldEmp }).expect(403);
  });

  it('asking for a fresh copy re-opens the document, tells the person, and holds the cycle until it is verified', async () => {
    const before = await inA((tx) => tx.userNotification.count({ where: { recipientUserId: users.old } }));
    await api('hr', 'post', '/documents/reverification/ask').send({ ruleId: ids.panRule, employeeId: ids.oldEmp }).expect(200);
    await api('hr', 'post', '/documents/reverification/ask').send({ ruleId: ids.panRule, employeeId: ids.oldEmp }).expect(409);
    const doc = await inA((tx) => tx.document.findFirstOrThrow({ where: { personId: ids.oldPerson, typeKey: 'pan_card' } }));
    expect(doc.status).toBe('requested');
    for (let i = 0; i < 20 && (await inA((tx) => tx.userNotification.count({ where: { recipientUserId: users.old } }))) === before; i++) await new Promise((r) => setTimeout(r, 100));
    expect(await inA((tx) => tx.userNotification.count({ where: { recipientUserId: users.old, type: 'document.requested' } }))).toBeGreaterThan(0);
    // The person uploads (verified_at clears while it waits for the check): the row keeps its due date and shows the upload.
    await inA((tx) => tx.document.update({ where: { id: doc.id }, data: { status: 'uploaded', verifiedAt: null } }));
    let row = (await due('hr')).find((r) => r.ruleId === ids.panRule && r.employeeId === ids.oldEmp)!;
    expect(row).toMatchObject({ due: addDays(today, -1), request: 'uploaded', status: 'overdue' });
    // Verified in the queue: the next cycle starts from today.
    await inA((tx) => tx.document.update({ where: { id: doc.id }, data: { status: 'verified', verifiedAt: new Date() } }));
    row = (await due('hr')).find((r) => r.ruleId === ids.panRule && r.employeeId === ids.oldEmp)!;
    expect(row).toMatchObject({ due: addMonths(row.lastVerified!, 12), request: 'not asked', status: 'not due' });
  });

  it('reminds the person of an asked copy once it is due, then weekly', async () => {
    const count = () => inA((tx) => tx.userNotification.count({ where: { recipientUserId: users.mgr, type: 'document.requested' } }));
    const none = await count();
    await api('hr', 'post', '/documents/reverification/ask').send({ ruleId: ids.panRule, employeeId: ids.mgrEmp }).expect(200);
    for (let i = 0; i < 30 && (await count()) === none; i++) await new Promise((r) => setTimeout(r, 100)); // the ask's own notice
    const asked = await count();
    expect(asked).toBe(none + 1);
    // The sweep covers every company; this person's notifications tell what it did for them.
    const after = async (day: string) => {
      const n = await count();
      await reverification.remindSweep(day);
      return (await count()) - n;
    };
    expect(await after(today)).toBe(0); // due in 10 days
    expect(await after(addDays(today, 10))).toBe(1);
    expect(await after(addDays(today, 12))).toBe(0);
    expect(await after(addDays(today, 17))).toBe(1);
    expect(await count()).toBe(asked + 2);
    // Uploaded: no more reminders.
    await inA((tx) => tx.document.updateMany({ where: { personId: ids.mgrPerson, typeKey: 'pan_card' }, data: { status: 'uploaded' } }));
    expect(await after(addDays(today, 30))).toBe(0);
  });

  it('the record: the person sees their own due dates, the manager only that a re-check is due, others nothing', async () => {
    const own = (await api('emp', 'get', `/documents/reverification/person/${ids.empEmp}`).expect(200)).body.items;
    expect(own).toEqual([{ due: addMonths('2026-04-06', 12), status: dueStatus(addMonths('2026-04-06', 12), today), typeName: 'PAN card' }]);
    const team = (await api('mgr', 'get', `/documents/reverification/person/${ids.empEmp}`).expect(200)).body.items;
    expect(team).toEqual([{ due: addMonths('2026-04-06', 12), status: dueStatus(addMonths('2026-04-06', 12), today) }]);
    expect((await api('hr', 'get', `/documents/reverification/person/${ids.empEmp}`).expect(200)).body.items[0].typeName).toBe('PAN card');
    await api('none', 'get', `/documents/reverification/person/${ids.empEmp}`).expect(404);
    await api('emp', 'get', `/documents/reverification/person/${ids.mgrEmp}`).expect(404);
    await api('hrB', 'get', `/documents/reverification/person/${ids.empEmp}`).expect(404);
  });

  it('ending a rule keeps it in the list, dated; once ended it is out of the due list', async () => {
    await api('hr', 'post', `/documents/reverification/rules/${ids.panRule}/end`).send({ validTo: addDays(today, -1) }).expect(400); // before it starts
    await api('hr', 'post', `/documents/reverification/rules/${ids.panRule}/end`).send({}).expect(200);
    await api('hr', 'post', `/documents/reverification/rules/${ids.panRule}/end`).send({}).expect(409);
    expect((await api('hr', 'get', '/documents/reverification/rules').expect(200)).body.rules.find((x: { id: string }) => x.id === ids.panRule)).toMatchObject({ validTo: today, active: true }); // its last day
    const old = (await api('hr', 'post', '/documents/reverification/rules').send({ typeKey: 'bank_proof', everyMonths: 12, validFrom: '2025-01-01' }).expect(201)).body.id;
    expect((await due('hr')).some((x) => x.ruleId === old)).toBe(true);
    await api('hr', 'post', `/documents/reverification/rules/${old}/end`).send({ validTo: addDays(today, -1) }).expect(200);
    expect((await api('hr', 'get', '/documents/reverification/rules').expect(200)).body.rules.find((x: { id: string }) => x.id === old)).toMatchObject({ validTo: addDays(today, -1), active: false });
    expect((await due('hr')).some((x) => x.ruleId === old)).toBe(false);
  });
});
