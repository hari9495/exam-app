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

// Performance batch PM1 end to end against the real database (forced RLS, the app role): the YukthiX starters copied
// once; rating scales whose levels and bands are checked when saved and that never change once a template uses them;
// templates whose weights must reach 100 before they can be activated, and that change only through a new version
// (the old version stays as it was); competencies built on the skills library, with dated role levels; skills retired
// or merged, never deleted; translated rating labels; only perf.setup.manage holders; two companies apart.

describe('Performance batch PM1', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'setup' | 'ravi';
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1/performance${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const levels5 = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'].map((label, i) => ({ value: i + 1, label }));
  const bands3 = [
    { fromScore: 1, toScore: 2.49, label: 'Below' },
    { fromScore: 2.5, toScore: 3.49, label: 'On track' },
    { fromScore: 3.5, toScore: 5, label: 'Above' },
  ];
  type Template = { id: string; familyId: string; templateVersion: number; status: string; problem: string | null; version: number; sections: { title: string; weight: number }[] };
  const sections = (goals: number, comps: number) => [
    { kind: 'goals', title: 'Goals', weight: goals, rated: true, whoAnswers: ['self', 'manager'], questions: [] },
    { kind: 'competencies', title: 'Competencies', weight: comps, rated: true, whoAnswers: ['self', 'manager'], questions: [] },
    { kind: 'questions', title: 'Looking ahead', weight: 0, rated: false, whoAnswers: ['self'], questions: [{ text: 'What will you focus on next?', answer: 'text' }] },
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
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

    planId = (await prisma.plan.create({ data: { name: `pm1-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PM1 Org ${k}`, slug: `pm1-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['setup', 'A', 'panel', ['perf.setup.manage']],
      ['ravi', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@pm1-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }));
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@pm1-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      ids.engineer = (await tx.designation.create({ data: { organizationId: org.A.id, name: 'Engineer', code: 'ENG' } })).id;
      ids.lead = (await tx.designation.create({ data: { organizationId: org.A.id, name: 'Team Lead', code: 'TL' } })).id;
    });
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('only perf.setup.manage holders reach set-up; the starters are copied once (PM-1.01, §6.2)', async () => {
    await api('ravi', 'get', '/scales').expect(403);
    expect((await api('setup', 'post', '/setup/from-starter').expect(201)).body).toEqual({ scales: 1, templates: 4, competencies: 12 });
    expect((await api('setup', 'post', '/setup/from-starter').expect(201)).body).toEqual({ scales: 0, templates: 0, competencies: 0 });
    const templates = (await api('setup', 'get', '/templates').expect(200)).body as Template[];
    expect(templates).toHaveLength(4);
    expect(templates.every((t) => t.status === 'active' && t.problem === null)).toBe(true);
  });

  it('a scale needs a label per point and bands without gaps; a scale in use never changes (PM-1.02)', async () => {
    expect((await api('setup', 'post', '/scales').send({ name: 'Four point', min: 1, max: 5, step: 1, levels: levels5.slice(0, 4), bands: bands3 }).expect(400)).body.message).toBe('Add a label for the rating 5.');
    expect((await api('setup', 'post', '/scales').send({ name: 'Gappy', min: 1, max: 5, step: 1, levels: levels5, bands: [bands3[0], { ...bands3[1], fromScore: 2.6 }, bands3[2]] }).expect(400)).body.message).toBe('There is a gap between Below and On track.');
    const s = (await api('setup', 'post', '/scales').send({ name: 'Simple five', min: 1, max: 5, step: 1, levels: levels5, bands: bands3 }).expect(201)).body;
    ids.scale = s.id;
    expect(s).toMatchObject({ inUse: false, bands: bands3 });
    await api('setup', 'post', '/scales').send({ name: 'simple FIVE', min: 1, max: 5, step: 1, levels: levels5, bands: bands3 }).expect(409);
    const starter = ((await api('setup', 'get', '/scales').expect(200)).body as { id: string; starter: boolean; inUse: boolean; version: number }[]).find((x) => x.starter)!;
    expect(starter.inUse).toBe(true);
    expect((await api('setup', 'put', `/scales/${starter.id}`).send({ name: 'Changed', min: 1, max: 5, step: 1, levels: levels5, bands: bands3, version: starter.version }).expect(409)).body.message).toMatch(/used by a template/);
    await api('setup', 'post', `/scales/${starter.id}/retire`).expect(409);
  });

  it('weights must reach 100 before a template is activated; an active template changes only through a new version (PM-1.03, PF-D7)', async () => {
    let t = (await api('setup', 'post', '/templates').send({ name: 'Engineering annual', kind: 'annual', scaleId: ids.scale, scoring: 'weighted', sections: sections(60, 30) }).expect(201)).body as Template;
    expect(t).toMatchObject({ status: 'draft', templateVersion: 1, problem: 'The weights of rated sections add up to 90, not 100.' });
    expect((await api('setup', 'post', `/templates/${t.id}/activate`).send({ version: t.version }).expect(400)).body.message).toBe('The weights of rated sections add up to 90, not 100.');
    t = (await api('setup', 'put', `/templates/${t.id}`).send({ name: 'Engineering annual', kind: 'annual', scaleId: ids.scale, scoring: 'weighted', sections: sections(60, 40), version: t.version }).expect(200)).body;
    expect(t.problem).toBeNull();
    t = (await api('setup', 'post', `/templates/${t.id}/activate`).send({ version: t.version }).expect(200)).body;
    expect(t.status).toBe('active');
    const v1 = t;
    await api('setup', 'put', `/templates/${v1.id}`).send({ name: 'Changed in place', kind: 'annual', scaleId: ids.scale, scoring: 'weighted', sections: sections(50, 50), version: v1.version }).expect(409);
    let v2 = (await api('setup', 'post', `/templates/${v1.id}/new-version`).expect(201)).body as Template;
    expect(v2).toMatchObject({ familyId: v1.familyId, templateVersion: 2, status: 'draft' });
    await api('setup', 'post', `/templates/${v1.id}/new-version`).expect(409);
    v2 = (await api('setup', 'put', `/templates/${v2.id}`).send({ name: 'Engineering annual', kind: 'annual', scaleId: ids.scale, scoring: 'weighted', sections: sections(70, 30), version: v2.version }).expect(200)).body;
    v2 = (await api('setup', 'post', `/templates/${v2.id}/activate`).send({ version: v2.version }).expect(200)).body;
    // The earlier version is retired and still reads as it was (reviews that pinned it are untouched).
    const old = (await api('setup', 'get', `/templates/${v1.id}`).expect(200)).body as Template;
    expect(old.status).toBe('retired');
    expect(old.sections.map((x) => x.weight)).toEqual([60, 40, 0]);
    expect((await api('setup', 'get', '/scales').expect(200)).body.find((x: { id: string }) => x.id === ids.scale).inUse).toBe(true);
  });

  it('competencies sit on the skills library with dated role levels; skills are retired or merged, never deleted (PM-1.04, T2)', async () => {
    let k = (await api('setup', 'post', '/competencies').send({ name: 'Code review', group: 'functional', description: 'Reviews code well.', levels: [{ label: 'Learning' }, { label: 'Working' }, { label: 'Skilled' }], roles: [{ designationId: ids.engineer, level: 2, validFrom: '2026-04-01' }] }).expect(201)).body;
    expect(k.roles).toEqual([expect.objectContaining({ designation: 'Engineer', level: 2 })]);
    await api('setup', 'put', `/competencies/${k.id}`).send({ name: 'Code review', group: 'functional', levels: [{ label: 'Learning' }, { label: 'Working' }], roles: [{ designationId: ids.engineer, level: 3, validFrom: '2026-04-01' }], version: k.version }).expect(400);
    k = (await api('setup', 'put', `/competencies/${k.id}`).send({ name: 'Code review', group: 'functional', levels: [{ label: 'Learning' }, { label: 'Working' }, { label: 'Skilled' }], roles: [{ designationId: ids.engineer, level: 3, validFrom: '2026-10-01' }, { designationId: ids.lead, level: 3, validFrom: '2026-10-01' }], version: k.version }).expect(200)).body;
    expect(k.roles.map((r: { level: number }) => r.level)).toEqual([3, 3]);
    // The old Engineer level was ended the day before, not erased.
    const rows = await inA((tx) => tx.roleCompetencyMap.findMany({ where: { organizationId: org.A.id, competencyId: k.id, designationId: ids.engineer } }));
    expect(rows).toHaveLength(2);

    const skills = (await api('setup', 'get', '/skills').expect(200)).body as { id: string; name: string; kind: string; competency: boolean }[];
    const reviewSkill = skills.find((s) => s.name === 'Code review')!;
    const functional = skills.find((s) => s.kind === 'domain' && s.name === 'Functional')!;
    await api('setup', 'post', `/skills/${reviewSkill.id}/retire`).expect(409);
    const dup = (await api('setup', 'post', '/skills').send({ name: 'Peer code review', kind: 'skill', parentId: functional.id }).expect(201)).body;
    await api('setup', 'post', '/skills').send({ name: 'Orphan', kind: 'skill' }).expect(400);
    await api('setup', 'post', `/skills/${reviewSkill.id}/merge`).send({ intoId: dup.id }).expect(200);
    const after = ((await api('setup', 'get', '/competencies').expect(200)).body as { id: string; name: string; skillId: string }[]).find((x) => x.id === k.id)!;
    expect(after).toMatchObject({ name: 'Peer code review', skillId: dup.id });

    k = (await api('setup', 'post', `/competencies/${k.id}/retire`).expect(200)).body;
    expect(k).toMatchObject({ status: 'retired', roles: [] });
    expect(await inA((tx) => tx.competency.count({ where: { organizationId: org.A.id, id: k.id } }))).toBe(1);
  });

  it('rating labels, bands, sections and competencies can be translated; another company’s item is refused (§6.4)', async () => {
    const list = (await request(server()).get('/api/v1/global/translations?subjectType=rating_level').set('Authorization', `Bearer ${token.adminA}`).expect(200)).body as { items: { id: string; name: string }[] };
    const meets = list.items.find((i) => i.name.endsWith('› Meets'))!;
    expect(meets).toBeTruthy();
    await request(server()).put('/api/v1/global/translations').set('Authorization', `Bearer ${token.adminA}`).send({ subjectType: 'rating_level', subjectId: meets.id, language: 'ta', text: 'எதிர்பார்ப்பை பூர்த்தி செய்கிறது' }).expect(200);
    for (const t of ['rating_band', 'review_section', 'competency']) expect((await request(server()).get(`/api/v1/global/translations?subjectType=${t}`).set('Authorization', `Bearer ${token.adminA}`).expect(200)).body.items.length).toBeGreaterThan(0);
    const res = await request(server()).put('/api/v1/global/translations').set('Authorization', `Bearer ${token.adminB}`).send({ subjectType: 'rating_level', subjectId: meets.id, language: 'ta', text: 'x' });
    expect([400, 404]).toContain(res.status);
  });

  it('two companies stay apart', async () => {
    expect((await api('adminB', 'get', '/scales').expect(200)).body).toEqual([]);
    expect((await api('adminB', 'get', '/templates').expect(200)).body).toEqual([]);
    await api('adminB', 'get', `/templates/${(await inA((tx) => tx.reviewTemplate.findFirstOrThrow({ where: { organizationId: org.A.id } }))).id}`).expect(404);
    await api('adminB', 'post', `/scales/${ids.scale}/retire`).expect(404);
  });
});
