import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { createHash, randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { addDays } from '../src/lifecycle/journey-rules';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// People small gaps (builder 3, people-design-map §5) against the real database (forced RLS): a starter copied twice,
// a signatory with letters waiting, PPL-13 own tasks, the PPL-37 merged list, PPL-33 retention, the fixed-term contract
// limit (contract.max_years) and the PPL-12 rehire preview from an accepted offer. Each with the wrong role, another
// company and bad input.
describe('People small gaps', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'it' | 'mgr' | 'emp';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const joining = addDays(today, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);

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

    planId = (await prisma.plan.create({ data: { name: `small-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Small Org ${k}`, slug: `small-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', tpl('hr_admin')],
      ['it', 'A', 'panel', null],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@small-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Small Foods', shortName: `SF-${run}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Fixed term', code: 'FT', category: 'permanent' } })).id;
      ids.group = (await tx.userGroup.create({ data: { ...o, name: `IT and Admin ${run}` } })).id;
      await tx.userGroupMember.create({ data: { ...o, groupId: ids.group, userId: users.it } });
    });
    await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, async (tx) => {
      ids.entityB = (await tx.legalEntity.create({ data: { organizationId: org.B.id, name: 'Other Co', shortName: `OC-${run}`, isDefault: true } })).id;
    });
    for (const [who, k] of Object.entries({ adminA: 'A', adminB: 'B', hr: 'A', it: 'A', mgr: 'A', emp: 'A' }) as [Who, 'A' | 'B'][]) {
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@small-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    const hire = async (name: string, code: string, joinedOn: string, extra: Record<string, unknown> = {}) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before go-live', givenName: name, familyName: run, employeeCode: code, joinedOn, assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null }, ...extra })
          .expect(201)
      ).body.id as string;
    ids.mgrEmp = await hire('mgr', 'S-001', '2026-04-06', { userId: users.mgr, workEmail: `mgr@small-${run}.test` });
    ids.empEmp = await hire('emp', 'S-002', '2026-04-06', { userId: users.emp, workEmail: `emp@small-${run}.test` });
    ids.empPerson = await inA(async (tx) => (await tx.employee.findFirstOrThrow({ where: { id: ids.empEmp } })).personId!);
    // An ex-employee for the rehire preview: worked here 2020 to 14 Feb 2025.
    ids.exEmp = await hire('Suresh', 'S-077', '2020-01-06', { workEmail: `suresh-${run}@mail.test` });
    await inA((tx) => tx.employment.updateMany({ where: { organizationId: org.A.id, employeeId: ids.exEmp }, data: { exitedOn: new Date('2025-02-14T00:00:00Z') } }));
  }, 240_000);

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

  // ------------------------------------------------------------------------------------------ checklists (Me and set-up)

  it('a starter is copied once per company: a second copy is refused; another company has its own', async () => {
    await api('emp', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'onboarding_standard' }).expect(403);
    await api('adminA', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'no_such_starter' }).expect(404);
    const t = (await api('adminA', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'onboarding_standard' }).expect(201)).body;
    const again = await api('adminA', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'onboarding_standard' }).expect(409);
    expect(again.body.message).toBe('You already have a copy of this starter. Reload the page to see it.');
    // Two clicks at once still make one copy.
    const both = await Promise.all([1, 2].map(() => api('adminA', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'offboarding_standard' })));
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    await api('adminB', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'onboarding_standard' }).expect(201);
    const list = (await api('adminA', 'get', '/lifecycle/journey-templates').expect(200)).body;
    expect(list.templates.filter((x: { starterKey: string }) => x.starterKey === 'onboarding_standard')).toHaveLength(1);
    expect(list.starters.find((s: { key: string }) => s.key === 'onboarding_standard').copied).toBe(true);
    // IT and Admin tasks go to the IT and Admin team (used by the PPL-13 test below).
    const tasks = t.tasks.map((x: Record<string, unknown>) => ({ ...x, ...(x.ownerType === 'it' || x.ownerType === 'admin' ? { ownerGroupId: ids.group } : {}), ...(x.key === 'laptop' ? { kind: 'tick', config: {} } : {}), ownerLabel: undefined }));
    await api('adminA', 'put', `/lifecycle/journey-templates/${t.id}`).send({ kind: 'onboarding', name: t.name, active: true, version: t.version, tasks }).expect(200);
  });

  // ------------------------------------------------------------------------------------------ PPL-13 own tasks

  it('PPL-13: HR sees every task; IT and the manager open the checklist but get only their own tasks; others are refused', async () => {
    const j = (await api('hr', 'post', '/lifecycle/joiners').send({ givenName: 'Kavya', familyName: run, email: `kavya-${run}@mail.test`, joiningOn: joining, legalEntityId: ids.entity, locationId: ids.blr, departmentId: ids.dept, managerEmployeeId: ids.mgrEmp }).expect(201)).body;
    const hr = (await api('hr', 'get', `/lifecycle/journeys/${j.journeyId}`).expect(200)).body;
    expect(hr.ownTasksOnly).toBe(false);
    expect(hr.tasks.length).toBe(hr.taskTotal);
    const mgr = (await api('mgr', 'get', `/lifecycle/journeys/${j.journeyId}`).expect(200)).body;
    expect(mgr.ownTasksOnly).toBe(true);
    expect(mgr.taskTotal).toBe(hr.taskTotal);
    expect(mgr.tasks.length).toBeGreaterThan(0);
    expect(mgr.tasks.length).toBeLessThan(hr.tasks.length);
    expect(new Set(mgr.tasks.map((t: { ownerType: string }) => t.ownerType))).toEqual(new Set(mgr.tasks.map((t: { ownerType: string }) => t.ownerType).filter((o: string) => o === 'manager' || o === 'buddy')));
    const it = (await api('it', 'get', `/lifecycle/journeys/${j.journeyId}`).expect(200)).body;
    expect(it.ownTasksOnly).toBe(true);
    expect(it.tasks.length).toBeGreaterThan(0);
    expect(it.tasks.every((t: { ownerType: string }) => t.ownerType === 'it' || t.ownerType === 'admin')).toBe(true);
    await api('emp', 'get', `/lifecycle/journeys/${j.journeyId}`).expect(403);
    await api('adminB', 'get', `/lifecycle/journeys/${j.journeyId}`).expect(404);
  });

  // ------------------------------------------------------------------------------------------ signatories

  it('a signatory with letters waiting for approval is not removed until they are decided', async () => {
    const sha = createHash('sha256').update(run).digest('hex');
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      const file = await tx.file.create({ data: { ...o, area: 'letters', storageRef: `t/${run}`, fileName: 't.docx', mime: 'application/octet-stream', size: 1, sha256: sha, uploadedVia: 'system' } });
      const t = await tx.letterTemplate.create({ data: { ...o, letterType: 'offer_letter', name: 'Offer', source: 'upload', fileId: file.id, requiresApproval: true, personSigns: false, status: 'draft' } });
      ids.signatory = (await tx.signatory.create({ data: { ...o, legalEntityId: ids.entity, userId: users.hr, title: 'HR head' } })).id;
      ids.letter = (await tx.letterIssue.create({ data: { ...o, templateId: t.id, templateVersion: 1, letterType: 'offer_letter', title: 'Offer', personId: ids.empPerson, legalEntityId: ids.entity, dataEnc: 'x', status: 'pending_approval', personSigns: false, signatoryId: ids.signatory } })).id;
    });
    await markSteppedUp(tenantPrisma, token.adminA);
    await markSteppedUp(tenantPrisma, token.adminB);
    await markSteppedUp(tenantPrisma, token.emp);
    await api('emp', 'post', `/letters/signatories/${ids.signatory}/remove`).expect(403);
    await api('adminB', 'post', `/letters/signatories/${ids.signatory}/remove`).expect(404);
    const refused = await api('adminA', 'post', `/letters/signatories/${ids.signatory}/remove`).expect(409);
    expect(refused.body.message).toBe(`hr ${run} signs 1 letter waiting for approval. Approve or withdraw them first.`);
    expect((await api('adminA', 'get', '/letters/signatories').expect(200)).body.map((s: { id: string }) => s.id)).toContain(ids.signatory);
    await inA((tx) => tx.letterIssue.update({ where: { id: ids.letter }, data: { status: 'rejected' } }));
    await api('adminA', 'post', `/letters/signatories/${ids.signatory}/remove`).expect(200);
    await api('adminA', 'post', `/letters/signatories/${ids.signatory}/remove`).expect(404);
  });

  // ------------------------------------------------------------------------------------------ PPL-37 merged list

  it('PPL-37: merged records are listed (newest first) for company-wide HR only, never another company', async () => {
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      const into = await tx.person.create({ data: { ...o, givenName: 'Meera', familyName: run, primaryEmail: `meera-${run}@mail.test` } });
      const old = await tx.person.create({ data: { ...o, givenName: 'Meera', familyName: 'Desk', status: 'merged', mergedInto: into.id } });
      const late = await tx.person.create({ data: { ...o, givenName: 'Meera', familyName: 'Login', status: 'merged', mergedInto: into.id } });
      await tx.personLinkLog.create({ data: { ...o, action: 'merge', personId: old.id, otherPersonId: into.id, basis: 'hr_confirmed', decidedBy: users.adminA, reason: 'Desk link', createdAt: new Date('2026-09-01T10:00:00Z') } });
      await tx.personLinkLog.create({ data: { ...o, action: 'merge', personId: late.id, otherPersonId: into.id, basis: 'hr_confirmed', decidedBy: users.adminA, reason: 'Same login', before: { givenName: 'Meera', familyName: run, primaryEmail: null, primaryPhone: null, roleIds: [], employeeLinked: null } } });
      ids.mergedLate = late.id;
      ids.mergedOld = old.id;
    });
    await api('emp', 'get', '/people/same-person/merged').expect(403);
    const rows = (await api('adminA', 'get', '/people/same-person/merged').expect(200)).body.rows;
    expect(rows.map((r: { personId: string }) => r.personId)).toEqual([ids.mergedLate, ids.mergedOld]);
    expect(rows[0]).toMatchObject({ name: 'Meera Login', intoName: `Meera ${run}`, mergedBy: `adminA ${run}`, note: 'Same login', canUnmerge: true });
    expect(rows[1].canUnmerge).toBe(false);
    expect((await api('adminB', 'get', '/people/same-person/merged').expect(200)).body.rows).toEqual([]);
    // An unmerged record leaves the list.
    await markSteppedUp(tenantPrisma, token.adminA);
    await api('adminA', 'post', `/people/persons/${ids.mergedLate}/unmerge`).send({ note: 'Different people after all' }).expect(201);
    expect((await api('adminA', 'get', '/people/same-person/merged').expect(200)).body.rows.map((r: { personId: string }) => r.personId)).toEqual([ids.mergedOld]);
  });

  // ------------------------------------------------------------------------------------------ PPL-33 retention

  it('PPL-33: the person sees how long each class is kept; the company changes it; a guarded value needs the access admin', async () => {
    expect((await api('emp', 'get', '/people/me/access-log').expect(200)).body.retention).toEqual({ internal: 8, personal: 3, confidential: 8, special: 1 });
    await api('emp', 'put', '/org/settings').send({ key: 'privacy.retention.personal_years', scopeType: 'tenant', value: '5' }).expect(403);
    await api('adminA', 'put', '/org/settings').send({ key: 'privacy.retention.personal_years', scopeType: 'tenant', value: '7' }).expect(400);
    await api('adminA', 'put', '/org/settings').send({ key: 'privacy.retention.personal_years', scopeType: 'tenant', value: '5' }).expect(200);
    await api('adminA', 'put', '/org/settings').send({ key: 'privacy.retention.special_years', scopeType: 'legal_entity', scopeId: ids.entity, value: '0' }).expect(200);
    expect((await api('emp', 'get', '/people/me/access-log').expect(200)).body.retention).toEqual({ internal: 8, personal: 5, confidential: 8, special: 0 });
    // Someone with no employee record here has no privacy page.
    await api('adminA', 'get', '/people/me/access-log').expect(404);
  });

  // ------------------------------------------------------------------------------------------ PPL-49 contract limit

  it('PPL-49: a fixed-term contract ends at most contract.max_years after joining (default 3); the company may change it', async () => {
    const put = (who: Who, body: Record<string, unknown>) => api(who, 'put', `/lifecycle/contracts/${ids.empEmp}`).send({ reason: 'Project contract', ...body });
    await put('emp', { action: 'set', contractEndOn: '2027-03-31' }).expect(403);
    await put('adminB', { action: 'set', contractEndOn: '2027-03-31' }).expect(404);
    await put('adminA', { action: 'set', contractEndOn: '2029-04-05' }).expect(200);
    const over = await put('adminA', { action: 'extend', contractEndOn: '2029-04-06' }).expect(400);
    expect(over.body.message).toBe('The new end is after the 3-year limit for fixed-term contracts. The latest end is 5 Apr 2029; make them permanent instead, or HR changes the limit in Settings.');
    await put('adminA', { action: 'extend', contractEndOn: '2029-04-05' }).expect(400); // not later than the current end
    // A per-employment-type value wins over the company's.
    await api('adminA', 'put', '/org/settings').send({ key: 'contract.max_years', scopeType: 'tenant', value: '9' }).expect(400);
    await api('adminA', 'put', '/org/settings').send({ key: 'contract.max_years', scopeType: 'tenant', value: '1' }).expect(200);
    await put('adminA', { action: 'set', contractEndOn: '2027-04-06' }).expect(400);
    await put('adminA', { action: 'set', contractEndOn: '2027-04-05' }).expect(200);
    await api('adminA', 'put', '/org/settings').send({ key: 'contract.max_years', scopeType: 'employment_type', scopeId: ids.perm, value: 'none' }).expect(200);
    await put('adminA', { action: 'extend', contractEndOn: '2035-12-31' }).expect(200);
    // Converting to permanent is never limited.
    await api('adminA', 'put', '/org/settings').send({ key: 'contract.max_years', scopeType: 'employment_type', scopeId: ids.perm, value: '1' }).expect(200);
    await put('adminA', { action: 'convert', employmentTypeId: ids.perm }).expect(200);
  });

  // ------------------------------------------------------------------------------------------ PPL-12 rehire preview

  it('PPL-12: an ex-employee offer shows the rehire impact before create, and a changed choice needs a reason', async () => {
    const offer = async (name: string, email: string) =>
      inA(async (tx) => {
        const o = { organizationId: org.A.id };
        const job = await tx.job.create({ data: { ...o, title: 'Operator', location: 'Bengaluru', createdById: users.hr } });
        const cand = await tx.candidate.create({ data: { ...o, name, email } });
        const pe = await tx.pipelineEntry.create({ data: { ...o, jobId: job.id, candidateId: cand.id, enteredVia: 'manual' } });
        return (await tx.offer.create({ data: { ...o, pipelineEntryId: pe.id, candidateId: cand.id, compensation: '600000', startDate: new Date(`${joining}T00:00:00Z`), expiresAt: new Date(Date.now() + 86_400_000), status: 'accepted', respondedAt: new Date(), letterSubject: 'Offer', letterBody: 'Offer' } })).id;
      });
    ids.offerRehire = await offer(`Suresh ${run}`, `suresh-${run}@mail.test`);
    ids.offerNew = await offer(`Asha ${run}`, `asha-${run}@mail.test`);
    const ready = (await api('hr', 'get', '/lifecycle/ready-to-onboard').expect(200)).body;
    expect(ready.find((r: { offerId: string }) => r.offerId === ids.offerRehire).personType).toBe('ex_employee');
    const preview = (q: string, who: Who = 'hr', offerId = ids.offerRehire) => api(who, 'get', `/lifecycle/ready-to-onboard/${offerId}/rehire?${q}`);
    const q = `legalEntityId=${ids.entity}&joiningOn=${joining}`;
    await preview(q, 'emp').expect(403);
    await preview(`legalEntityId=${ids.entityB}&joiningOn=${joining}`, 'adminB').expect(404);
    await preview(`legalEntityId=${ids.entity}&joiningOn=31-12-2026`).expect(400);
    await preview(`legalEntityId=${ids.entityB}&joiningOn=${joining}`).expect(400);
    await preview(q, 'hr', ids.offerNew).expect(404);
    const view = (await preview(q).expect(200)).body;
    expect(view.previous).toMatchObject({ employeeCode: 'S-077', exitedOn: '2025-02-14' });
    expect(view.options.map((o: { key: string }) => o.key)).toEqual(['code', 'pf', 'same_fy_tax', 'service', 'gratuity', 'leave', 'probation', 'prior_records']);
    expect(view.options.find((o: { key: string }) => o.key === 'gratuity')).toMatchObject({ policy: 'fresh', value: 'fresh', overridden: false });

    const body = { givenName: 'Suresh', familyName: run, joiningOn: joining, legalEntityId: ids.entity, locationId: ids.blr };
    await api('hr', 'post', `/lifecycle/ready-to-onboard/${ids.offerRehire}`).send({ ...body, rehire: { gratuity: { value: 'add_prior' } } }).expect(400);
    await api('hr', 'post', `/lifecycle/ready-to-onboard/${ids.offerRehire}`).send({ ...body, rehire: { gratuity: { value: 'never_heard_of' } } }).expect(400);
    await api('hr', 'post', `/lifecycle/ready-to-onboard/${ids.offerNew}`).send({ ...body, givenName: 'Asha', rehire: { gratuity: { value: 'add_prior', reason: 'Agreed' } } }).expect(400);
    const created = (await api('hr', 'post', `/lifecycle/ready-to-onboard/${ids.offerRehire}`).send({ ...body, rehire: { gratuity: { value: 'add_prior', reason: 'Agreed in the offer' }, code: { value: 'reuse', reason: null } } }).expect(201)).body;
    // The ex-employee joins on their own record, as a rehire, with the choice and its reason kept.
    const rehire = (await api('hr', 'get', `/lifecycle/joiners/${created.id}/rehire`).expect(200)).body;
    expect(rehire.previous.employeeCode).toBe('S-077');
    expect(rehire.options.find((o: { key: string }) => o.key === 'gratuity')).toMatchObject({ value: 'add_prior', overridden: true, reason: 'Agreed in the offer' });
    expect(rehire.options.find((o: { key: string }) => o.key === 'code')).toMatchObject({ value: 'reuse', overridden: false });
    await api('hr', 'post', `/lifecycle/ready-to-onboard/${ids.offerRehire}`).send(body).expect(409);
    // A new person's offer still creates a new joiner with no rehire.
    await api('hr', 'post', `/lifecycle/ready-to-onboard/${ids.offerNew}`).send({ ...body, givenName: 'Asha' }).expect(201);
  });
});
