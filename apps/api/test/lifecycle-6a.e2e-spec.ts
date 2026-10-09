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
import { AutomationService } from '../src/rules-engine/automation.service';
import { LifecycleJourneysService } from '../src/lifecycle/journeys.service';
import { DocumentsService, documentsBlockingPay } from '../src/documents/documents.service';
import { EICAR_TEST_STRING } from '../src/common/scanner';
import { addDays } from '../src/lifecycle/journey-rules';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Lifecycle batch 6a end to end against the real database (forced RLS, the app role) and Redis: checklist templates
// from the starters with the law's locked task, a joiner added before day one (not an employee, not in the
// directory), the checklist's owners (HR, the planned manager, the IT and Admin team), a desk request raised from a
// task and closed by the desk, document tasks closed by a verified document, forms, letters and skips, postponing
// (only unfinished tasks move), the CSV import preview, joiner scope by planned location, person documents (own
// uploads, HR uploads, the virus check, renamed files, versions, the payroll pre-flight), reminders and expiry, and
// two companies kept apart.
describe('Lifecycle batch 6a', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let automation: AutomationService;
  let journeys: LifecycleJourneysService;
  let documents: DocumentsService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'it' | 'mgr' | 'emp' | 'plantHr';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const joining = addDays(today, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>, o = org.A.id) =>
    tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      return fn(tx);
    });
  // A 1×1 PNG and a PDF carrying the EICAR test string (the dev scanner knows only EICAR).
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const EICAR_PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(EICAR_TEST_STRING), Buffer.from('\n%%EOF\n')]);
  const HTML_AS_PNG = Buffer.from('<html><script>alert(1)</script></html>');
  const task = async (journeyId: string, key: string) => (await api('hr', 'get', `/lifecycle/journeys/${journeyId}`).expect(200)).body.tasks.find((t: { key: string }) => t.key === key);
  const drain = async (until: () => Promise<boolean>) => {
    for (let i = 0; i < 40; i++) {
      await automation.dispatch();
      if (await until()) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
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
    automation = moduleRef.get(AutomationService);
    journeys = moduleRef.get(LifecycleJourneysService);
    documents = moduleRef.get(DocumentsService);

    planId = (await prisma.plan.create({ data: { name: `life6a-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Life6A Org ${k}`, slug: `life6a-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', tpl('hr_admin')],
      ['it', 'A', 'panel', [...tpl('desk_agent'), ...tpl('it_admin_coordinator')]],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['plantHr', 'A', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@life6a-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
    }
    await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Life Foods', shortName: `LF-${run}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      ids.hsr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      // Plant HR: the HR Executive role for the Hosur location only (P02 §4.3).
      const role = await tx.permissionProfile.create({ data: { ...o, name: `plant-hr-${run}`, permissionsJson: JSON.stringify(tpl('hr_executive')) } });
      await tx.roleGrant.create({ data: { ...o, userId: users.plantHr, permissionProfileId: role.id, scopeType: 'location', locationId: ids.hsr, validFrom: new Date('2026-01-01T00:00:00Z'), status: 'active', reason: 'Plant HR', grantedBy: users.adminA } });
      ids.group = (await tx.userGroup.create({ data: { ...o, name: `IT and Admin ${run}` } })).id;
      await tx.userGroupMember.create({ data: { ...o, groupId: ids.group, userId: users.it } });
    });
    for (const [who, k] of Object.entries({ adminA: 'A', adminB: 'B', hr: 'A', it: 'A', mgr: 'A', emp: 'A', plantHr: 'A' }) as [Who, 'A' | 'B'][]) {
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@life6a-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    const hire = async (who: Who, code: string, location: string, manager: string | null) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@life6a-${run}.test`, assignment: { locationId: location, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.mgrEmp = await hire('mgr', 'L-001', ids.blr, null);
    ids.empEmp = await hire('emp', 'L-002', ids.blr, ids.mgrEmp);
    ids.hrEmp = await hire('hr', 'L-003', ids.blr, null);
    ids.empPerson = await inA(async (tx) => (await tx.employee.findFirstOrThrow({ where: { id: ids.empEmp } })).personId);

    // The IT desk with a published "Joiner laptop" item fulfilled by its team (Service Desk SD-2.08 path).
    ids.desk = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help', key: 'IT', kind: 'it' }).expect(201)).body.id;
    await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users.it, role: 'agent' }).expect(201);
    await inA(async (tx) => {
      ids.deskTeam = (await tx.sdGroup.findFirstOrThrow({ where: { deskId: ids.desk } })).id;
      ids.catLaptop = (await tx.sdCategory.findFirstOrThrow({ where: { deskId: ids.desk, name: 'Laptop and devices' } })).id;
      await tx.sdGroupMember.create({ data: { organizationId: org.A.id, deskId: ids.desk, groupId: ids.deskTeam, userId: users.it } });
    });
    const laptop = (await api('adminA', 'post', '/desk/catalog/admin/items').send({ deskId: ids.desk, name: 'Joiner laptop', categoryId: ids.catLaptop, journeyOnly: true, draft: { fulfilment: [{ title: 'Image a laptop', groupId: ids.deskTeam, olaHours: 8 }] } }).expect(201)).body;
    await api('adminA', 'post', `/desk/catalog/admin/items/${laptop.id}/publish`).send({ version: laptop.version }).expect(200);
    ids.laptopItem = laptop.id;
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

  // ------------------------------------------------------------------------------------------ templates (LIFE-1.04/1.06)

  it('a company copies the starter checklist; the law’s appointment-letter task cannot be removed', async () => {
    await api('hr', 'post', '/lifecycle/joiners').send({ givenName: 'Too', familyName: 'Early', joiningOn: joining, legalEntityId: ids.entity, locationId: ids.blr }).expect(400);
    await api('emp', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'onboarding_standard' }).expect(403);
    const t = (await api('adminA', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'onboarding_standard' }).expect(201)).body;
    expect(t.tasks.find((x: { key: string }) => x.key === 'appointment_letter')).toMatchObject({ locked: true, required: true });
    expect(t.tasks.map((x: { key: string }) => x.key)).toEqual(expect.arrayContaining(['uan', 'form_11', 'form_2', 'esic']));
    const body = (tasks: Record<string, unknown>[]) => ({ kind: 'onboarding', name: t.name, active: true, version: t.version, tasks });
    const without = t.tasks.filter((x: { key: string }) => x.key !== 'appointment_letter');
    await api('adminA', 'put', `/lifecycle/journey-templates/${t.id}`).send(body(without)).expect(400);
    // IT and Admin tasks go to the IT and Admin team; the laptop task raises the desk's item (founder D1). The letter's
    // day may move but it stays locked even if the client says otherwise.
    const tasks = t.tasks.map((x: Record<string, unknown>) => ({
      ...x,
      ...(x.ownerType === 'it' || x.ownerType === 'admin' ? { ownerGroupId: ids.group } : {}),
      ...(x.key === 'laptop' ? { config: { itemId: ids.laptopItem } } : {}),
      ...(x.key === 'appointment_letter' ? { dueOffsetDays: -2, locked: false } : {}),
      ownerLabel: undefined,
    }));
    const saved = (await api('adminA', 'put', `/lifecycle/journey-templates/${t.id}`).send(body(tasks)).expect(200)).body;
    expect(saved.tasks.find((x: { key: string }) => x.key === 'appointment_letter')).toMatchObject({ locked: true, dueOffsetDays: -2 });
    await api('adminA', 'put', `/lifecycle/journey-templates/${t.id}`).send(body(tasks)).expect(409);
    // A dependency on a later task, or a bad form, is refused.
    await api('adminA', 'post', '/lifecycle/journey-templates').send({ kind: 'onboarding', name: 'Bad', active: false, tasks: [{ key: 'a', title: 'A', ownerType: 'hr', kind: 'tick', dueOffsetDays: 0, dependsOn: ['b'] }, { key: 'b', title: 'B', ownerType: 'hr', kind: 'tick', dueOffsetDays: 0 }] }).expect(400);
    await api('adminA', 'post', '/lifecycle/journey-templates').send({ kind: 'onboarding', name: 'Bad', active: false, tasks: [{ key: 'a', title: 'A', ownerType: 'hr', kind: 'document', config: { typeKey: 'nope' }, dueOffsetDays: 0 }] }).expect(400);
    ids.template = t.id;
  });

  // ------------------------------------------------------------------------------------------ joiners and checklists

  it('HR adds a joiner: not an employee, the checklist is due from the joining day, the manager sees "Joining soon"', async () => {
    await api('emp', 'post', '/lifecycle/joiners').send({ givenName: 'X', joiningOn: joining, legalEntityId: ids.entity, locationId: ids.blr }).expect(403);
    await api('hr', 'post', '/lifecycle/joiners').send({ givenName: 'Old', joiningOn: addDays(today, -1), legalEntityId: ids.entity, locationId: ids.blr }).expect(400);
    const j = (await api('hr', 'post', '/lifecycle/joiners').send({ givenName: 'Kavya', familyName: run, email: `kavya-${run}@mail.test`, joiningOn: joining, legalEntityId: ids.entity, locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: ids.mgrEmp }).expect(201)).body;
    ids.joiner = j.id;
    ids.journey = j.journeyId;
    // The same person twice is refused.
    await api('hr', 'post', '/lifecycle/joiners').send({ givenName: 'Kavya', email: `kavya-${run}@mail.test`, joiningOn: joining, legalEntityId: ids.entity, locationId: ids.blr }).expect(409);
    const pan = await task(ids.journey, 'collect_pan');
    expect(pan.dueOn).toBe(addDays(joining, -7));
    expect((await task(ids.journey, 'appointment_letter')).dueOn).toBe(addDays(joining, -2));
    // D2: not in the directory, but on the board and in the manager's "Joining soon".
    const dir = (await api('hr', 'get', '/people/directory?q=Kavya').expect(200)).body;
    expect(JSON.stringify(dir)).not.toContain(`Kavya`);
    const board = (await api('hr', 'get', '/lifecycle/joiners').expect(200)).body;
    expect(board.joiners.find((x: { id: string }) => x.id === ids.joiner)).toMatchObject({ joiningOn: joining, manager: `mgr ${run}` });
    const soon = (await api('mgr', 'get', '/lifecycle/joining-soon').expect(200)).body;
    expect(soon.map((x: { id: string }) => x.id)).toEqual([ids.joiner]);
    await api('emp', 'get', '/lifecycle/joiners').expect(403);
    await api('emp', 'get', `/lifecycle/journeys/${ids.journey}`).expect(403);
    const person = (await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: ids.joiner } }))).personId;
    ids.joinerPerson = person;
    expect(await inA((tx) => tx.employee.count({ where: { personId: person } }))).toBe(0);
    expect(await inA((tx) => tx.personRole.count({ where: { personId: person, roleType: 'preboarder' } }))).toBe(1);
  });

  it('owners do their own tasks: the manager, a form, a letter reference, no skipping the law or required tasks', async () => {
    const call = await task(ids.journey, 'welcome_call');
    await api('emp', 'post', `/lifecycle/tasks/${call.id}/complete`).send({ version: call.version }).expect(403);
    await api('mgr', 'post', `/lifecycle/tasks/${call.id}/complete`).send({ version: call.version }).expect(200);
    await api('mgr', 'post', `/lifecycle/tasks/${call.id}/complete`).send({ version: call.version + 1 }).expect(409);
    const plan = await task(ids.journey, 'first_week_plan');
    const bad = await api('mgr', 'post', `/lifecycle/tasks/${plan.id}/complete`).send({ version: plan.version, answers: {} }).expect(400);
    expect(bad.body.code).toBe('FORM_INVALID');
    await api('mgr', 'post', `/lifecycle/tasks/${plan.id}/complete`).send({ version: plan.version, answers: { desk_ready: true, first_week: 'Plant tour and safety training' } }).expect(200);
    // The manager may not do HR's task.
    const uan = await task(ids.journey, 'uan');
    await api('mgr', 'post', `/lifecycle/tasks/${uan.id}/complete`).send({ version: uan.version }).expect(403);
    const letter = await task(ids.journey, 'appointment_letter');
    await api('hr', 'post', `/lifecycle/tasks/${letter.id}/skip`).send({ version: letter.version, reason: 'Not needed' }).expect(400);
    await api('hr', 'post', `/lifecycle/tasks/${letter.id}/complete`).send({ version: letter.version }).expect(400);
    await api('hr', 'post', `/lifecycle/tasks/${letter.id}/complete`).send({ version: letter.version, note: 'LF/HR/2026/0007' }).expect(200);
    await api('hr', 'post', `/lifecycle/tasks/${uan.id}/skip`).send({ version: uan.version, reason: 'later' }).expect(400);
    const esic = await task(ids.journey, 'esic');
    await api('hr', 'post', `/lifecycle/tasks/${esic.id}/skip`).send({ version: esic.version, reason: 'ESI does not apply at this wage' }).expect(200);
    const pan = await task(ids.journey, 'collect_pan');
    await api('hr', 'post', `/lifecycle/tasks/${pan.id}/complete`).send({ version: pan.version }).expect(409);
    const j = (await api('hr', 'get', `/lifecycle/journeys/${ids.journey}`).expect(200)).body;
    expect(j.progress).toBeGreaterThan(0);
    expect(j.canManage).toBe(true);
  });

  it('the laptop task raises an IT desk request; the IT team sees it; the desk fulfilling it closes the task (D1)', async () => {
    const laptop = await task(ids.journey, 'laptop');
    expect(laptop.link?.type).toBe('sd_ticket');
    const mine = (await api('it', 'get', '/lifecycle/my-tasks').expect(200)).body.tasks;
    expect(mine.map((t: { key: string }) => t.key).sort()).toEqual(['access_card', 'accounts', 'laptop']);
    await api('it', 'post', `/lifecycle/tasks/${laptop.id}/complete`).send({ version: laptop.version }).expect(409);
    // The access card has no catalogue item yet: the team ticks it by hand.
    const card = mine.find((t: { key: string }) => t.key === 'access_card');
    await api('it', 'post', `/lifecycle/tasks/${card.id}/complete`).send({ version: card.version }).expect(200);
    const sdTask = await inA((tx) => tx.sdTask.findFirstOrThrow({ where: { ticketId: laptop.link.id } }));
    expect(sdTask.dueAt!.toISOString().slice(0, 10)).toBe(laptop.dueOn);
    await api('it', 'patch', `/desk/tasks/${sdTask.id}`).send({ version: sdTask.version, state: 'done' }).expect(200);
    expect(await drain(async () => (await task(ids.journey, 'laptop')).status === 'done')).toBe(true);
  });

  it('a document task closes when HR verifies the uploaded document; nobody verifies their own', async () => {
    const up = await api('hr', 'post', `/documents/people/${ids.joinerPerson}/pan_card`).attach('file', PNG, 'pan.png').expect(201);
    expect(up.body).toMatchObject({ status: 'uploaded', scanStatus: 'clean' });
    const queue = (await api('hr', 'get', '/documents/queue').expect(200)).body;
    const doc = queue.find((d: { personId: string }) => d.personId === ids.joinerPerson);
    expect(doc.typeKey).toBe('pan_card');
    await api('hr', 'post', `/documents/${doc.id}/decision`).send({ decision: 'reject', version: doc.version }).expect(400);
    await api('hr', 'post', `/documents/${doc.id}/decision`).send({ decision: 'verify', version: doc.version }).expect(200);
    expect(await drain(async () => (await task(ids.journey, 'collect_pan')).status === 'done')).toBe(true);
  });

  it('postponing moves only unfinished tasks by the same days (YX-LC-13)', async () => {
    const before = await task(ids.journey, 'collect_bank');
    const done = await task(ids.journey, 'collect_pan');
    const pb = (await api('hr', 'get', `/lifecycle/joiners/${ids.joiner}`).expect(200)).body;
    const later = addDays(joining, 14);
    await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/postpone`).send({ joiningOn: later, reason: 'Notice period at the old job', version: pb.version + 1 }).expect(409);
    expect((await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/postpone`).send({ joiningOn: later, reason: 'Notice period at the old job', version: pb.version }).expect(200)).body.moved).toBeGreaterThan(0);
    expect((await task(ids.journey, 'collect_bank')).dueOn).toBe(addDays(before.dueOn, 14));
    expect((await task(ids.journey, 'collect_pan')).dueOn).toBe(done.dueOn);
  });

  it('a joiner is reached by their planned place: Hosur plant HR sees nothing in Bengaluru', async () => {
    await api('plantHr', 'post', '/lifecycle/joiners').send({ givenName: 'Ravi', familyName: run, joiningOn: joining, legalEntityId: ids.entity, locationId: ids.blr }).expect(403);
    const hsr = (await api('plantHr', 'post', '/lifecycle/joiners').send({ givenName: 'Ravi', familyName: run, joiningOn: joining, legalEntityId: ids.entity, locationId: ids.hsr, templateId: ids.template }).expect(201)).body;
    const board = (await api('plantHr', 'get', '/lifecycle/joiners').expect(200)).body.joiners.map((x: { id: string }) => x.id);
    expect(board).toContain(hsr.id);
    expect(board).not.toContain(ids.joiner);
    await api('plantHr', 'get', `/lifecycle/joiners/${ids.joiner}`).expect(403);
    await api('plantHr', 'get', `/documents/people/${ids.joinerPerson}`).expect(200).then((r) => expect(r.body.documents).toEqual([]));
  });

  it('the import shows every row’s problem first, then adds only the good rows', async () => {
    const csv = ['given_name,family_name,email,joining_on,legal_entity,location,department,manager_code', `Asha,${run},asha-${run}@mail.test,${joining},LF-${run},BLR,PROD,L-001`, `Bad,${run},,${joining},LF-${run},NOWHERE,,`].join('\n');
    const preview = (await api('hr', 'post', '/lifecycle/joiners/import').send({ csv, commit: false }).expect(200)).body;
    expect(preview.rows.map((r: { ok: boolean }) => r.ok)).toEqual([true, false]);
    expect(preview.rows[1].problem).toMatch(/location/);
    expect(await inA((tx) => tx.person.count({ where: { primaryEmail: `asha-${run}@mail.test` } }))).toBe(0);
    const done = (await api('hr', 'post', '/lifecycle/joiners/import').send({ csv, commit: true }).expect(200)).body;
    expect(done.added).toBe(1);
    await api('hr', 'post', '/lifecycle/joiners/import').send({ csv: 'name\nx', commit: false }).expect(400);
  });

  // ------------------------------------------------------------------------------------------ documents (LIFE-1.02/1.03)

  it('person documents: own uploads, the virus check, renamed files refused, versions for HR, the pay pre-flight', async () => {
    // A photo needs no verification: the employee's own upload is final and theirs to download.
    const photo = (await api('emp', 'post', `/documents/people/${ids.empPerson}/photo`).attach('file', PNG, 'me.png').expect(201)).body;
    expect(photo.status).toBe('verified');
    const file = await api('emp', 'get', `/documents/${photo.id}/file`).expect(200);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['content-disposition']).toMatch(/^attachment/);
    await api('mgr', 'get', `/documents/${photo.id}/file`).expect(403);
    await api('mgr', 'get', `/documents/people/${ids.empPerson}`).expect(403);
    // HTML renamed as a PNG is refused before storing.
    const refused = await api('emp', 'post', `/documents/people/${ids.empPerson}/photo`).attach('file', HTML_AS_PNG, 'me.png').expect(400);
    expect(refused.body.code).toBe('FILE_REFUSED');
    // EICAR in a PDF: stored, quarantined, never served, never verifiable.
    const bad = (await api('hr', 'post', `/documents/people/${ids.empPerson}/pan_card`).attach('file', EICAR_PDF, 'pan.pdf').expect(201)).body;
    expect(bad.scanStatus).toBe('pending');
    expect(await inA((tx) => tx.file.count({ where: { scanStatus: 'infected', organizationId: org.A.id } }))).toBe(1);
    await api('hr', 'get', `/documents/${bad.id}/file`).expect(400);
    await api('hr', 'post', `/documents/${bad.id}/decision`).send({ decision: 'verify', version: bad.version }).expect(409);
    // The payroll pre-flight lists the unverified PAN (YX-DOC-17).
    const employment = await inA((tx) => tx.employment.findFirstOrThrow({ where: { employeeId: ids.empEmp } }));
    expect(await inA((tx) => documentsBlockingPay(tx, org.A.id, [employment.id]))).toEqual([{ employmentId: employment.id, typeKey: 'pan_card', status: 'uploaded' }]);
    // A clean re-upload is version 2; the person sees only the current one, HR any.
    const v2 = (await api('emp', 'post', `/documents/people/${ids.empPerson}/pan_card`).attach('file', PNG, 'pan.png').expect(201)).body;
    expect(v2.status).toBe('uploaded');
    await api('emp', 'get', `/documents/${v2.id}/file?version=1`).expect(403);
    await api('hr', 'get', `/documents/${v2.id}/file?version=2`).expect(200);
    await api('emp', 'post', `/documents/${v2.id}/decision`).send({ decision: 'verify', version: v2.version }).expect(403);
    // HR cannot verify their own document.
    const hrPerson = await inA(async (tx) => (await tx.employee.findFirstOrThrow({ where: { id: ids.hrEmp } })).personId);
    const own = (await api('hr', 'post', `/documents/people/${hrPerson}/education`).attach('file', PNG, 'deg.png').expect(201)).body;
    await api('hr', 'post', `/documents/${own.id}/decision`).send({ decision: 'verify', version: own.version }).expect(403);
    await api('hr', 'post', `/documents/${v2.id}/decision`).send({ decision: 'verify', version: v2.version }).expect(200);
    expect(await inA((tx) => documentsBlockingPay(tx, org.A.id, [employment.id]))).toEqual([]);
    const mine = (await api('emp', 'get', '/documents/me').expect(200)).body;
    expect(mine.documents.map((d: { typeKey: string }) => d.typeKey).sort()).toEqual(['pan_card', 'photo']);
  });

  it('expiring documents remind at the type’s days and expire on the day; due and overdue tasks remind once', async () => {
    const passport = (await api('hr', 'post', `/documents/people/${ids.empPerson}/passport`).field('expiresOn', addDays(today, 30)).attach('file', PNG, 'pp.png').expect(201)).body;
    expect((await documents.expirySweep(today)).reminded).toBeGreaterThanOrEqual(1);
    expect((await documents.expirySweep(today)).reminded).toBe(0);
    await documents.expirySweep(addDays(today, 30));
    expect((await inA((tx) => tx.document.findFirstOrThrow({ where: { id: passport.id } }))).status).toBe('expired');
    const bank = await task(ids.journey, 'collect_bank');
    await inA((tx) => tx.journeyTask.update({ where: { id: bank.id }, data: { dueOn: new Date(`${addDays(today, -3)}T00:00:00Z`) } }));
    const first = await journeys.sweep(today);
    expect(first.reminded).toBeGreaterThanOrEqual(1);
    expect(first.escalated).toBeGreaterThanOrEqual(1);
    const again = await journeys.sweep(today);
    expect(again).toEqual({ reminded: 0, escalated: 0 });
  });

  // ------------------------------------------------------------------------------------------ isolation

  it('two companies stay apart: B reads nothing of A, by API or by query', async () => {
    await api('adminB', 'get', `/lifecycle/journeys/${ids.journey}`).expect(404);
    await api('adminB', 'get', `/lifecycle/joiners/${ids.joiner}`).expect(404);
    await api('adminB', 'get', `/documents/people/${ids.empPerson}`).expect(404);
    expect((await api('adminB', 'get', '/lifecycle/joiners').expect(200)).body.joiners).toEqual([]);
    const counts = await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, async (tx) => [await tx.file.count(), await tx.document.count(), await tx.journey.count(), await tx.preboarding.count(), await tx.journeyTemplate.count()]);
    expect(counts).toEqual([0, 0, 0, 0, 0]);
    // System document types are shared and read-only.
    await expect(tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.documentType.updateMany({ where: { key: 'pan_card' }, data: { name: 'x' } }))).resolves.toEqual({ count: 0 });
  });
});
