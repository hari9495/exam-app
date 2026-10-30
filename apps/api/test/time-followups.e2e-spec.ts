import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { LeaveV2Service } from '../src/time/leave-v2.service';
import { addDays } from '../src/time/time-maths';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Time follow-ups (founder, 30 Oct 2026), end to end against the real database (forced RLS, the app role): WithNote,
// the paused sign-in message, Send back for changes, comp-off by roster and removing a holiday. Each: the positive path
// and the wrong role, another company, out of scope, bad input and a repeat. (Training and the kiosk leave switch are in
// time-devices, which has a kiosk.)
describe('Time follow-ups', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let leaveV2: LeaveV2Service;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'mgr' | 'emp' | 'peer' | 'mgr2' | 'paused' | 'gone' | 'empB' | 'ro1' | 'ro2' | 'ro3' | 'ro4';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const ZONE = 'Asia/Kolkata';
  const today = DateTime.now().setZone(ZONE).toISODate()!;
  const d = (n: number) => addDays(today, n);
  const asDate = (on: string) => new Date(`${on}T00:00:00Z`);
  const setting = (key: string, value: string) => api('adminA', 'put', '/org/settings').send({ key, value, scopeType: 'tenant' }).expect(200);
  const login = (who: Who) => request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[who === 'adminB' || who === 'empB' ? 'B' : 'A'].slug, email: `${who}@fu-${run}.test`, password: PASSWORD });
  const decide = (who: Who, taskId: string, decision: 'approve' | 'reject' | 'send_back', reason?: string) => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision, ...(reason ? { reason } : {}) });

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
    leaveV2 = moduleRef.get(LeaveV2Service);

    planId = (await prisma.plan.create({ data: { name: `fu-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `FU Org ${k}`, slug: `fu-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['peer', 'A', 'panel', null],
      ['mgr2', 'A', 'panel', null],
      ['paused', 'A', 'panel', null],
      ['gone', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
      ['ro1', 'A', 'panel', null],
      ['ro2', 'A', 'panel', null],
      ['ro3', 'A', 'panel', null],
      ['ro4', 'A', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@fu-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await login(who).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `FU Foods ${k}`, shortName: `FU${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Chennai office', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: ZONE, ipRanges: ['10.20.4.0/24'] } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Quality', code: 'QA', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // Every day a working day (no weekly offs), open all day.
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 0, shiftEnd: 1439, weeklyOffs: [] } });
      });
    }
    // The test machine's own network: someone there punches "inside".
    ids.locIn = (await inA((tx) => tx.location.create({ data: { organizationId: org.A.id, legalEntityId: ids.entityA, name: 'Lab', code: 'LAB', address: {}, country: 'IN', state: 'IN-TN', timezone: ZONE, ipRanges: ['127.0.0.0/8', '::1/128'] } }))).id;
    await inA((tx) => tx.locationAttendanceRule.create({ data: { organizationId: org.A.id, locationId: ids.locIn, validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 0, shiftEnd: 1439, weeklyOffs: [] } }));
    // A depot whose weekly off is the weekday two days ago (comp-off by roster).
    ids.locDepot = (await inA((tx) => tx.location.create({ data: { organizationId: org.A.id, legalEntityId: ids.entityA, name: 'Depot', code: 'DEP', address: {}, country: 'IN', state: 'IN-TN', timezone: ZONE, ipRanges: ['10.20.9.0/24'] } }))).id;
    await inA((tx) => tx.locationAttendanceRule.create({ data: { organizationId: org.A.id, locationId: ids.locDepot, validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 540, shiftEnd: 1080, weeklyOffs: [{ weekday: DateTime.fromISO(d(-2)).weekday }] } }));
    const joined = `${addDays(`${today.slice(0, 7)}-01`, -40).slice(0, 7)}-01`;
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A', locationId = ids[`loc${k}`]) =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: joined, userId: users[who], workEmail: `${who}@fu-${run}.test`, assignment: { locationId, departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .then((r) => {
            if (r.status !== 201) throw new Error(`hire ${who}: ${r.status} ${JSON.stringify(r.body)}`);
            return r;
          })
      ).body.id as string;
    ids.mgrEmp = await hire('adminA', 'mgr', null);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.peerEmp = await hire('adminA', 'peer', ids.mgrEmp, 'A', ids.locIn);
    ids.mgr2Emp = await hire('adminA', 'mgr2', null);
    ids.pausedEmp = await hire('adminA', 'paused', ids.mgrEmp);
    ids.goneEmp = await hire('adminA', 'gone', ids.mgrEmp);
    ids.hrEmp = await hire('adminA', 'hr', null);
    ids.empBEmp = await hire('adminB', 'empB', null, 'B');
    ids.ro1Emp = await hire('adminA', 'ro1', null);
    ids.ro2Emp = await hire('adminA', 'ro2', null);
    ids.ro3Emp = await hire('adminA', 'ro3', null, 'A', ids.locDepot);
    ids.ro4Emp = await hire('adminA', 'ro4', null, 'A', ids.locDepot);

    ids.CL = (await api('hr', 'post', '/time/setup/types').send({ code: 'CL', name: 'Casual leave', kind: 'casual', paid: true }).expect(201)).body.id;
    ids.CO = (await api('hr', 'post', '/time/setup/types').send({ code: 'CO', name: 'Comp-off', kind: 'comp_off', paid: true }).expect(201)).body.id;
    ids.policy = (await api('hr', 'post', '/time/setup/policies').send({ name: 'Staff' }).expect(201)).body.id;
    await api('hr', 'post', `/time/setup/policies/${ids.policy}/versions`).send({ validFrom: '2025-01-01', lines: [{ leaveTypeId: ids.CL, annualDays: 12, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: 0 }] }).expect(201);
    await api('hr', 'post', `/time/setup/policies/${ids.policy}/assign`).send({ scopeType: 'legal_entity', scopeId: ids.entityA, validFrom: '2025-01-01' }).expect(201);
    for (const e of [ids.empEmp, ids.peerEmp]) await api('hr', 'post', `/time/people/${e}/adjust`).send({ leaveTypeId: ids.CL, days: 10, reason: 'Opening balance' }).expect(201);
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  // ------------------------------------------------------------------------------------------ WithNote

  describe('WithNote: a note kept with a punch', () => {
    it('kept trimmed and returned; blank or over 200 characters refused; the punch list shows it; another company sees nothing', async () => {
      await api('peer', 'post', '/time/me/punch').send({ kind: 'in', note: '   ' }).expect(400);
      await api('peer', 'post', '/time/me/punch').send({ kind: 'in', note: 'x'.repeat(201) }).expect(400);
      await api('peer', 'post', '/time/me/punch').send({ kind: 'in', note: 42 }).expect(400);
      const p = (await api('peer', 'post', '/time/me/punch').send({ kind: 'in', note: '  Client call ran late  ' }).expect(200)).body;
      expect(p).toMatchObject({ accepted: true, note: 'Client call ran late' });
      const row = await inA((tx) => tx.punch.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: ids.peerEmp, kind: 'in' }, orderBy: { punchedAt: 'desc' } }));
      expect(row.note).toBe('Client call ran late');
      const me = (await api('peer', 'get', `/time/me/attendance?month=${today.slice(0, 7)}`).expect(200)).body;
      expect(me.punches.find((x: { id: string }) => x.id === row.id).note).toBe('Client call ran late');
      // A repeat within the minute is the same punch (its note stays as written).
      expect((await api('peer', 'post', '/time/me/punch').send({ kind: 'in', note: 'Second try' }).expect(200)).body).toMatchObject({ duplicate: true, note: 'Client call ran late' });
      // Without a note: none kept. 200 characters exactly is fine.
      expect((await api('peer', 'post', '/time/me/punch').send({ kind: 'break_start' }).expect(200)).body.note).toBeNull();
      expect((await api('peer', 'post', '/time/me/punch').send({ kind: 'break_end', note: 'y'.repeat(200) }).expect(200)).body.note).toHaveLength(200);
      // The database refuses a blank note even from the app role.
      await expect(inA((tx) => tx.punch.update({ where: { id: row.id }, data: { note: '  ' } }))).rejects.toThrow();
      expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.punch.count({ where: { id: row.id } }))).toBe(0);
    });
  });

  // ------------------------------------------------------------------------------------------ paused sign-in

  describe('Paused sign-in message (TIM-39 Suspend)', () => {
    it('a person paused for block leave is told until when, only once the password is right; deactivated stays "deactivated"', async () => {
      const until = d(4);
      await inA((tx) => tx.blockLeavePlan.create({ data: { organizationId: org.A.id, employeeId: ids.pausedEmp, yearStart: asDate(`${today.slice(0, 4)}-01-01`), fromOn: asDate(d(-1)), toOn: asDate(until), accessPause: 'scheduled' } }));
      await inA((tx) => tx.user.update({ where: { id: users.paused }, data: { status: 'paused' } }));
      const shown = new Date(`${until}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      expect((await login('paused').expect(401)).body.message).toBe(`Your access is paused for block leave until ${shown}. Ask HR if you need access sooner.`);
      // Negative: a wrong password reveals nothing about the pause.
      const wrong = await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `paused@fu-${run}.test`, password: 'Not-The-Password-1' }).expect(401);
      expect(wrong.body.message).not.toMatch(/paused|block leave|deactivated/i);
      // Paused with no running block (say HR paused it some other way): "deactivated".
      await inA((tx) => tx.blockLeavePlan.updateMany({ where: { employeeId: ids.pausedEmp }, data: { accessPause: 'none' } }));
      expect((await login('paused').expect(401)).body.message).toBe('This account has been deactivated');
      await inA((tx) => tx.user.update({ where: { id: users.gone }, data: { status: 'deactivated' } }));
      expect((await login('gone').expect(401)).body.message).toBe('This account has been deactivated');
      await inA((tx) => tx.user.update({ where: { id: users.paused }, data: { status: 'active' } }));
      // (Signing in again works once access is back: TIM-39 in time-gaps; the sign-in throttle stops a fifth try here.)
    });
  });

  // ------------------------------------------------------------------------------------------ Send back for changes

  describe('Send back for changes (leave)', () => {
    it('the manager sends it back with what to change; the days are free; the employee is told; audited', async () => {
      ids.req = (await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.CL, from: d(20), to: d(21), reason: 'Cousin wedding' }).expect(201)).body.id;
      const home = (await api('mgr', 'get', '/time/team/leave-home').expect(200)).body;
      const row = home.waiting.find((w: { id: string }) => w.id === ids.req);
      expect(row.canSendBack).toBe(true);
      ids.task = row.taskId;
      const inbox = (await api('mgr', 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; canSendBack: boolean }[];
      expect(inbox.find((t) => t.taskId === ids.task)?.canSendBack).toBe(true);
      expect((await api('mgr', 'get', `/time/requests/${ids.req}`).expect(200)).body.team).toMatchObject({ taskId: ids.task, canSendBack: true });
      // Negatives: no reason; someone else's task; another company; bulk send back; a bad decision.
      expect((await decide('mgr', ids.task, 'send_back').expect(400)).body.message).toBe('Say what to change, so the person who asked knows.');
      await decide('mgr2', ids.task, 'send_back', 'Move it').expect(404);
      await decide('emp', ids.task, 'send_back', 'Move it').expect(404);
      await decide('empB', ids.task, 'send_back', 'Move it').expect(404);
      await api('mgr', 'post', '/workflow/approvals/tasks/decide').send({ taskIds: [ids.task], decision: 'send_back', reason: 'Move it' }).expect(400);
      await api('mgr', 'post', `/workflow/approvals/tasks/${ids.task}/decide`).send({ decision: 'maybe' }).expect(400);
      const before = (await api('emp', 'get', '/time/me/leave').expect(200)).body.balances.find((b: { leaveTypeId: string }) => b.leaveTypeId === ids.CL);
      expect((await decide('mgr', ids.task, 'send_back', 'The audit runs that week. Move it by a week?').expect(200)).body.status).toBe('sent_back');
      // A repeat is refused.
      await decide('mgr', ids.task, 'send_back', 'Again').expect(409);
      await decide('mgr', ids.task, 'approve').expect(409);
      const mine = (await api('emp', 'get', '/time/me/leave').expect(200)).body;
      const r = mine.requests.find((x: { id: string }) => x.id === ids.req);
      expect(r).toMatchObject({ status: 'sent_back', sentBack: { reason: 'The audit runs that week. Move it by a week?', by: `mgr ${run}` } });
      // Its days no longer wait: the pending count drops.
      expect(mine.balances.find((b: { leaveTypeId: string }) => b.leaveTypeId === ids.CL).pending).toBe(before.pending - 2);
      expect(await inA((tx) => tx.leaveRequestDay.count({ where: { requestId: ids.req, active: true } }))).toBe(0);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'workflow.request.sent_back' } }))).toBe(1);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'leave.request.sent_back', entityId: ids.req } }))).toBe(1);
      expect((await api('mgr', 'get', '/time/team/leave-home').expect(200)).body.waiting.map((w: { id: string }) => w.id)).not.toContain(ids.req);
      const history = (await api('mgr', 'get', '/workflow/approvals/team-history').expect(200)).body as { decision: string; reason: string }[];
      expect(history.find((h) => h.decision === 'sent_back')?.reason).toBe('The audit runs that week. Move it by a week?');
      const notes = await inA((tx) => tx.userNotification.findMany({ where: { recipientUserId: users.emp, type: 'workflow.approval.decided' } }));
      expect(notes.some((n) => /sent back for changes/.test(n.contextText ?? ''))).toBe(true);
    });

    it('the employee changes it and sends it again: all rules again, a new request, the old one "resent"; only once and only theirs', async () => {
      await api('peer', 'post', `/time/me/leave/${ids.req}/resend`).send({ leaveTypeId: ids.CL, from: d(27), to: d(28) }).expect(404);
      await api('empB', 'post', `/time/me/leave/${ids.req}/resend`).send({ leaveTypeId: ids.CL, from: d(27), to: d(28) }).expect(404);
      await api('emp', 'post', `/time/me/leave/${ids.req}/resend`).send({ leaveTypeId: ids.CL, from: d(28), to: d(27) }).expect(400);
      // The rules apply again: more than the balance is refused, and the old request stays sent back.
      expect((await api('emp', 'post', `/time/me/leave/${ids.req}/resend`).send({ leaveTypeId: ids.CL, from: d(27), to: d(45) }).expect(400)).body.code).toBe('LEAVE_RULES');
      expect((await inA((tx) => tx.leaveRequest.findFirstOrThrow({ where: { id: ids.req } }))).status).toBe('sent_back');
      const out = (await api('emp', 'post', `/time/me/leave/${ids.req}/resend`).send({ leaveTypeId: ids.CL, from: d(27), to: d(28), reason: 'Cousin wedding (moved)' }).expect(201)).body;
      expect(out).toMatchObject({ status: 'pending', days: 2, replaces: ids.req });
      expect((await inA((tx) => tx.leaveRequest.findFirstOrThrow({ where: { id: ids.req } }))).status).toBe('resent');
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'leave.request.resent', entityId: ids.req } }))).toBe(1);
      expect((await api('emp', 'post', `/time/me/leave/${ids.req}/resend`).send({ leaveTypeId: ids.CL, from: d(29), to: d(29) }).expect(409)).body.message).toBe('You already sent this request again.');
      // A pending request cannot be "sent again"; the new one waits for the manager as usual.
      await api('emp', 'post', `/time/me/leave/${out.id}/resend`).send({ leaveTypeId: ids.CL, from: d(29), to: d(29) }).expect(409);
      expect((await api('mgr', 'get', '/time/team/leave-home').expect(200)).body.waiting.map((w: { id: string }) => w.id)).toContain(out.id);
    });

    it('the company can turn it off: no Send back offered, and the API refuses it; a sent-back request can be withdrawn', async () => {
      const second = (await api('peer', 'post', '/time/me/leave').send({ leaveTypeId: ids.CL, from: d(30), to: d(30) }).expect(201)).body.id;
      const task = (await api('mgr', 'get', '/time/team/leave-home').expect(200)).body.waiting.find((w: { id: string }) => w.id === second).taskId;
      await setting('leave.send_back', 'off');
      expect((await api('mgr', 'get', '/time/team/leave-home').expect(200)).body.waiting.find((w: { id: string }) => w.id === second).canSendBack).toBe(false);
      expect(((await api('mgr', 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; canSendBack: boolean }[]).find((t) => t.taskId === task)?.canSendBack).toBe(false);
      expect((await decide('mgr', task, 'send_back', 'Move it').expect(400)).body.message).toMatch(/cannot be sent back/);
      await setting('leave.send_back', 'on');
      await decide('mgr', task, 'send_back', 'Pick another day').expect(200);
      expect((await api('peer', 'post', `/time/me/leave/${second}/withdraw`).expect(200)).body.status).toBe('withdrawn');
      await api('peer', 'post', `/time/me/leave/${second}/resend`).send({ leaveTypeId: ids.CL, from: d(31), to: d(31) }).expect(409);
    });
  });

  // ------------------------------------------------------------------------------------------ comp-off by roster

  describe('Comp-off for a holiday on a weekly off follows each person', () => {
    it("credits the people whose own day was off (roster, else the location); people rostered to work get none; once", async () => {
      const on = d(-2);
      const shift = await inA((tx) => tx.shift.create({ data: { organizationId: org.A.id, code: `GEN${run.slice(0, 3)}`, name: 'General' } }));
      await inA((tx) => tx.shiftVersion.create({ data: { organizationId: org.A.id, shiftId: shift.id, validFrom: asDate('2025-01-01'), startMinute: 540, endMinute: 1080 } }));
      const entry = (employeeId: string, isOff: boolean) => inA((tx) => tx.rosterEntry.create({ data: { organizationId: org.A.id, employeeId, workOn: asDate(on), shiftId: isOff ? null : shift.id, isOff, published: true } }));
      // Chennai works every day: ro1 is rostered off (credit), ro2 has no roster (works: none).
      await entry(ids.ro1Emp, true);
      // The depot's weekly off is that day: ro3 is rostered to work (none), ro4 has no roster (the location: credit).
      await entry(ids.ro3Emp, false);
      const holidayAt = async (locationId: string) => {
        const cal = await inA((tx) => tx.holidayCalendar.create({ data: { organizationId: org.A.id, name: `Cal ${locationId.slice(0, 4)}`, locationId, onWeeklyOff: 'comp_off' } }));
        return inA((tx) => tx.holiday.create({ data: { organizationId: org.A.id, calendarId: cal.id, holidayOn: asDate(on), name: 'Harvest festival', kind: 'festival' } }));
      };
      ids.calChennaiHoliday = (await holidayAt(ids.locA)).id;
      await holidayAt(ids.locDepot);
      // Another company's run touches nothing of A.
      expect(await leaveV2.creditHolidayOnWeeklyOff(org.B.id)).toBe(0);
      const n = await leaveV2.creditHolidayOnWeeklyOff(org.A.id);
      const credited = await inA((tx) => tx.leaveLedgerEntry.findMany({ where: { organizationId: org.A.id, kind: 'comp_off', leaveTypeId: ids.CO } }));
      const who = credited.map((c) => c.employeeId);
      expect(who).toEqual(expect.arrayContaining([ids.ro1Emp, ids.ro4Emp]));
      expect(who).not.toContain(ids.ro2Emp);
      expect(who).not.toContain(ids.ro3Emp);
      // Everyone else at Chennai with no roster worked that day: none for them either.
      expect(who).not.toContain(ids.empEmp);
      expect(n).toBe(credited.length);
      expect(credited.every((c) => Number(c.days) === 1)).toBe(true);
      // Safe to re-run.
      expect(await leaveV2.creditHolidayOnWeeklyOff(org.A.id)).toBe(0);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'leave.comp_off.holiday_on_weekly_off' } }))).toBe(1);
    });
  });

  // ------------------------------------------------------------------------------------------ removing a holiday

  describe('Removing a holiday, or moving it off a date, recounts leave booked on it', () => {
    it('approved leave across a removed holiday takes that day again; audited; the person is told', async () => {
      const cal = await inA((tx) => tx.holidayCalendar.findFirstOrThrow({ where: { organizationId: org.A.id, locationId: ids.locA } }));
      ids.cal = cal.id;
      const h = (await api('hr', 'post', `/time/setup/calendars/${cal.id}/holidays`).send({ on: d(40), name: 'Founders day', kind: 'state' }).expect(201)).body.id;
      const req = (await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.CL, from: d(39), to: d(41), reason: 'Trip' }).expect(201)).body;
      expect(req.days).toBe(2);
      const task = (await api('mgr', 'get', '/time/team/leave-home').expect(200)).body.waiting.find((w: { id: string }) => w.id === req.id).taskId;
      await decide('mgr', task, 'approve').expect(200);
      const balance = async () => (await api('emp', 'get', '/time/me/leave').expect(200)).body.balances.find((b: { leaveTypeId: string }) => b.leaveTypeId === ids.CL).balance as number;
      const was = await balance();
      // Negatives: wrong role, another company, not found.
      await api('emp', 'post', `/time/setup/holidays/${h}/remove`).expect(403);
      await api('adminB', 'post', `/time/setup/holidays/${h}/remove`).expect(404);
      await api('hr', 'post', `/time/setup/holidays/${randomUUID()}/remove`).expect(404);
      expect((await api('hr', 'post', `/time/setup/holidays/${h}/remove`).expect(200)).body).toEqual({ id: h, leaveRecounted: 1 });
      const after = await inA((tx) => tx.leaveRequest.findFirstOrThrow({ where: { id: req.id } }));
      expect(Number(after.days)).toBe(3);
      const day = await inA((tx) => tx.leaveRequestDay.findFirstOrThrow({ where: { requestId: req.id, leaveOn: asDate(d(40)) } }));
      expect({ portion: Number(day.portion), countedAs: day.countedAs }).toEqual({ portion: 1, countedAs: 'leave' });
      expect(await balance()).toBe(was - 1);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'leave.request.recounted', entityId: req.id } }))).toBe(1);
      const removed = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { action: 'holiday.removed', entityId: h } }));
      expect(JSON.parse(removed.metadataJson ?? '{}')).toEqual(expect.objectContaining({ leaveRecounted: 1 }));
      expect(await inA((tx) => tx.userNotification.count({ where: { recipientUserId: users.emp, type: 'leave.holiday_removed' } }))).toBe(1);
      // A repeat: the holiday is gone.
      await api('hr', 'post', `/time/setup/holidays/${h}/remove`).expect(404);
      // A holiday that has passed stays.
      expect((await api('hr', 'post', `/time/setup/holidays/${ids.calChennaiHoliday}/remove`).expect(409)).body.message).toBe('That holiday has passed, so it stays on the calendar.');
      ids.recountReq = req.id;
    });

    it('moving a holiday: leave on the new date goes back, leave on the old date counts again (pending: no ledger entry)', async () => {
      const h = (await api('hr', 'post', `/time/setup/calendars/${ids.cal}/holidays`).send({ on: d(50), name: 'Harvest day', kind: 'state' }).expect(201)).body.id;
      const req = (await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.CL, from: d(49), to: d(50) }).expect(201)).body;
      expect(req.days).toBe(1);
      const ledgerBefore = await inA((tx) => tx.leaveLedgerEntry.count({ where: { requestId: req.id } }));
      const out = (await api('hr', 'post', `/time/setup/holidays/${h}/date`).send({ on: d(52) }).expect(200)).body;
      expect(out).toMatchObject({ on: d(52), leaveRecounted: 1 });
      expect(Number((await inA((tx) => tx.leaveRequest.findFirstOrThrow({ where: { id: req.id } }))).days)).toBe(2);
      // Still waiting: the balance's pending count carries it, so no ledger entry.
      expect(await inA((tx) => tx.leaveLedgerEntry.count({ where: { requestId: req.id } }))).toBe(ledgerBefore);
      const moved = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { action: 'holiday.date_changed', entityId: h } }));
      expect(JSON.parse(moved.metadataJson ?? '{}')).toEqual(expect.objectContaining({ from: d(50), to: d(52), leaveRecounted: 1 }));
      // Wrong role and another company.
      await api('emp', 'post', `/time/setup/holidays/${h}/date`).send({ on: d(53) }).expect(403);
      await api('adminB', 'post', `/time/setup/holidays/${h}/date`).send({ on: d(53) }).expect(404);
    });

    it('a holiday moved onto the date, removed, and moved onto it again: credited each time it lands (never blocked by the first)', async () => {
      const id = ids.recountReq;
      const before = Number((await inA((tx) => tx.leaveRequest.findFirstOrThrow({ where: { id } }))).days);
      const days = async () => Number((await inA((tx) => tx.leaveRequest.findFirstOrThrow({ where: { id } }))).days);
      const land = async (from: string) => {
        const x = await inA((tx) => tx.holiday.create({ data: { organizationId: org.A.id, calendarId: ids.cal, holidayOn: asDate(from), name: 'Founders day', kind: 'state' } }));
        expect((await api('hr', 'post', `/time/setup/holidays/${x.id}/date`).send({ on: d(40) }).expect(200)).body.leaveReturned).toBe(1);
        return x.id;
      };
      const first = await land(d(43));
      expect(await days()).toBe(before - 1);
      expect((await api('hr', 'post', `/time/setup/holidays/${first}/remove`).expect(200)).body.leaveRecounted).toBe(1);
      expect(await days()).toBe(before);
      await land(d(44));
      expect(await days()).toBe(before - 1);
      const credits = await inA((tx) => tx.leaveLedgerEntry.findMany({ where: { requestId: id, entryOn: asDate(d(40)), kind: 'cancelled' } }));
      expect(credits).toHaveLength(2);
    });
  });
});
