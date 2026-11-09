import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { HiringRequisitionsService } from '../src/hiring/requisitions.service';
import { HiringSettingsService, STALE_NOTICE } from '../src/hiring/hiring-settings.service';

// Settings 6.1 Hiring end to end against the real database (forced RLS, the app role): recruiting and hiring admins
// read it; the hiring settings key (or HR's settings key) for the whole company changes it; a grant for one legal entity
// confers nothing; employees are refused; another company sees only its own values and cannot name this company's
// people; acting for someone else is refused; bad values save nothing; every change is audited with before and after.
// The stage targets (founder answer 302) are a pipeline write with the pipelines key.
describe('Settings 6.1 Hiring', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let moduleRequisitions: () => HiringRequisitionsService;
  let moduleSettings: () => HiringSettingsService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let billingPlanId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'rec' | 'rec2' | 'hra' | 'mgr' | 'emp' | 'hrEntity' | 'acting' | 'actingRec';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'put' | 'patch' | 'post' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const at = (o: string) => <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => at(org.A.id)(fn);
  const save = (who: Who, changes: unknown) => api(who, 'put', '/hiring/settings').send({ changes });
  type Settings = { canEdit: boolean; values: Record<string, string>; staleRecruiter: string | null; scorecards: { id: string; name: string; passBar: number; inUse: boolean; items: { label: string; weight: number }[] }[]; people: { id: string; name: string }[]; lastChange: { by: string; what: string } | null; pipelines: { id: string; name: string; stages: { id: string; name: string; daysTarget: number | null; limit: number | null }[] }[] };
  const read = async (who: Who) => (await api(who, 'get', '/hiring/settings').expect(200)).body as Settings;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    moduleRequisitions = () => moduleRef.get(HiringRequisitionsService);
    moduleSettings = () => moduleRef.get(HiringSettingsService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    billingPlanId = (await prisma.plan.create({ data: { name: `hirset-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIRSET Org ${k}`, slug: `hirset-${k.toLowerCase()}-${run}`, planId: billingPlanId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['rec', 'A', 'panel', tpl('recruiter')],
      ['rec2', 'A', 'panel', tpl('recruiter')],
      ['hra', 'A', 'panel', tpl('hiring_admin')],
      ['mgr', 'A', 'panel', tpl('hiring_manager')],
      ['emp', 'A', 'panel', []],
      ['hrEntity', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await at(o)((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at(o)((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hirset-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
    }
    // hrEntity: HR's settings key and the hiring settings key granted for one legal entity only (confers nothing here).
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Kaveri Foods', shortName: `KF-${run}`, isDefault: true } })).id;
      const profile = await tx.permissionProfile.create({ data: { ...o, name: `entity-${run}`, permissionsJson: JSON.stringify(['org.settings.manage', 'ats.settings.manage']) } });
      await tx.roleGrant.create({ data: { ...o, userId: users.hrEntity, permissionProfileId: profile.id, scopeType: 'legal_entity', legalEntityId: ids.entity, validFrom: new Date('2026-01-01'), status: 'active', reason: 'HR for Kaveri Foods' } });
    });
    for (const [who, k] of [['adminA', 'A'], ['adminB', 'B'], ['rec', 'A'], ['rec2', 'A'], ['hra', 'A'], ['mgr', 'A'], ['emp', 'A'], ['hrEntity', 'A']] as const)
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hirset-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    token.acting = (await request(server()).post(`/api/v1/auth/impersonate/${users.hra}`).set('Authorization', `Bearer ${token.adminA}`).expect(200)).body.accessToken;
    token.actingRec = (await request(server()).post(`/api/v1/auth/impersonate/${users.rec}`).set('Authorization', `Bearer ${token.adminA}`).expect(200)).body.accessToken;
    // The company's first job makes its standard pipeline.
    await request(server()).post('/api/v1/jobs').set('Authorization', `Bearer ${token.adminA}`).send({ title: 'Plant Technician', location: 'Hosur' }).expect(201);
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: billingPlanId } }).catch(() => undefined);
    await app.close();
  });

  // Answer 341: the seven settings drawn into 6.1, with their defaults.
  const DEFAULTS = {
    'ats.retention_months': '12',
    'hiring.reject.email_candidate': 'off',
    'ats.referral.bonus_inr': '25000',
    'ats.referral.qualify_days': '90',
    'hiring.requisition.default_recruiter': 'none',
    'ats.headcount_plan': 'advisory',
    'ats.headcount_plan.manager_view': 'own_department',
    'ats.referral.self_apply_days': '90',
    'hiring.pay_range.show': 'off',
    'hiring.pay_history.ask': 'off',
    'hiring.rediscovery.ai': 'off',
    'hiring.rehire_flag.blocks_screening': 'off',
    // HIR-13 (decision 6): past probation, 12 months in the role, the manager told when the person applies.
    'hiring.internal.after_probation': 'on',
    'hiring.internal.months_in_role': '12',
    'hiring.internal.tell_manager': 'on_apply',
    'hiring.bgv.decider_other_person': 'on',
    'hiring.interview_day.slot_minutes': '45',
    'hiring.interview_day.assign': 'by_slot',
    // HIR-25 (decision 2): the notetaker and its AI draft are off; transcripts are kept 90 days.
    'hiring.notetaker.enabled': 'off',
    'hiring.notetaker.ai_draft': 'off',
    'hiring.notetaker.keep_days': '90',
    'hiring.bias_audit.nyc': 'off',
  };

  it('reads: recruiting and hiring admins see the defaults; only the settings keys may edit; employees and managers are refused', async () => {
    const rec = await read('rec');
    expect(rec).toMatchObject({ canEdit: false, staleRecruiter: null, values: { ...DEFAULTS }, lastChange: null });
    // Answer 348: the default recruiter's choices are the people with the recruiter key only (a System Admin holds it).
    expect(rec.people.map((p) => p.id).sort()).toEqual([users.adminA, users.rec, users.rec2].sort());
    expect(rec.pipelines[0]!.stages.length).toBeGreaterThan(2);
    expect((await read('hra')).canEdit).toBe(true);
    expect((await read('adminA')).canEdit).toBe(true);
    // A grant for one legal entity reads but never edits (company settings are company-wide).
    expect((await read('hrEntity')).canEdit).toBe(false);
    await api('emp', 'get', '/hiring/settings').expect(403);
    await api('mgr', 'get', '/hiring/settings').expect(403);
  });

  it('the hiring settings key changes several at once; each change is audited with before and after', async () => {
    const after = (await save('hra', [
      { key: 'ats.retention_months', value: '18' },
      { key: 'hiring.reject.email_candidate', value: 'on' },
      { key: 'ats.referral.bonus_inr', value: '50000' },
      { key: 'ats.referral.qualify_days', value: '60' },
      { key: 'hiring.requisition.default_recruiter', value: users.rec },
      { key: 'ats.headcount_plan', value: 'required' },
      { key: 'ats.headcount_plan.manager_view', value: 'off' },
      { key: 'ats.referral.self_apply_days', value: '30' },
      { key: 'hiring.pay_range.show', value: 'on' },
      { key: 'hiring.pay_history.ask', value: 'on' },
      { key: 'hiring.rediscovery.ai', value: 'on' },
      { key: 'hiring.rehire_flag.blocks_screening', value: 'on' },
      { key: 'hiring.internal.after_probation', value: 'off' },
      { key: 'hiring.internal.months_in_role', value: '6' },
      { key: 'hiring.internal.tell_manager', value: 'at_offer' },
      { key: 'hiring.bgv.decider_other_person', value: 'off' },
      { key: 'hiring.interview_day.slot_minutes', value: '60' },
      { key: 'hiring.interview_day.assign', value: 'by_panel' },
      { key: 'hiring.notetaker.enabled', value: 'on' },
      { key: 'hiring.notetaker.ai_draft', value: 'on' },
      { key: 'hiring.notetaker.keep_days', value: '30' },
      // Answers 404 and 443: one offer expiry for single and bulk offers; the quarantine email switch.
      { key: 'hiring.offer.expiry_days', value: '14' },
      { key: 'hiring.resume_quarantine.tell_applicant', value: 'off' },
      { key: 'hiring.bias_audit.nyc', value: 'on' },
    ]).expect(200)).body as Settings;
    expect(after.values).toEqual({
      'ats.retention_months': '18',
      'hiring.reject.email_candidate': 'on',
      'ats.referral.bonus_inr': '50000',
      'ats.referral.qualify_days': '60',
      'hiring.requisition.default_recruiter': users.rec,
      'ats.headcount_plan': 'required',
      'ats.headcount_plan.manager_view': 'off',
      'ats.referral.self_apply_days': '30',
      'hiring.pay_range.show': 'on',
      'hiring.pay_history.ask': 'on',
      'hiring.rediscovery.ai': 'on',
      'hiring.rehire_flag.blocks_screening': 'on',
      'hiring.internal.after_probation': 'off',
      'hiring.internal.months_in_role': '6',
      'hiring.internal.tell_manager': 'at_offer',
      'hiring.offer.band_approver': 'hr_head',
      'hiring.offer.clawback_basis': 'full',
      'hiring.bgv.decider_other_person': 'off',
      'hiring.interview_day.slot_minutes': '60',
      'hiring.interview_day.assign': 'by_panel',
      'hiring.notetaker.enabled': 'on',
      'hiring.notetaker.ai_draft': 'on',
      'hiring.notetaker.keep_days': '30',
      'hiring.offer.expiry_days': '14',
      'hiring.resume_quarantine.tell_applicant': 'off',
      'hiring.bias_audit.nyc': 'on',
    });
    // Answer 362: the BGV tracker reads the same company setting.
    expect(await inA((tx) => tx.setting.findFirstOrThrow({ where: { organizationId: org.A.id, key: 'hiring.bgv.decider_other_person' } }))).toMatchObject({ value: 'off' });
    expect(after.lastChange).toMatchObject({ by: `hra ${run}` });
    // The other screens read the same company settings.
    expect((await api('rec', 'get', '/referrals/policy').expect(200)).body).toMatchObject({ bonusInr: 50000, qualifyDays: 60 });
    const audits = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'org.setting.changed' }, orderBy: { createdAt: 'asc' } }));
    expect(audits.map((a) => JSON.parse(a.metadataJson!))).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'ats.retention_months', from: null, to: '18' }), expect.objectContaining({ key: 'hiring.requisition.default_recruiter', from: null, to: users.rec }), expect.objectContaining({ key: 'hiring.rehire_flag.blocks_screening', from: null, to: 'on' }), expect.objectContaining({ key: 'ats.headcount_plan', from: null, to: 'required' }), expect.objectContaining({ key: 'hiring.bgv.decider_other_person', from: null, to: 'off' }), expect.objectContaining({ key: 'hiring.resume_quarantine.tell_applicant', from: null, to: 'off' }), expect.objectContaining({ key: 'hiring.offer.expiry_days', from: null, to: '14' })]));
    expect(audits.every((a) => a.actorUserId === users.hra)).toBe(true);
    // A second change records the value before.
    await save('adminA', [{ key: 'ats.retention_months', value: '24' }]).expect(200);
    const last = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { organizationId: org.A.id, action: 'org.setting.changed' }, orderBy: { createdAt: 'desc' } }));
    expect(JSON.parse(last.metadataJson!)).toMatchObject({ key: 'ats.retention_months', from: '18', to: '24' });
  });

  it('without the key (recruiter, manager, employee, one legal entity only) a change is refused (403); acting for someone else too', async () => {
    const one = [{ key: 'ats.retention_months', value: '6' }];
    for (const who of ['rec', 'mgr', 'emp', 'hrEntity'] as const) await save(who, one).expect(403);
    // Impersonation never changes settings (refused by the key check or, with the key, as acting for someone else).
    await save('acting', one).expect(403);
    expect((await read('rec')).values['ats.retention_months']).toBe('24');
  });

  it('bad values and keys save nothing (400)', async () => {
    const bad: unknown[] = [
      [{ key: 'ats.retention_months', value: '7' }],
      [{ key: 'ats.retention_months', value: '6' }, { key: 'ats.referral.bonus_inr', value: '12345' }],
      [{ key: 'hiring.reject.email_candidate', value: 'yes' }],
      [{ key: 'rehire.code', value: 'new' }], // a setting that is not on this page
      [{ key: 'ats.headcount_plan', value: 'strict' }],
      [{ key: 'ats.headcount_plan.manager_view', value: 'on' }],
      [{ key: 'ats.referral.self_apply_days', value: '45' }],
      [{ key: 'hiring.pay_range.show', value: 'true' }],
      [{ key: 'hiring.rehire_flag.blocks_screening', value: 'yes' }],
      [{ key: 'hiring.internal.months_in_role', value: '7' }],
      [{ key: 'hiring.internal.tell_manager', value: 'ask' }],
      [{ key: 'hiring.internal.after_probation', value: 'true' }],
      [{ key: 'hiring.bgv.decider_other_person', value: 'true' }],
      [{ key: 'hiring.interview_day.slot_minutes', value: '50' }],
      [{ key: 'hiring.interview_day.assign', value: 'random' }],
      [{ key: 'hiring.notetaker.keep_days', value: '45' }],
      [{ key: 'hiring.notetaker.enabled', value: 'yes' }],
      [{ key: 'hiring.bias_audit.nyc', value: 'true' }],
      [{ key: 'hiring.rediscovery.ai', value: 'on' }, { key: 'hiring.requisition.default_recruiter', value: 'not-a-person' }],
      [{ key: 'not.a.setting', value: 'x' }],
      [{ key: 'ats.retention_months', value: '6' }, { key: 'ats.retention_months', value: '9' }],
      [{ key: 'ats.retention_months', value: 6 }],
      [{ key: 'ats.retention_months', value: '6', extra: true }],
      [{ key: 'BAD KEY', value: '6' }],
      [],
    ];
    for (const changes of bad) await save('hra', changes).expect(400);
    await api('hra', 'put', '/hiring/settings').send({}).expect(400);
    expect((await read('rec')).values).toMatchObject({ 'ats.retention_months': '24', 'ats.referral.bonus_inr': '50000', 'ats.headcount_plan': 'required', 'hiring.rediscovery.ai': 'on' });
  });

  it('another company: its own values only; only an active person of this company with the recruiter key can be the default (400 otherwise, answer 348)', async () => {
    const b = await read('adminB');
    expect(b.values).toMatchObject({ 'ats.retention_months': '12', 'hiring.requisition.default_recruiter': 'none' });
    expect(b.people.map((p) => p.id)).not.toContain(users.rec);
    await save('adminB', [{ key: 'hiring.requisition.default_recruiter', value: users.rec }]).expect(400);
    await save('hra', [{ key: 'hiring.requisition.default_recruiter', value: users.adminB }]).expect(400);
    await save('hra', [{ key: 'hiring.requisition.default_recruiter', value: randomUUID() }]).expect(400);
    // Active people of the company without the recruiter key: the hiring admin, a hiring manager.
    for (const who of ['hra', 'mgr'] as const) expect((await save('hra', [{ key: 'hiring.requisition.default_recruiter', value: users[who] }]).expect(400)).body.message).toMatch(/recruiter key/);
    // The company settings API refuses them the same way.
    await api('adminA', 'put', '/org/settings').send({ key: 'hiring.requisition.default_recruiter', scopeType: 'tenant', value: users.mgr }).expect(400);
    await inA((tx) => tx.user.update({ where: { id: users.emp }, data: { status: 'inactive' } }));
    await save('hra', [{ key: 'hiring.requisition.default_recruiter', value: users.emp }]).expect(400);
    expect((await read('rec')).values['hiring.requisition.default_recruiter']).toBe(users.rec);
    // A key holder can be chosen through either API; none clears it.
    await api('adminA', 'put', '/org/settings').send({ key: 'hiring.requisition.default_recruiter', scopeType: 'tenant', value: users.rec2 }).expect(200);
    await save('hra', [{ key: 'hiring.requisition.default_recruiter', value: 'none' }]).expect(200);
    await save('hra', [{ key: 'hiring.requisition.default_recruiter', value: users.rec2 }]).expect(200);
  });

  it('answer 376: a named approver above the range who loses the offer-pay key is named on 6.1; a holder is not; an expiry outside the list is refused', async () => {
    const holder = (await read('hra')) as Settings & { offerApprovers: { id: string; name: string }[]; staleBandApprover: unknown };
    expect(holder.staleBandApprover).toBeNull();
    const approver = holder.offerApprovers[0]!;
    await save('hra', [{ key: 'hiring.offer.band_approver', value: approver.id }]).expect(200);
    expect(((await read('hra')) as unknown as { staleBandApprover: unknown }).staleBandApprover).toBeNull();
    // Saving someone without the key is refused; one who loses it later (or leaves) is named with the warning data.
    await save('hra', [{ key: 'hiring.offer.band_approver', value: users.mgr }]).expect(400);
    await inA((tx) => tx.setting.updateMany({ where: { organizationId: org.A.id, key: 'hiring.offer.band_approver' }, data: { value: users.mgr } }));
    const lost = (await read('hra')) as unknown as { staleBandApprover: { id: string; name: string }; offerApprovers: { id: string }[] };
    expect(lost.staleBandApprover).toEqual({ id: users.mgr, name: `mgr ${run}` });
    expect(lost.offerApprovers.map((p) => p.id)).not.toContain(users.mgr);
    // Company B never sees A's approver.
    expect(((await read('adminB')) as unknown as { staleBandApprover: unknown }).staleBandApprover).toBeNull();
    await save('hra', [{ key: 'hiring.offer.band_approver', value: 'hr_head' }, { key: 'hiring.offer.expiry_days', value: '7' }]).expect(200);
    await save('hra', [{ key: 'hiring.offer.expiry_days', value: '61' }]).expect(400);
  });

  it('a default recruiter who loses the recruiter key or leaves is treated as none, with a warning naming them (answer 348)', async () => {
    const ctxA = { organizationId: org.A.id, isSuperAdmin: false };
    expect(await read('hra')).toMatchObject({ staleRecruiter: null, values: { 'hiring.requisition.default_recruiter': users.rec2 } });
    const rec2 = await inA((tx) => tx.user.findUniqueOrThrow({ where: { id: users.rec2 } }));
    await inA((tx) => tx.permissionProfile.update({ where: { id: rec2.permissionProfileId! }, data: { permissionsJson: JSON.stringify(['ats.candidate.view']) } }));
    const lost = await read('hra');
    expect(lost).toMatchObject({ staleRecruiter: `rec2 ${run}`, values: { 'hiring.requisition.default_recruiter': 'none' } });
    expect(lost.people.map((p) => p.id)).not.toContain(users.rec2);
    // The stored value stays until someone changes it; a request a hiring manager raises starts with no recruiter.
    expect(await inA((tx) => tx.setting.findFirstOrThrow({ where: { organizationId: org.A.id, key: 'hiring.requisition.default_recruiter' } }))).toMatchObject({ value: users.rec2 });
    const reqs = moduleRequisitions();
    expect(await reqs.defaultRecruiter(ctxA, users.mgr)).toBeNull();
    await inA((tx) => tx.permissionProfile.update({ where: { id: rec2.permissionProfileId! }, data: { permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === 'recruiter')!.permissions) } }));
    expect(await reqs.defaultRecruiter(ctxA, users.mgr)).toBe(users.rec2);
    // Never the manager themselves.
    expect(await reqs.defaultRecruiter(ctxA, users.rec2)).toBeNull();
    await inA((tx) => tx.user.update({ where: { id: users.rec2 }, data: { status: 'inactive' } }));
    expect(await read('hra')).toMatchObject({ staleRecruiter: `rec2 ${run}`, values: { 'hiring.requisition.default_recruiter': 'none' } });
    expect(await reqs.defaultRecruiter(ctxA, users.mgr)).toBeNull();
  });

  it('answer 385: a stale default recruiter is told once to the hiring settings holders; again only after a new save', async () => {
    const notices = (o: string) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.userNotification.findMany({ where: { organizationId: o, type: 'hiring.default_recruiter.stale' }, orderBy: { createdAt: 'asc' } }));
    // rec2 (the stored default) has left: the holders of the hiring settings key for the whole company are told.
    await moduleSettings().staleRecruiterSweep();
    let got = await notices(org.A.id);
    expect(got.map((n) => n.recipientUserId).sort()).toEqual([users.adminA, users.hra].sort());
    expect(got[0]).toMatchObject({ linkPath: '/yx/settings/hiring', actorUserId: users.rec2, contextText: expect.stringMatching(new RegExp(`^rec2 ${run} has left the company, so new requisitions start with no recruiter`)) });
    // Never the recruiter, a manager, an employee, one-legal-entity HR or another company.
    for (const who of ['rec', 'mgr', 'emp', 'hrEntity'] as const) expect(got.map((n) => n.recipientUserId)).not.toContain(users[who]);
    expect(await notices(org.B.id)).toEqual([]);
    // Once per change: the next runs send nothing more.
    await moduleSettings().staleRecruiterSweep();
    await moduleSettings().staleRecruiterSweep();
    expect(await notices(org.A.id)).toHaveLength(2);
    expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: STALE_NOTICE } }))).toBe(1);
    // A default who qualifies is never reported.
    await save('hra', [{ key: 'hiring.requisition.default_recruiter', value: users.rec }]).expect(200);
    await moduleSettings().staleRecruiterSweep();
    expect(await notices(org.A.id)).toHaveLength(2);
    // The new default loses the key: told again (a new saved value), with that reason.
    const rec = await inA((tx) => tx.user.findUniqueOrThrow({ where: { id: users.rec } }));
    const keys = (await inA((tx) => tx.permissionProfile.findUniqueOrThrow({ where: { id: rec.permissionProfileId! } }))).permissionsJson;
    await inA((tx) => tx.permissionProfile.update({ where: { id: rec.permissionProfileId! }, data: { permissionsJson: JSON.stringify(['ats.candidate.view']) } }));
    await moduleSettings().staleRecruiterSweep();
    got = await notices(org.A.id);
    expect(got).toHaveLength(4);
    expect(got[3]!.contextText).toMatch(new RegExp(`^rec ${run} no longer holds the recruiter key`));
    await moduleSettings().staleRecruiterSweep();
    expect(await notices(org.A.id)).toHaveLength(4);
    await inA((tx) => tx.permissionProfile.update({ where: { id: rec.permissionProfileId! }, data: { permissionsJson: keys } }));
  });

  it('scorecard templates on 6.1 (answer 345): listed with weights and pass bar; per cent adding to 100; archive; refused while acting', async () => {
    const body = { name: 'Plant technician', scaleMax: 4, passBar: 2.5, items: [{ label: 'Machine safety', weight: 50 }, { label: 'Food hygiene', weight: 30 }, { label: 'Teamwork', weight: 20, guidance: 'Helps the shift' }] };
    await api('rec', 'post', '/hiring/scorecard-templates').send({ ...body, items: body.items.slice(0, 2) }).expect(400);
    await api('hra', 'post', '/hiring/scorecard-templates').send(body).expect(403);
    // Acting for a recruiter is refused (by the key check for an impersonation token, and by the controller otherwise).
    await api('actingRec', 'post', '/hiring/scorecard-templates').send(body).expect(403);
    const t = (await api('rec', 'post', '/hiring/scorecard-templates').send(body).expect(201)).body as { id: string };
    const listed = (await read('hra')).scorecards.find((x) => x.id === t.id)!;
    expect(listed).toMatchObject({ name: 'Plant technician', passBar: 2.5, inUse: false, items: [expect.objectContaining({ label: 'Machine safety', weight: 50 }), expect.objectContaining({ weight: 30 }), expect.objectContaining({ label: 'Teamwork', weight: 20, guidance: 'Helps the shift' })] });
    await api('rec', 'put', `/hiring/scorecard-templates/${t.id}`).send({ ...body, passBar: 3, items: [{ label: 'Machine safety', weight: 100 }] }).expect(200);
    expect((await read('hra')).scorecards.find((x) => x.id === t.id)).toMatchObject({ passBar: 3, items: [expect.objectContaining({ weight: 100 })] });
    await api('adminB', 'put', `/hiring/scorecard-templates/${t.id}`).send(body).expect(404);
    await api('actingRec', 'delete', `/hiring/scorecard-templates/${t.id}`).expect(403);
    await api('rec', 'delete', `/hiring/scorecard-templates/${t.id}`).expect(200);
    expect((await read('hra')).scorecards.map((x) => x.id)).not.toContain(t.id);
    expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, entityId: t.id, action: { startsWith: 'ats.scorecard_template.' } } }))).toBe(3);
  });

  it('stage targets (answer 302): the pipelines key changes them, audited; the hiring admin alone may not; another company gets 404', async () => {
    const stage = (await read('rec')).pipelines[0]!.stages[1]!;
    const patch = (who: Who, body: object, id = stage.id) => api(who, 'patch', `/pipelines/stages/${id}`).send(body);
    await patch('hra', { daysTarget: 5 }).expect(403);
    await patch('acting', { daysTarget: 5 }).expect(403);
    await patch('adminB', { daysTarget: 5 }).expect(404);
    await patch('adminA', { daysTarget: 0 }).expect(400);
    await patch('adminA', { limit: 1001 }).expect(400);
    await patch('rec', { daysTarget: 5, limit: 12 }).expect(200);
    expect((await read('hra')).pipelines[0]!.stages[1]).toMatchObject({ id: stage.id, daysTarget: 5, limit: 12 });
    await patch('rec', { daysTarget: null, limit: null }).expect(200);
    expect((await read('hra')).pipelines[0]!.stages[1]).toMatchObject({ daysTarget: null, limit: null });
    expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'pipeline.stage_updated', entityId: stage.id } }))).toBe(2);
  });
});
