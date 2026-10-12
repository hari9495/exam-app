import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Expenses batch E1 end to end against the real database (forced RLS, the app role): the YukthiX starters copied once,
// categories and tiers (a city in one tier only; a translated name for a Hindi reader), a dated policy narrowed to a
// grade band, "my limits" per person and date, a policy in use keeping its history (new limits only as a new version),
// mileage and per-diem rates closing the one they replace, GST registrations (check digit, PAN, one open per state),
// the set-up check, the permission and two companies apart.

describe('Expenses batch E1', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'fin' | 'senior' | 'junior';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1/expenses${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  type Policy = { id: string; name: string; version: number; validFrom: string; validTo: string | null; priority: number; status: string; appliesIf: unknown; rules: { categoryCode: string; tierId: string | null; perLine: string | null; perDay: string | null; perTrip: string | null; perMonth: string | null; overLimit: string }[] };
  const body = (p: Policy, patch: Partial<Policy> = {}) => {
    const x = { ...p, ...patch };
    return { name: x.name, appliesIf: x.appliesIf, priority: x.priority, validFrom: x.validFrom, validTo: x.validTo, status: x.status, version: x.version, rules: x.rules.map(({ categoryCode, tierId, perLine, perDay, perTrip, perMonth, overLimit }) => ({ categoryCode, tierId, perLine, perDay, perTrip, perMonth, overLimit })) };
  };
  const lodging = async (who: Who, on = today) => {
    const l = (await api(who, 'get', `/me/limits?on=${on}`).expect(200)).body as { policy: { name: string } | null; categories: { code: string; name: string; tiers: { tier: string; perLine: string | null }[] }[] };
    return { policy: l.policy?.name ?? null, tier1: l.categories.find((c) => c.code === 'lodging')?.tiers.find((t) => t.tier === 'Tier 1')?.perLine ?? null };
  };

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
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `exp1-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Exp1 Org ${k}`, slug: `exp1-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['fin', 'A', 'panel', tpl('expense_setup')],
      ['senior', 'A', 'panel', []],
      ['junior', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = (fn: Parameters<typeof inA>[0]) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? ((await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))) as { id: string }).id : null;
      users[who] = ((await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@exp1-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))) as { id: string }).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@exp1-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Expenses Pvt Ltd', shortName: `KE${run.slice(0, 4).toUpperCase()}`, isDefault: true, pan: 'AAPFU0939F' } })).id;
      ids.blr = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...x, id: deptId, name: 'Sales', code: 'SAL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      ids.g1 = (await tx.grade.create({ data: { ...x, name: 'G1', code: 'G1', rank: 1 } })).id;
      ids.g5 = (await tx.grade.create({ data: { ...x, name: 'G5', code: 'G5', rank: 5 } })).id;
    });
    const hire = async (who: Who, given: string, code: string, gradeId: string) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@exp1-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, gradeId, employmentTypeId: ids.perm, managerEmployeeId: null } }).expect(201)).body.id as string;
    emp.senior = await hire('senior', 'Neha', 'KE-001', ids.g5);
    emp.junior = await hire('junior', 'Ravi', 'KE-002', ids.g1);
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a new company is told what blocks claims; the starters copy once', async () => {
    expect((await api('fin', 'get', '/setup-check').expect(200)).body.problems.map((p: { key: string }) => p.key)).toEqual(['no_categories', 'no_policy']);
    expect((await api('fin', 'post', '/setup/from-starter').expect(201)).body).toEqual({ categories: 11, tiers: 4, policies: 1, rates: 5 });
    expect((await api('fin', 'post', '/setup/from-starter').expect(201)).body).toEqual({ categories: 0, tiers: 0, policies: 0, rates: 0 });
    const check = (await api('fin', 'get', '/setup-check').expect(200)).body as { ready: boolean; problems: { key: string; count?: number }[] };
    // Starters carry no ledger codes: finance maps them before anything can be posted.
    expect(check.problems).toEqual([{ key: 'no_ledger_code', text: '11 categories have no ledger code, so their journal lines cannot be posted.', count: 11 }]);
  });

  it('everyone reads categories and their limits; only expense set-up changes them; companies stay apart', async () => {
    await api('junior', 'get', '/policies').expect(403);
    await api('junior', 'post', '/setup/from-starter').expect(403);
    const cats = (await api('junior', 'get', '/categories').expect(200)).body as { code: string }[];
    expect(cats.map((c) => c.code)).toContain('lodging');
    expect(await lodging('junior')).toEqual({ policy: 'Standard', tier1: '5000.00' });
    expect((await api('adminB', 'get', '/categories').expect(200)).body).toEqual([]);
  });

  it('categories keep their code; a city sits in one tier only; a Hindi reader sees the translated name', async () => {
    const cats = (await api('fin', 'get', '/categories').expect(200)).body as { id: string; code: string; name: string; kind: string; version: number; gstEligible: boolean; itcBlockedReason: string | null; taxable: string; receiptAbove: string | null; active: boolean; ledgerCode: string | null }[];
    const meals = cats.find((c) => c.code === 'meals')!;
    const put = (patch: Record<string, unknown>) => api('fin', 'put', `/categories/${meals.id}`).send({ code: meals.code, name: meals.name, kind: meals.kind, receiptAbove: meals.receiptAbove, gstEligible: meals.gstEligible, itcBlockedReason: meals.itcBlockedReason, taxable: meals.taxable, ledgerCode: meals.ledgerCode, active: meals.active, version: meals.version, ...patch });
    expect((await put({ code: 'food' }).expect(400)).body.message).toBe('A category keeps its code; make a new one instead.');
    expect((await put({ gstEligible: false }).expect(400)).body.message).toBe('Only a GST-eligible category can have blocked input credit.');
    await put({ ledgerCode: '6110 Travel meals' }).expect(200);
    await put({ ledgerCode: 'stale' }).expect(409);
    await api('fin', 'post', '/categories').send({ code: 'meals', name: 'Meals again', kind: 'spend', gstEligible: false, taxable: 'never', active: true }).expect(409);

    const tiers = (await api('fin', 'get', '/tiers').expect(200)).body as { id: string; name: string; rank: number; cities: string[]; country: string | null; active: boolean; version: number }[];
    const t2 = tiers.find((t) => t.name === 'Tier 2')!;
    expect((await api('fin', 'put', `/tiers/${t2.id}`).send({ name: t2.name, rank: t2.rank, country: t2.country, cities: [...t2.cities, 'mumbai'], active: true, version: t2.version }).expect(400)).body.message).toBe('mumbai is already in Tier 1.');

    await inA(async (tx) => {
      await tx.contentTranslation.create({ data: { organizationId: org.A.id, subjectType: 'expense_category', subjectId: meals.id, language: 'hi', text: 'भोजन', updatedBy: users.fin } });
      await tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'employee', scopeId: emp.junior, key: 'people.language', value: 'hi' } });
    });
    const mine = (await api('junior', 'get', '/me/limits').expect(200)).body as { categories: { code: string; name: string }[] };
    expect(mine.categories.find((c) => c.code === 'meals')!.name).toBe('भोजन');
    expect(((await api('senior', 'get', '/me/limits').expect(200)).body as { categories: { code: string; name: string }[] }).categories.find((c) => c.code === 'meals')!.name).toBe('Meals');
  });

  it('a grade-band policy applies to its band only; a policy in use keeps its history and changes by a new version', async () => {
    const { policies, fields } = (await api('fin', 'get', '/policies').expect(200)).body as { policies: Policy[]; fields: { key: string; options: { value: string; label: string }[] }[] };
    expect(fields.find((f) => f.key === 'grade_id')!.options.map((o) => o.label)).toEqual(['G1', 'G5']);
    const std = policies.find((p) => p.name === 'Standard')!;
    const t1 = ((await api('fin', 'get', '/tiers').expect(200)).body as { id: string; name: string }[]).find((t) => t.name === 'Tier 1')!.id;
    const raised = std.rules.map((r) => (r.categoryCode === 'lodging' && r.tierId === t1 ? { ...r, perLine: '9000.00' } : r));

    // Senior grades: a narrower policy wins over the company-wide one.
    const seniorBand = { id: 'g', join: 'and', items: [{ id: 'c1', field: 'grade_id', operator: 'one_of', value: [ids.g5] }] };
    await api('fin', 'post', '/policies').send({ ...body(std, { name: 'Senior grades', appliesIf: seniorBand, validFrom: std.validFrom, rules: raised }), version: undefined }).expect(201);
    await api('fin', 'post', '/policies').send({ ...body(std, { name: 'Bad', appliesIf: { id: 'g', join: 'and', items: [{ id: 'c1', field: 'salary', operator: 'is', value: 1 }] } }), version: undefined }).expect(400);
    expect(await lodging('senior')).toEqual({ policy: 'Senior grades', tier1: '9000.00' });
    expect(await lodging('junior')).toEqual({ policy: 'Standard', tier1: '5000.00' });

    // In force: changing the limits in place is refused; the name may change.
    expect((await api('fin', 'put', `/policies/${std.id}`).send(body(std, { rules: raised })).expect(409)).body.message).toBe('This policy is already in use. Save the new limits as a new version from a date instead.');
    const renamed = (await api('fin', 'put', `/policies/${std.id}`).send(body(std, { name: 'Standard (all staff)' })).expect(200)).body as Policy;

    // A new version from next month: the old one ends the day before; past dates still read the old limits.
    const from = shift(today, 20);
    await api('fin', 'post', `/policies/${std.id}/new-version`).send(body(renamed, { validFrom: renamed.validFrom })).expect(400);
    await api('fin', 'post', `/policies/${std.id}/new-version`).send(body(renamed, { validFrom: from, rules: raised.map((r) => (r.categoryCode === 'lodging' && r.tierId === t1 ? { ...r, perLine: '6000.00' } : r)) })).expect(201);
    const after = (await api('fin', 'get', '/policies').expect(200)).body.policies as Policy[];
    expect(after.find((p) => p.id === std.id)!.validTo).toBe(shift(from, -1));
    expect(await lodging('junior', today)).toEqual({ policy: 'Standard (all staff)', tier1: '5000.00' });
    expect(await lodging('junior', from)).toEqual({ policy: 'Standard (all staff)', tier1: '6000.00' });
  });

  it('a new rate closes the one it replaces; an earlier start than an existing rate is refused', async () => {
    const from = shift(today, 10);
    await api('fin', 'post', '/mileage-rates').send({ vehicle: 'car', ratePerKm: '19', validFrom: from }).expect(201);
    await api('fin', 'post', '/mileage-rates').send({ vehicle: 'car', ratePerKm: '18', validFrom: shift(today, 5) }).expect(409);
    const { mileage, perDiem } = (await api('fin', 'get', '/rates').expect(200)).body as { mileage: { vehicle: string; ratePerKm: string; validTo: string | null }[]; perDiem: { tierId: string | null; country: string | null }[] };
    expect(mileage.filter((m) => m.vehicle === 'car').map((m) => [m.ratePerKm, m.validTo])).toEqual([['19.00', null], ['17.00', shift(from, -1)]]);
    await api('fin', 'post', '/per-diem-rates').send({ country: 'AE', ratePerDay: '250', currency: 'AED', partialDayRule: 'full', validFrom: today }).expect(201);
    await api('fin', 'post', '/per-diem-rates').send({ ratePerDay: '250', currency: 'AED', partialDayRule: 'full', validFrom: today }).expect(400);
    await api('fin', 'post', '/per-diem-rates').send({ country: 'AE', ratePerDay: '250', currency: 'AED', partialDayRule: 'full', mealsDeduction: { lunch: 2 }, validFrom: shift(today, 30) }).expect(400);
    expect(perDiem.length).toBe(3);
  });

  it('GST registrations: the check digit and the PAN are checked; one open registration per state; the set-up check sees GST capture', async () => {
    const add = (gstin: string) => api('fin', 'post', '/gst-registrations').send({ legalEntityId: ids.entity, gstin, validFrom: today });
    expect((await add('29AAPFU0939F1ZW').expect(400)).body.message).toMatch(/check character/);
    expect((await add('29ABCDE1234F1Z5').expect(400)).body.message).toMatch(/check character|different PAN/);
    await inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'expense.gst.capture', value: 'on' } }));
    expect((await api('fin', 'get', '/setup-check').expect(200)).body.problems.map((p: { key: string }) => p.key)).toContain('no_gst_registration');
    const ok = (await add('27AAPFU0939F1ZV').expect(201)).body as { id: string; state: string };
    expect(ok.state).toBe('27');
    await add('27AAPFU0939F1ZV').expect(409);
    await api('fin', 'post', `/gst-registrations/${ok.id}/end`).send({ validTo: shift(today, -400) }).expect(400);
    expect((await api('fin', 'get', '/setup-check').expect(200)).body.problems.map((p: { key: string }) => p.key)).not.toContain('no_gst_registration');
  });
});
