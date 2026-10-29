import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { DayEngine } from '../src/time/day-engine.service';
import { NOTICE_VERSION } from '../src/time/field-rules';
import { addDays, instantAt } from '../src/time/time-maths';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Founder decisions of 29 Oct 2026 (attendance side), end to end against the real database (forced RLS, the app role):
//   5  "Approve attendance lock" (attendance.lock.approve) approves the two-step lock; payroll.correction.approve no longer does.
//   6  Withdrawing presence or field-tracking consent stops tracking, deletes the trail, keeps the attendance days, is audited
//      with counts, and consent can be given again.
//   7a Opening a frozen month again: attendance.lock, a reason and the second sign-in step, audited.
//   7b Past strikes and lockouts: a paged list of the events in scope.
// Each: the right role, the wrong role, another company, bad input, a repeat and a locked period.
describe('Time decisions 29 Oct 2026 (attendance)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let dayEngine: DayEngine;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrAdmin' | 'hrExec' | 'payroll' | 'corrOnly' | 'payrollB' | 'emp' | 'acting';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  // The last month that may be frozen or locked today (from the 2nd of the next month).
  const lockMonth = (today.slice(8) >= '02' ? addDays(`${thisMonth}-01`, -1) : addDays(addDays(`${thisMonth}-01`, -1).slice(0, 7) + '-01', -1)).slice(0, 7);
  const L = (day: number) => `${lockMonth}-${String(day).padStart(2, '0')}`;
  const ZONE = 'Asia/Kolkata';
  const at = (on: string, hhmm: string) => instantAt(on, ZONE, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
  const setting = (k: 'A' | 'B', key: string, value: string) => tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, (tx) => tx.setting.create({ data: { organizationId: org[k].id, scopeType: 'tenant', scopeId: org[k].id, key, value } }));
  const dayOf = (on: string) => inA((tx) => tx.attendanceDay.findUnique({ where: { organizationId_employeeId_workOn: { organizationId: org.A.id, employeeId: ids.empEmp, workOn: new Date(`${on}T00:00:00Z`) } } }));
  const evaluate = (from: string, to = from) => inA((tx) => dayEngine.evaluate(tx, { organizationId: org.A.id, isSuperAdmin: false }, ids.empEmp, from, to));
  const auditOf = (action: string) => inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action }, orderBy: { createdAt: 'asc' } }));

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
    dayEngine = moduleRef.get(DayEngine);

    planId = (await prisma.plan.create({ data: { name: `timedec-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `TimeDec Org ${k}`, slug: `timedec-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      // HR: attendance.lock, never the approval key (the template says so).
      ['hrAdmin', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['hrExec', 'A', 'panel', ['leave.view', 'attendance.view']],
      // Payroll: the Payroll Admin template (it carries attendance.lock.approve).
      ['payroll', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'payroll_admin')!.permissions],
      // Before decision 5 this key approved the lock; alone it no longer does.
      ['corrOnly', 'A', 'panel', ['payroll.period.view', 'payroll.correction.approve']],
      ['payrollB', 'B', 'panel', ['attendance.lock.approve']],
      ['emp', 'A', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@timedec-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@timedec-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `TimeDec Foods ${k}`, shortName: `TDF${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: ZONE } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // Every day a working day: 9:30 to 18:30, 30 minutes' break (full day 480 minutes, half day 240).
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [] } });
      });
    }
    const hire = async (who: Who, code: string) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({ legalEntityId: ids.entityA, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, employeeCode: code, joinedOn: `${lockMonth}-01`, userId: users[who], workEmail: `${who}@timedec-${run}.test`, assignment: { locationId: ids.locA, departmentId: ids.deptA, designationId: ids.desigA, employmentTypeId: ids.permA, managerEmployeeId: null } })
          .expect(201)
      ).body.id as string;
    ids.empEmp = await hire('emp', `TD1-${run}`);
    ids.hrEmp = await hire('hrAdmin', `TD2-${run}`);
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.payPeriod.updateMany({ where: { organizationId: { in: [org.A.id, org.B.id] } }, data: { stage: 'open' } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('decision 6: withdrawing presence consent (TIM-36)', () => {
    const WFH = () => L(4);
    beforeAll(async () => {
      await setting('A', 'attendance.presence', 'on');
      // An approved work-from-home day in the open month, consent given before it, and five active hours that day.
      await inA(async (tx) => {
        await tx.attendanceRequest.create({ data: { organizationId: org.A.id, employeeId: ids.empEmp, workOn: new Date(`${WFH()}T00:00:00Z`), kind: 'wfh', reason: 'Plumber at home', status: 'approved', decidedAt: new Date() } });
        await tx.presenceConsent.create({ data: { organizationId: org.A.id, employeeId: ids.empEmp, noticeVersion: 'Presence notice v1', givenAt: new Date(`${L(1)}T00:00:00Z`) } });
        await tx.presenceSignal.createMany({
          data: [
            { organizationId: org.A.id, employeeId: ids.empEmp, workOn: new Date(`${WFH()}T00:00:00Z`), at: at(WFH(), '09:30'), state: 'active', source: 'dev_fake' },
            { organizationId: org.A.id, employeeId: ids.empEmp, workOn: new Date(`${WFH()}T00:00:00Z`), at: at(WFH(), '14:30'), state: 'offline', source: 'dev_fake' },
          ],
        });
      });
      await evaluate(WFH());
    });

    it('presence decided the day (half day on five active hours)', async () => {
      expect(await dayOf(WFH())).toMatchObject({ status: 'half_day', workedMinutes: 300 });
    });

    it('the trail cannot be deleted while consent is in force (database rule)', async () => {
      await expect(inA((tx) => tx.presenceSignal.deleteMany({ where: { organizationId: org.A.id, employeeId: ids.empEmp } }))).rejects.toThrow();
      await expect(prisma.$executeRaw`UPDATE presence_signals SET state = 'idle'`).rejects.toThrow();
    });

    it('acting for someone else cannot withdraw', async () => {
      token.acting = (await api('adminA', 'post', `/auth/impersonate/${users.emp}`).expect(200)).body.accessToken;
      await api('acting', 'post', '/time/me/presence/consent').send({ action: 'withdraw' }).expect(403);
    });

    it('withdraw: tracking stops, the trail is deleted, the day stays, the audit has the counts; a repeat is refused', async () => {
      await api('emp', 'post', '/time/me/presence/consent').send({ action: 'stop' }).expect(400);
      const res = (await api('emp', 'post', '/time/me/presence/consent').send({ action: 'withdraw' }).expect(200)).body;
      expect(res).toMatchObject({ given: false, repeat: false, erasedSignals: 2 });
      expect(await inA((tx) => tx.presenceSignal.count({ where: { organizationId: org.A.id, employeeId: ids.empEmp } }))).toBe(0);
      expect(await dayOf(WFH())).toMatchObject({ status: 'half_day', workedMinutes: 300 });
      // Worked out again later (a freeze does this): the day keeps what presence decided, it does not turn into "present".
      await evaluate(L(1), L(10));
      expect(await dayOf(WFH())).toMatchObject({ status: 'half_day', workedMinutes: 300 });
      const [a] = await auditOf('attendance.presence.consent_withdrawn');
      expect(a.actorUserId).toBe(users.emp);
      expect(JSON.parse(a.metadataJson ?? '{}')).toMatchObject({ erasedSignals: 2 });
      // Recording stops at once.
      await api('emp', 'post', '/time/me/presence/signals').send({ signals: [{ at: new Date(Date.now() - 60_000).toISOString(), state: 'active' }] }).expect(403);
      await api('emp', 'post', '/time/me/presence/consent').send({ action: 'withdraw' }).expect(409);
      // The person's own page still shows the day, marked as decided by presence with the trail deleted.
      const mine = (await api('emp', 'get', `/time/me/presence?month=${lockMonth}`).expect(200)).body;
      expect(mine.consent).toBeNull();
      expect(mine.days.find((d: { on: string }) => d.on === WFH())).toMatchObject({ status: 'half_day', byPresence: true, trailDeleted: true, activeMinutes: 300, first: '09:30', last: '14:30' });
    });

    it('consent can be given again, and recording starts again', async () => {
      expect((await api('emp', 'post', '/time/me/presence/consent').send({ action: 'give' }).expect(200)).body.repeat).toBe(false);
      expect((await api('emp', 'post', '/time/me/presence/signals').send({ signals: [{ at: new Date(Date.now() - 60_000).toISOString(), state: 'active' }] }).expect(200)).body.recorded).toBe(1);
      expect(await auditOf('attendance.presence.consent_given')).toHaveLength(1);
    });
  });

  describe('decision 6: withdrawing field-tracking consent (TIM-32/33) follows the same rule', () => {
    it('the trail goes, attendance days and the audit stay; tracking stops; consent can be given again', async () => {
      await setting('A', 'field.tracking', 'on');
      await api('emp', 'post', '/time/me/field/consent/withdraw').expect(409);
      await api('emp', 'post', '/time/me/field/consent').send({ noticeVersion: NOTICE_VERSION }).expect(201);
      await inA((tx) =>
        tx.locationPing.createMany({
          data: [1, 2, 3].map((i) => ({ organizationId: org.A.id, employeeId: ids.empEmp, workOn: new Date(`${today}T00:00:00Z`), at: new Date(Date.now() - i * 60_000), lat: 13.0012, lng: 80.2565, accuracyM: 15, clientRef: randomUUID() })),
        }),
      );
      const before = await dayOf(L(4));
      const res = (await api('emp', 'post', '/time/me/field/consent/withdraw').expect(200)).body;
      expect(res.erasedPings).toBe(3);
      expect(await inA((tx) => tx.locationPing.count({ where: { organizationId: org.A.id, employeeId: ids.empEmp } }))).toBe(0);
      expect(await dayOf(L(4))).toEqual(before);
      const [a] = await auditOf('time.field.consent_withdrawn');
      expect(JSON.parse(a.metadataJson ?? '{}')).toMatchObject({ erasedPings: 3, by: 'employee' });
      expect(a.actorUserId).toBe(users.emp);
      expect((await api('emp', 'post', '/time/me/field/pings').send({ sentAt: new Date().toISOString(), pings: [{ clientRef: randomUUID(), at: new Date().toISOString(), lat: 13.0012, lng: 80.2565, accuracyM: 15 }] }).expect(403)).body.message).toMatch(/not agreed/);
      await api('emp', 'post', '/time/me/field/consent/withdraw').expect(409);
      await api('emp', 'post', '/time/me/field/consent').send({ noticeVersion: NOTICE_VERSION }).expect(201);
    });
  });

  describe('decision 7a: opening a frozen month again (TIM-11)', () => {
    const body = () => ({ legalEntityId: ids.entityA, month: lockMonth });
    beforeAll(async () => {
      // Every working day of the month has a day record (no exceptions block the freeze; waiting requests would).
      await api('hrAdmin', 'post', '/time/periods/freeze').send(body()).expect(200);
    });

    it('needs the second sign-in step first', async () => {
      expect([401, 403]).toContain((await api('hrAdmin', 'post', '/time/periods/unfreeze').send({ ...body(), reason: 'A missed fix for Arjun' })).status);
    });

    it('the wrong role, another company and bad input are refused', async () => {
      await markSteppedUp(tenantPrisma, token.hrAdmin);
      await markSteppedUp(tenantPrisma, token.payroll);
      await markSteppedUp(tenantPrisma, token.adminB);
      await api('payroll', 'post', '/time/periods/unfreeze').send({ ...body(), reason: 'A missed fix for Arjun' }).expect(403);
      await api('hrExec', 'post', '/time/periods/unfreeze').send({ ...body(), reason: 'A missed fix for Arjun' }).expect(403);
      await api('adminB', 'post', '/time/periods/unfreeze').send({ ...body(), reason: 'A missed fix for Arjun' }).expect(404);
      await api('hrAdmin', 'post', '/time/periods/unfreeze').send({ ...body() }).expect(400);
      await api('hrAdmin', 'post', '/time/periods/unfreeze').send({ ...body(), reason: '          ' }).expect(400);
      await api('hrAdmin', 'post', '/time/periods/unfreeze').send({ ...body(), reason: 'short' }).expect(400);
      await api('hrAdmin', 'post', '/time/periods/unfreeze').send({ ...body(), month: '2026-13', reason: 'A missed fix for Arjun' }).expect(400);
    });

    it('HR opens it with a reason (audited); a repeat is refused', async () => {
      expect((await api('hrAdmin', 'post', '/time/periods/unfreeze').send({ ...body(), reason: 'A missed fix for Arjun' }).expect(200)).body.stage).toBe('open');
      const [a] = await auditOf('time.period.unfrozen');
      expect(a.actorUserId).toBe(users.hrAdmin);
      expect(JSON.parse(a.metadataJson ?? '{}')).toMatchObject({ month: lockMonth, reason: 'A missed fix for Arjun' });
      expect((await api('hrAdmin', 'post', '/time/periods/unfreeze').send({ ...body(), reason: 'A missed fix for Arjun' }).expect(409)).body.message).toMatch(/not frozen/);
    });
  });

  describe('decision 5: "Approve attendance lock" (TIM-11 two-step flow)', () => {
    const body = () => ({ legalEntityId: ids.entityA, month: lockMonth });
    beforeAll(async () => {
      await setting('A', 'attendance.lock_flow', 'two_step');
      await setting('B', 'attendance.lock_flow', 'two_step');
      await api('hrAdmin', 'post', '/time/periods/send').send(body()).expect(200);
      for (const who of ['hrAdmin', 'payroll', 'corrOnly', 'payrollB'] as const) await markSteppedUp(tenantPrisma, token[who]);
    });

    it('the Payroll role sees the month and may approve; HR and the old correction key may not', async () => {
      const list = (await api('payroll', 'get', `/time/periods?year=${lockMonth.slice(0, 4)}`).expect(200)).body;
      expect(list.entities.find((e: { id: string }) => e.id === ids.entityA)).toMatchObject({ canApprove: true, canLock: false });
      const hr = (await api('hrAdmin', 'get', `/time/periods?year=${lockMonth.slice(0, 4)}`).expect(200)).body;
      expect(hr.entities.find((e: { id: string }) => e.id === ids.entityA)).toMatchObject({ canApprove: false, canLock: true });
      await api('corrOnly', 'get', `/time/periods?year=${lockMonth.slice(0, 4)}`).expect(403);
      await api('corrOnly', 'post', '/time/periods/approve-lock').send(body()).expect(403);
      await api('hrAdmin', 'post', '/time/periods/approve-lock').send(body()).expect(403);
      await api('payrollB', 'post', '/time/periods/approve-lock').send(body()).expect(404);
      await api('payroll', 'post', '/time/periods/approve-lock').send({ ...body(), month: 'May' }).expect(400);
    });

    it('payroll approves: the month locks (audited with the approver); a repeat and the locked month are refused', async () => {
      expect((await api('payroll', 'post', '/time/periods/approve-lock').send(body()).expect(200)).body).toMatchObject({ stage: 'locked' });
      const [a] = await auditOf('time.period.locked');
      expect(JSON.parse(a.metadataJson ?? '{}')).toMatchObject({ approvedBy: users.payroll, sentBy: users.hrAdmin });
      expect((await api('payroll', 'post', '/time/periods/approve-lock').send(body()).expect(409)).body.message).toMatch(/already locked/);
      // A locked month can't be opened with "open again" either (it goes through the reopen request).
      await api('hrAdmin', 'post', '/time/periods/unfreeze').send({ ...body(), reason: 'A missed fix for Arjun' }).expect(409);
    });

    it('the Payroll Admin template carries the key; HR Admin does not', () => {
      expect(ROLE_TEMPLATES.find((t) => t.key === 'payroll_admin')!.permissions).toContain('attendance.lock.approve');
      expect(ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions).not.toContain('attendance.lock.approve');
    });
  });

  describe('decision 7b: past strikes and lockouts (TIM-37)', () => {
    beforeAll(async () => {
      // Three events in the coming days of the open months (one per week, no overlap).
      for (const [i, kind] of (['strike', 'lockout', 'layoff'] as const).entries()) {
        const from = addDays(today, 1 + i * 7);
        await api('hrAdmin', 'post', '/time/industrial-actions').send({ kind, locationId: ids.locA, from, to: addDays(from, 1), legality: 'undetermined', notice: `Notice ${i + 1} dated ${today}` }).expect(201);
      }
    });

    it('HR gets them newest first, one page at a time, with the total', async () => {
      const page = (await api('hrAdmin', 'get', '/time/industrial-actions?pageSize=25').expect(200)).body;
      expect(page).toMatchObject({ total: 3, page: 1, pageSize: 25 });
      expect(page.events.map((e: { kind: string }) => e.kind)).toEqual(['layoff', 'lockout', 'strike']);
      expect(page.events[0]).toMatchObject({ location: { name: 'Hosur' }, legality: 'undetermined', status: 'active', days: 2 });
      expect((await api('hrAdmin', 'get', '/time/industrial-actions?page=2&pageSize=25').expect(200)).body).toMatchObject({ total: 3, events: [] });
      expect((await api('hrAdmin', 'get', '/time/industrial-actions').expect(200)).body.pageSize).toBe(25);
    });

    it('bad paging, the wrong role and another company are refused or see nothing', async () => {
      await api('hrAdmin', 'get', '/time/industrial-actions?pageSize=10').expect(400);
      await api('hrAdmin', 'get', '/time/industrial-actions?page=0').expect(400);
      await api('hrExec', 'get', '/time/industrial-actions').expect(403);
      await api('emp', 'get', '/time/industrial-actions').expect(403);
      expect((await api('adminB', 'get', '/time/industrial-actions').expect(200)).body).toMatchObject({ total: 0, events: [] });
    });
  });
});
