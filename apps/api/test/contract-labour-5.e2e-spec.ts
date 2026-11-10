import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { createHash, randomBytes, randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { verhoeffValid } from '../src/service-desk/pii';
import { ContractAttendanceService } from '../src/contract-labour/attendance.service';
import { ComplianceService } from '../src/contract-labour/compliance.service';

// Contract labour CL-5 (answers 622, 625, 673, 681, 684, 686, 735, 742): contract workers at the kiosk with the gate pass
// number and their own PIN (never employee punches), the contractor's days where a site has no kiosk, the month
// confirmed and locked, days paid against days on site, the threshold peak and block with registrations, contract
// workers in All persons, gate pass renewal keeping the number, the photo. Another company 404, acting 403.

jest.setTimeout(300_000);

describe('Contract labour CL-5', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let att: ContractAttendanceService;
  let compliance: ComplianceService;
  const send = jest.fn(async (_m: { to: string; subject: string; html: string }) => ({ success: true }));
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'owner' | 'reader' | 'hr' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const kiosk = (method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/kiosk${path}`).set('x-kiosk-token', ids.kioskToken!);
  const portal = (method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/public/contractor-portal/${org.A.slug}${path}`).set('X-Contractor-Portal', ids.portal ?? '');
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const yearsAgo = (n: number) => `${Number(today.slice(0, 4)) - n}${today.slice(4)}`;
  const lastMonth = (() => {
    const [y, m] = today.split('-').map(Number) as [number, number];
    return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  })();
  const aadhaar = (n: number) => {
    const head = `4${String(n).padStart(10, '0')}`;
    for (let d = 0; d < 10; d++) if (verhoeffValid(head + d)) return head + d;
    throw new Error('no check digit');
  };
  const licence = async (locationId: string, no: string, max: string) => {
    const r = api('owner', 'post', `/contract-labour/contractors/${ids.vetri}/licences`);
    for (const [k, v] of Object.entries({ locationId, licenceNo: no, scope: 'Security', states: 'IN-TN', maxWorkers: max, validFrom: addDays(today, -400), validTo: addDays(today, 300) })) r.field(k, v);
    const id = (await r.attach('file', Buffer.from(`%PDF-1.7\n${no}\n%%EOF`), { filename: 'l.pdf', contentType: 'application/pdf' }).expect(want(201))).body.id as string;
    await inA(async (tx) => tx.file.updateMany({ where: { id: (await tx.contractorLicence.findFirstOrThrow({ where: { id } })).fileId, scanStatus: 'pending' }, data: { scanStatus: 'clean', scannedAt: new Date() } }));
    await api('owner', 'post', `/contract-labour/licences/${id}/verify`).expect(want(201));
  };
  /** A deployed worker set up directly (CL-2's own path is tested in contract-labour-2). */
  const deployed = async (locationId: string, n: number, fromOn: string, gate = true) =>
    inA(async (tx) => {
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: `W${n}`, familyName: run } });
      return (await tx.contractDeployment.create({ data: { organizationId: org.A.id, personId: p.id, agencyId: ids.vetri!, locationId, skill: 'unskilled', dob: new Date('1990-01-01T00:00:00Z'), idLast4: '1234', idHash: createHash('sha256').update(`${run}-${n}`).digest('hex'), fromOn: new Date(`${fromOn}T00:00:00Z`), status: 'deployed', gatePassNo: gate ? `GP-T${run.toUpperCase()}-${n}` : `GP-X${n}-${run}`, gateValidTo: new Date(`${addDays(today, 20)}T00:00:00Z`), inductionOn: new Date(`${addDays(today, -100)}T00:00:00Z`), inductionBy: 'Safety officer' } })).id;
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    att = moduleRef.get(ContractAttendanceService);
    compliance = moduleRef.get(ComplianceService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const keys = await redis.keys('auth:otp:ip:*');
    if (keys.length) await redis.del(...keys);
    planId = (await prisma.plan.create({ data: { name: `clra5-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `CLRA5 Org ${k}`, slug: `clra5-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['owner', 'A', 'panel', ['clra.contractor.manage', 'clra.contractor.view']],
      ['reader', 'A', 'panel', ['clra.contractor.view']],
      ['hr', 'A', 'panel', ['clra.settings.manage']],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, ks] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = ks ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(ks) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@clra5-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@clra5-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.owner}`).expect(200)).body.accessToken;
    await inA(async (tx) => {
      ids.entity = (await tx.legalEntity.create({ data: { organizationId: org.A.id, name: 'Kaveri Foods Pvt Ltd', shortName: `KF5-${run}`, isDefault: true } })).id;
      const loc = (name: string, code: string) => tx.location.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, name, code, address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } });
      ids.hosur = (await loc('Hosur plant', `HSR${run}`)).id;
      ids.chennai = (await loc('Chennai office', `CHN${run}`)).id;
      // An attendance kiosk at Hosur (Chennai has none).
      ids.kioskToken = `${org.A.id}.${randomBytes(32).toString('base64url')}`;
      await tx.timeDevice.create({ data: { organizationId: org.A.id, kind: 'kiosk', code: `K${run}`, place: 'Gate', locationId: ids.hosur!, mode: 'attendance', status: 'active', tokenHash: createHash('sha256').update(ids.kioskToken).digest('hex') } });
    });
    ids.vetri = (await api('owner', 'post', '/contract-labour/contractors').send({ name: `Vetri Security ${run}`, work: 'Security' }).expect(want(201))).body.id;
    await licence(ids.hosur!, `TN/H/${run}`, '60');
    await licence(ids.chennai!, `TN/C/${run}`, '60');
    ids.h1 = await deployed(ids.hosur!, 1, `${lastMonth}-01`);
    ids.c1 = await deployed(ids.chennai!, 2, `${lastMonth}-01`, false);
    await api('owner', 'post', `/contract-labour/contractors/${ids.vetri}/contacts`).send({ name: 'Meera', email: `meera-${run}@vetri.test` }).expect(want(201));
    send.mockClear();
    await request(server()).post(`/api/v1/public/contractor-portal/${org.A.slug}/code`).send({ email: `meera-${run}@vetri.test` }).expect(200);
    let code = '';
    for (let i = 0; i < 50 && !code; i++) {
      const m = send.mock.calls.find(([x]) => x.to === `meera-${run}@vetri.test`);
      if (m) code = m[0].subject.slice(0, 6);
      else await new Promise((r) => setTimeout(r, 100));
    }
    ids.portal = (await request(server()).post(`/api/v1/public/contractor-portal/${org.A.slug}/verify`).send({ email: `meera-${run}@vetri.test`, code }).expect(200)).body.token;
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        for (const o of [org.A.id, org.B.id]) {
          for (const t of ['contract_attendance', 'contract_kiosk_pins', 'contract_deployments', 'contractor_licences', 'clra_registrations', 'clra_site_peaks', 'time_devices']) await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE organization_id = $1::uuid`, o);
        }
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('625 kiosk: a PIN shown once; the gate pass and PIN sign in; punches go to contract attendance, never employee punches', async () => {
    await api('reader', 'post', `/contract-labour/workers/${ids.h1}/kiosk-pin`).expect(403);
    await api('acting', 'post', `/contract-labour/workers/${ids.h1}/kiosk-pin`).expect(403);
    await api('adminB', 'post', `/contract-labour/workers/${ids.h1}/kiosk-pin`).expect(404);
    const pin = (await api('owner', 'post', `/contract-labour/workers/${ids.h1}/kiosk-pin`).expect(want(201))).body.pin as string;
    expect(pin).toMatch(/^\d{4}$/);
    const gate = `GP-T${run.toUpperCase()}-1`;
    expect((await kiosk('post', '/code').send({ code: gate }).expect(200)).body).toEqual({ known: true });
    await kiosk('post', '/identify').send({ method: 'pin', code: gate, pin: pin === '0000' ? '1111' : '0000' }).expect(403);
    // The Chennai worker's pass does not open the Hosur kiosk.
    await kiosk('post', '/identify').send({ method: 'pin', code: `GP-X2-${run}`, pin }).expect(403);
    const who = (await kiosk('post', '/identify').send({ method: 'pin', code: gate, pin }).expect(200)).body;
    expect(who.firstName).toBe('W1');
    const t0 = (await kiosk('get', '/person/today').set('x-kiosk-person', who.person).expect(200)).body;
    expect(t0).toMatchObject({ next: 'in', leave: false, contractWorker: true });
    await kiosk('post', '/punch').send({ person: who.person, kind: 'in', clientRef: randomUUID(), punchedAt: new Date().toISOString() }).expect(200);
    const t1 = (await kiosk('get', '/person/today').set('x-kiosk-person', who.person).expect(200)).body;
    expect(t1.next).toBe('out');
    await kiosk('get', '/person/leave').set('x-kiosk-person', who.person).expect(403);
    const rows = await inA((tx) => tx.contractAttendance.findMany({ where: { deploymentId: ids.h1 } }));
    expect(rows).toEqual([expect.objectContaining({ source: 'kiosk', workOn: new Date(`${today}T00:00:00Z`) })]);
    expect(await inA((tx) => tx.punch.count({ where: { organizationId: org.A.id } }))).toBe(0);
  });

  it('625 contractor entry: only where the site has no kiosk, within the deployment, not in the future', async () => {
    const days = [`${lastMonth}-02`, `${lastMonth}-03`, `${lastMonth}-04`];
    await portal('post', '/attendance').send({ locationId: ids.hosur, month: lastMonth, entries: [{ deploymentId: ids.h1, days }] }).expect(409);
    await portal('post', '/attendance').send({ locationId: ids.chennai, month: lastMonth, entries: [{ deploymentId: ids.c1, days: [addDays(today, 1)] }] }).expect(400);
    await portal('post', '/attendance').send({ locationId: ids.chennai, month: lastMonth, entries: [{ deploymentId: randomUUID(), days }] }).expect(404);
    await portal('post', '/attendance').send({ locationId: ids.chennai, month: lastMonth, entries: [{ deploymentId: ids.c1, days }] }).expect(want(200));
    const m = (await portal('get', `/attendance?locationId=${ids.chennai}&month=${lastMonth}`).expect(200)).body;
    expect(m).toMatchObject({ contractorEnters: true, editable: true });
    expect(m.workers[0]).toMatchObject({ deploymentId: ids.c1, present: 3 });
  });

  it('the site in-charge confirms a past month; it locks; days paid against days on site (742)', async () => {
    const c = { contractorId: ids.vetri, locationId: ids.chennai, month: lastMonth };
    await api('reader', 'post', '/contract-labour/attendance/confirm').send(c).expect(403);
    await api('adminB', 'post', '/contract-labour/attendance/confirm').send(c).expect(404);
    await api('owner', 'post', '/contract-labour/attendance/confirm').send({ ...c, month: today.slice(0, 7) }).expect(400);
    expect((await api('owner', 'post', '/contract-labour/attendance/confirm').send(c).expect(want(201))).body).toEqual({ confirmed: true, days: 3 });
    await api('owner', 'post', '/contract-labour/attendance/confirm').send(c).expect(409);
    await portal('post', '/attendance').send({ locationId: ids.chennai, month: lastMonth, entries: [{ deploymentId: ids.c1, days: [] }] }).expect(409);
    const month = (await api('reader', 'get', `/contract-labour/attendance?month=${lastMonth}`).expect(200)).body;
    expect(month.rows.find((r: { site: { id: string } }) => r.site.id === ids.chennai)).toMatchObject({ contractorEnters: true, confirmed: expect.objectContaining({ days: 3 }) });
    // The wage register pays 2 days for 3 on site.
    const up = portal('post', '/pack/items');
    for (const [k, v] of Object.entries({ locationId: ids.chennai!, month: lastMonth, kind: 'wage_register', lines: JSON.stringify([{ deploymentId: ids.c1, days: 2, gross: '1500', paidOn: today }]) })) up.field(k, v);
    await up.attach('file', Buffer.from(`%PDF-1.7\n${run} wages\n%%EOF`), { filename: 'w.pdf', contentType: 'application/pdf' }).expect(want(201));
    const p = (await portal('get', `/pack?locationId=${ids.chennai}&month=${lastMonth}`).expect(200)).body;
    expect(p.checks.find((x: { id: string }) => x.id === 'days')).toMatchObject({ status: 'fail', label: 'Days paid ≥ days on site (confirmed)' });
  });

  it('673 registrations on 4.9: the settings key; one per site; others refused', async () => {
    const r = { locationId: ids.hosur, registrationNo: `TN/OSH/REG/${run}`, maxWorkers: 2 };
    await api('owner', 'post', '/contract-labour/registrations').send(r).expect(403);
    await api('adminB', 'post', '/contract-labour/registrations').send(r).expect(404);
    ids.reg = (await api('hr', 'post', '/contract-labour/registrations').send(r).expect(want(201))).body.id;
    await api('hr', 'post', '/contract-labour/registrations').send(r).expect(409);
    await api('hr', 'put', `/contract-labour/registrations/${ids.reg}`).send({ ...r, maxWorkers: 3, version: 1 }).expect(want(200));
    await api('hr', 'put', `/contract-labour/registrations/${ids.reg}`).send({ ...r, maxWorkers: 4, version: 1 }).expect(409);
    const s = (await api('hr', 'get', '/contract-labour/settings').expect(200)).body;
    expect(s.registrations).toEqual([expect.objectContaining({ registrationNo: `TN/OSH/REG/${run}`, maxWorkers: 3 })]);
    expect(s.values).toMatchObject({ 'clra.threshold_warn': '80', 'clra.attendance_source': 'kiosk_else_contractor' });
  });

  it('622 / 681: the nightly peak; past the registration maximum is blocked; without a registration the threshold blocks', async () => {
    await deployed(ids.hosur!, 3, addDays(today, -10));
    expect(await att.peaksOrg(org.A.id, today)).toBe(2);
    const peaks = (await api('hr', 'get', '/contract-labour/settings').expect(200)).body.peaks;
    expect(peaks.find((x: { locationId: string }) => x.locationId === ids.hosur)).toMatchObject({ peak: 2 });
    const w = (n: number, loc: string) => ({ contractorId: ids.vetri, locationId: loc, givenName: 'New', dob: yearsAgo(30), aadhaar: aadhaar(n), skill: 'unskilled', fromOn: today });
    // Hosur: 2 deployed + 1 = 3, the registration allows 3; a 4th is blocked.
    expect((await api('owner', 'post', '/contract-labour/workers/check').send(w(1, ids.hosur!)).expect(want(201))).body.checks.find((c: { id: string }) => c.id === 'threshold')).toMatchObject({ status: 'pass' });
    await api('owner', 'post', '/contract-labour/workers').send(w(1, ids.hosur!)).expect(want(201));
    expect((await api('owner', 'post', '/contract-labour/workers/check').send(w(2, ids.hosur!)).expect(want(201))).body.checks.find((c: { id: string }) => c.id === 'threshold')).toMatchObject({ status: 'fail' });
    // Chennai, no registration: at the threshold the 50th worker is blocked (seed 49 directly), the 40th warns.
    await inA(async (tx) => {
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Bulk', familyName: run } });
      await tx.contractDeployment.createMany({ data: Array.from({ length: 38 }, (_, i) => ({ organizationId: org.A.id, personId: p.id, agencyId: ids.vetri!, locationId: ids.chennai!, skill: 'unskilled', dob: new Date('1990-01-01T00:00:00Z'), idLast4: '0000', idHash: createHash('sha256').update(`${run}-bulk-${i}`).digest('hex'), fromOn: new Date(`${today}T00:00:00Z`), status: 'pending' })) });
    });
    expect((await api('owner', 'post', '/contract-labour/workers/check').send(w(3, ids.chennai!)).expect(want(201))).body.checks.find((c: { id: string }) => c.id === 'threshold')).toMatchObject({ status: 'warn' });
    await inA(async (tx) => {
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Bulk2', familyName: run } });
      await tx.contractDeployment.createMany({ data: Array.from({ length: 10 }, (_, i) => ({ organizationId: org.A.id, personId: p.id, agencyId: ids.vetri!, locationId: ids.chennai!, skill: 'unskilled', dob: new Date('1990-01-01T00:00:00Z'), idLast4: '0000', idHash: createHash('sha256').update(`${run}-bulk2-${i}`).digest('hex'), fromOn: new Date(`${today}T00:00:00Z`), status: 'pending' })) });
    });
    const blocked = await api('owner', 'post', '/contract-labour/workers').send(w(3, ids.chennai!)).expect(400);
    expect(blocked.body.checks.find((c: { id: string }) => c.id === 'threshold')).toMatchObject({ status: 'fail' });
  });

  it('684 renew gate pass keeps the number; 735 the photo; others refused', async () => {
    const v = async () => (await inA((tx) => tx.contractDeployment.findFirstOrThrow({ where: { id: ids.h1 } }))).version;
    const before = await inA((tx) => tx.contractDeployment.findFirstOrThrow({ where: { id: ids.h1 } }));
    await api('reader', 'post', `/contract-labour/workers/${ids.h1}/gate-pass`).send({ version: await v() }).expect(403);
    await api('adminB', 'post', `/contract-labour/workers/${ids.h1}/gate-pass`).send({ version: await v() }).expect(404);
    const r = (await api('owner', 'post', `/contract-labour/workers/${ids.h1}/gate-pass`).send({ version: await v() }).expect(want(201))).body;
    expect(r.gatePass).toBe(before.gatePassNo);
    expect(r.gateValidTo > before.gateValidTo!.toISOString().slice(0, 10)).toBe(true);
    await api('owner', 'post', `/contract-labour/workers/${ids.h1}/gate-pass`).send({ version: await v() }).expect(409);
    const png = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6360000002000154A24F5D0000000049454E44AE426082', 'hex');
    await api('reader', 'post', `/contract-labour/workers/${ids.h1}/photo`).attach('file', png, { filename: 'p.png', contentType: 'image/png' }).expect(403);
    await api('owner', 'post', `/contract-labour/workers/${ids.h1}/photo`).attach('file', Buffer.from('not an image'), { filename: 'p.png', contentType: 'image/png' }).expect(400);
    await api('owner', 'post', `/contract-labour/workers/${ids.h1}/photo`).attach('file', png, { filename: 'p.png', contentType: 'image/png' }).expect(want(201));
    const list = (await api('reader', 'get', '/contract-labour/workers').expect(200)).body.workers;
    expect(list.find((x: { id: string }) => x.id === ids.h1)).toMatchObject({ photo: true, kioskPin: true });
  });

  it('686 All persons counts contract workers once each', async () => {
    const d = (await api('admin', 'get', '/people/workforce').expect(200)).body;
    const cw = d.rows.filter((r: { kind: string }) => r.kind === 'contract_worker');
    expect(cw.length).toBeGreaterThan(0);
    expect(d.cards.persons.roles).toBeGreaterThanOrEqual(cw.length);
    expect(d.cards.persons.people).toBeLessThanOrEqual(d.cards.persons.roles);
    expect(d.cards.persons.people).toBeGreaterThan(0);
  });

  it('741 the muster roll and the required proofs on 4.9; 743 each new alert told once', async () => {
    const up = portal('post', '/pack/items');
    for (const [k, v] of Object.entries({ locationId: ids.chennai!, month: lastMonth, kind: 'muster_roll' })) up.field(k, v);
    await up.attach('file', Buffer.from(`%PDF-1.7\n${run} muster\n%%EOF`), { filename: 'm.pdf', contentType: 'application/pdf' }).expect(want(201));
    let p = (await portal('get', `/pack?locationId=${ids.chennai}&month=${lastMonth}`).expect(200)).body;
    expect(p.required).toEqual(['pf_challan', 'esi_challan', 'wage_register', 'bank_proof', 'muster_roll']);
    expect(p.items.muster_roll).toMatchObject({ state: 'submitted' });
    const two = { changes: [{ key: 'clra.required_proofs', value: 'pf_challan,esi_challan' }] };
    await api('reader', 'put', '/contract-labour/settings').send(two).expect(403);
    await api('acting', 'put', '/contract-labour/settings').send(two).expect(403);
    await api('hr', 'put', '/contract-labour/settings').send({ changes: [{ key: 'clra.required_proofs', value: 'pf_challan,nope' }] }).expect(400);
    await api('owner', 'put', '/contract-labour/settings').send(two).expect(403);
    await api('hr', 'put', '/contract-labour/settings').send(two).expect(want(200));
    p = (await portal('get', `/pack?locationId=${ids.chennai}&month=${lastMonth}`).expect(200)).body;
    expect(p.required).toEqual(['pf_challan', 'esi_challan']);
    const t = (await api('reader', 'get', `/contract-labour/compliance?month=${lastMonth}`).expect(200)).body;
    expect(t.proofTypes.filter((x: { required: boolean }) => x.required).map((x: { kind: string }) => x.kind)).toEqual(['pf_challan', 'esi_challan']);
    // Past the due day (the 15th) the PF and ESI challans are overdue: one alert per pack, told once.
    const late = `${today.slice(0, 7)}-28`;
    const n = await compliance.noticeOrg(org.A.id, late);
    expect(n).toBeGreaterThan(0);
    expect(await inA((tx) => tx.clraAlertNotice.count({ where: { organizationId: org.A.id } }))).toBe(n);
    expect(await compliance.noticeOrg(org.A.id, late)).toBe(0);
    expect(await compliance.noticeOrg(org.B.id, late)).toBe(0);
    await api('hr', 'put', '/contract-labour/settings').send({ changes: [{ key: 'clra.required_proofs', value: 'pf_challan,esi_challan,wage_register,bank_proof,muster_roll' }] }).expect(want(200));
  });
});
