import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import PizZip from 'pizzip';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import type Redis from 'ioredis';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { AutomationService } from '../src/rules-engine/automation.service';
import { addDays } from '../src/lifecycle/journey-rules';
import { buildDocx } from '../src/documents/letters/docx';
import { BGV_NOTICE } from '../src/lifecycle/portal.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Lifecycle batch 6b end to end against the real database (forced RLS, the app role) and Redis: Word templates (safety,
// unknown fields with "did you mean", the preview gate), the pre-boarding portal (code sign-in, sealed and masked
// answers, the step-up for PAN and bank, documents, one joiner never reaching another), BGV consent (no check without
// it, withdrawal stops checks, a discrepancy never cancels the joiner), letters (approval by the signatory, gap-free
// numbers, the public check, immutability, a correction that supersedes, the checklist task closed by the issued
// letter), OTP e-sign with the G-19 disclosure and a sealed copy, joining (identity check, the hire, change requests
// for identity and bank, the portal closed), cancelling a joiner, the ATS hand-off, two companies apart.
// PDFs come from the dev-fake converter (LETTER_PDF_CONVERTER=dev-fake): this suite does not start Gotenberg.
process.env.LETTER_PDF_CONVERTER = 'dev-fake';

describe('Lifecycle batch 6b', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let automation: AutomationService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'signer' | 'mgr';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  let row: { personId: string } = { personId: '' };
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const portal = (method: 'get' | 'post' | 'put', path: string, t?: string) => {
    const r = request(server())[method](`/api/v1/portal/join/${org.A.slug}${path}`);
    return t ? r.set('X-Join-Portal', t) : r;
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const joining = addDays(today, 10);
  const email = { send: jest.fn(async (_m: { to: string; subject: string; html?: string }) => ({ success: true })) };
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const codeFor = async (to: string) => {
    for (let i = 0; i < 60; i++) {
      const m = [...email.send.mock.calls].reverse().find(([x]) => x.to === to && /^\d{6}/.test(x.subject));
      if (m) return m[0].subject.slice(0, 6);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`no code for ${to}`);
  };
  const signIn = async (mail: string) => {
    email.send.mockClear();
    await portal('post', '/code').send({ email: mail }).expect(200);
    return (await portal('post', '/verify').send({ email: mail, code: await codeFor(mail) }).expect(200)).body.token as string;
  };
  const drain = async (until: () => Promise<boolean>) => {
    for (let i = 0; i < 40; i++) {
      await automation.dispatch();
      if (await until()) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  };
  const addJoiner = async (given: string, mail: string, on = joining) => (await api('hr', 'post', '/lifecycle/joiners').send({ givenName: given, familyName: run, email: mail, joiningOn: on, legalEntityId: ids.entity, locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: ids.mgrEmp }).expect(201)).body as { id: string; journeyId: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    automation = moduleRef.get(AutomationService);
    // The per-IP hourly code limit (production behaviour) counts every run from this machine; start each run clean.
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `life6b-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Life6B Org ${k}`, slug: `life6b-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', [...tpl('hr_admin'), 'employee.change.manage']],
      ['signer', 'A', 'panel', null],
      ['mgr', 'A', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@life6b-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@life6b-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Life Foods Pvt Ltd', shortName: `LB${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    ids.mgrEmp = (await api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: 'Divya', familyName: run, employeeCode: 'LB-001', joinedOn: '2026-04-06', userId: users.mgr, workEmail: `mgr@life6b-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } }).expect(201)).body.id;
    await api('adminA', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'onboarding_standard' }).expect(201);
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

  // ------------------------------------------------------------------------------------------ templates (LIFE-2.04)

  it('Word templates: unsafe or unknown placeholders are refused; a template goes live only after its preview', async () => {
    const macro = new PizZip(buildDocx([{ text: 'Hi {{employee_name}}' }]));
    macro.file('[Content_Types].xml', macro.file('[Content_Types].xml')!.asText().replace('wordprocessingml.document.main+xml', 'wordprocessingml.document.main+xml"/><Override PartName="/word/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject'));
    macro.file('word/vbaProject.bin', 'x');
    const up = (buf: Buffer) => api('hr', 'post', '/letters/templates').field('letterType', 'custom_note').field('name', 'Note').field('requiresApproval', 'false').field('personSigns', 'false').attach('file', buf, 'note.docx');
    expect((await up(macro.generate({ type: 'nodebuffer' }) as Buffer).expect(400)).body.code).toBe('TEMPLATE_REFUSED');
    const linked = new PizZip(buildDocx([{ text: 'Hi' }]));
    linked.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="http://evil.test/x.png" TargetMode="External"/></Relationships>');
    expect((await up(linked.generate({ type: 'nodebuffer' }) as Buffer).expect(400)).body.message).toMatch(/outside the file/);
    const typo = await up(buildDocx([{ text: 'Dear {{emp_nme}}' }])).expect(400);
    expect(typo.body.message).toMatch(/did you mean \{\{employee_name\}\}/);
    expect((await up(buildDocx([{ text: 'Dear {{employee.name}}' }])).expect(400)).body.message).toMatch(/not a field name/);
    // The starters: a draft until its sample preview was seen.
    for (const letterType of ['appointment', 'confirmation', 'welcome']) {
      const t = (await api('adminA', 'post', '/letters/templates/starter').send({ letterType }).expect(201)).body;
      ids[`tpl_${letterType}`] = t.id;
    }
    await api('adminA', 'post', `/letters/templates/${ids.tpl_appointment}/activate`).expect(409);
    const pdf = await api('adminA', 'get', `/letters/templates/${ids.tpl_appointment}/preview`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    for (const k of ['appointment', 'confirmation']) {
      if (k !== 'appointment') await api('adminA', 'get', `/letters/templates/${ids[`tpl_${k}`]}/preview`).expect(200);
      await api('adminA', 'post', `/letters/templates/${ids[`tpl_${k}`]}/activate`).expect(200);
    }
    // Who signs: Signer for the entity (a fresh second step).
    await api('adminA', 'post', '/letters/signatories').field('legalEntityId', ids.entity).field('userId', users.signer).field('title', 'Head of HR').expect(403);
    await markSteppedUp(tenantPrisma, token.adminA);
    await api('adminA', 'post', '/letters/signatories').field('legalEntityId', ids.entity).field('userId', users.signer).field('title', 'Head of HR').expect(201);
  });

  // ------------------------------------------------------------------------------------------ portal (LIFE-2.01 / 2.02)

  it('the joiner is invited; the portal signs in by code, seals answers, masks them, and asks a fresh code for PAN and bank', async () => {
    const mail = `kavya-${run}@mail.test`;
    email.send.mockClear();
    const j = await addJoiner('Kavya', mail);
    ids.joiner = j.id;
    ids.journey = j.journeyId;
    expect(email.send.mock.calls.some(([m]) => m.to === mail && /joining forms/.test(m.subject))).toBe(true);
    // Unknown emails get the same answer and no code.
    email.send.mockClear();
    await portal('post', '/code').send({ email: `nobody-${run}@mail.test` }).expect(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(email.send.mock.calls.some(([m]) => m.to === `nobody-${run}@mail.test`)).toBe(false);
    const t = await signIn(mail);
    ids.portal = t;
    await portal('get', '/me').expect(401);
    const me = (await portal('get', '/me', t).expect(200)).body;
    expect(me).toMatchObject({ name: `Kavya ${run}`, joiningOn: joining, completion: 0 });
    expect(me.documents.map((d: { typeKey: string }) => d.typeKey)).toEqual(expect.arrayContaining(['pan_card', 'bank_proof']));
    const identity = { legalName: `Kavya ${run}`, pan: 'ABCPE1234F', aadhaar: '234567890124' };
    expect((await portal('put', '/sections/identity', t).send(identity).expect(403)).body.code).toBe('PORTAL_STEP_UP');
    email.send.mockClear();
    await portal('post', '/step-up/code', t).expect(200);
    await portal('post', '/step-up', t).send({ code: await codeFor(mail) }).expect(200);
    await portal('put', '/sections/identity', t).send({ ...identity, aadhaar: '234567890123' }).expect(400);
    await portal('put', '/sections/identity', t).send(identity).expect(200);
    await portal('put', '/sections/bank', t).send({ holderName: `Kavya ${run}`, accountNumber: '123456789012', ifsc: 'HDFC0001234' }).expect(200);
    await portal('put', '/sections/personal', t).send({ dateOfBirth: '1999-05-14', gender: 'female', addressLine1: '14, 3rd Cross, Jayanagar', city: 'Bengaluru', stateCode: 'IN-KA', postalCode: '560011' }).expect(200);
    await portal('put', '/sections/emergency', t).send({ name: 'Anil', relation: 'Father', phone: '+91 98450 11122' }).expect(200);
    await portal('put', '/sections/nominees', t).send({ nominees: [{ name: 'Anil', relation: 'Father', sharePercent: 60 }, { name: 'Usha', relation: 'Mother', sharePercent: 30 }] }).expect(400);
    await portal('put', '/sections/nominees', t).send({ nominees: [{ name: 'Anil', relation: 'Father', sharePercent: 60 }, { name: 'Usha', relation: 'Mother', sharePercent: 40 }] }).expect(200);
    await portal('put', '/sections/tax', t).send({ regime: 'new' }).expect(200);
    await portal('post', '/documents/pan_card', t).attach('file', PNG, 'pan.png').expect(201);
    await portal('post', '/documents/passport', t).attach('file', PNG, 'pp.png').expect(403);
    const after = (await portal('get', '/me', t).expect(200)).body;
    expect(after.answers.identity.pan).toBe('••••••234F');
    expect(after.answers.bank.account).toBe('••••••••9012');
    expect(after.completion).toBeGreaterThan(50);
    // Sealed at rest: no PAN or account number in the row.
    const row = await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: ids.joiner } }));
    expect(JSON.stringify(row)).not.toMatch(/ABCPE1234F|123456789012/);
    // HR sees the forms masked; the manager does not see them.
    const forms = (await api('hr', 'get', `/lifecycle/joiners/${ids.joiner}/forms`).expect(200)).body;
    expect(forms.answers.identity.pan).toBe('••••••234F');
    await api('mgr', 'get', `/lifecycle/joiners/${ids.joiner}/forms`).expect(403);
  });

  // ------------------------------------------------------------------------------------------ BGV (LIFE-2.03)

  it('BGV: no check without the joiner’s consent; withdrawing stops checks; a discrepancy never cancels the joiner', async () => {
    row = await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: ids.joiner } }));
    await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/bgv/checks`).send({ checkType: 'education', gate: 'none' }).expect(409);
    await portal('post', '/bgv-consent', ids.portal).send({ consent: true, noticeVersion: BGV_NOTICE }).expect(400);
    await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/bgv/ask`).expect(200);
    expect((await portal('get', '/me', ids.portal).expect(200)).body.bgv.items.length).toBeGreaterThan(3);
    await portal('post', '/bgv-consent', ids.portal).send({ consent: true, noticeVersion: BGV_NOTICE }).expect(200);
    const k = (await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/bgv/checks`).send({ checkType: 'education', gate: 'none' }).expect(201)).body;
    await api('hr', 'post', `/lifecycle/bgv/checks/${k.id}`).field('status', 'discrepancy').field('note', 'Year of passing differs').field('version', '1').attach('file', PNG, 'report.png').expect(200);
    expect((await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: ids.joiner } }))).status).toBe('invited');
    await portal('post', '/bgv-consent', ids.portal).send({ consent: false, noticeVersion: BGV_NOTICE }).expect(200);
    const second = (await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/bgv/checks`).send({ checkType: 'employment', gate: 'none' }).expect(409));
    expect(second.body.message).toMatch(/no consent/i);
    await expect(inA((tx) => tx.consentRecord.updateMany({ where: { personId: row.personId }, data: { noticeVersion: 'x' } }))).rejects.toThrow(/kept as given/);
    expect((await inA((tx) => tx.bgvCheck.findFirstOrThrow({ where: { id: k.id } }))).status).toBe('discrepancy');
  });

  // ------------------------------------------------------------------------------------------ letters (LIFE-2.05 … 2.07)

  it('the appointment letter: the signatory approves, a gap-free number, the public check, the checklist task closes', async () => {
    row = await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: ids.joiner } }));
    // A confirmation letter needs an employee code the joiner does not have yet: never a silent blank.
    expect((await api('hr', 'post', '/letters/issue').send({ letterType: 'confirmation', personId: row.personId }).expect(400)).body.code).toBe('LETTER_FIELDS_MISSING');
    await api('mgr', 'post', '/letters/issue').send({ letterType: 'appointment', personId: row.personId }).expect(403);
    const l = (await api('hr', 'post', '/letters/issue').send({ letterType: 'appointment', personId: row.personId, subjectType: 'preboarding', subjectId: ids.joiner }).expect(201)).body;
    expect(l.status).toBe('pending_approval');
    await api('hr', 'post', '/letters/issue').send({ letterType: 'appointment', personId: row.personId }).expect(409);
    const task = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { assigneeUserId: users.signer, status: 'open' } }));
    await api('signer', 'post', `/workflow/approvals/tasks/${task.id}/decide`).send({ decision: 'approve' }).expect(200);
    expect(await drain(async () => (await inA((tx) => tx.letterIssue.findFirstOrThrow({ where: { id: l.id } }))).status === 'issued')).toBe(true);
    const issued = await inA((tx) => tx.letterIssue.findFirstOrThrow({ where: { id: l.id } }));
    expect(issued.referenceNo).toMatch(new RegExp(`^LB${run.slice(0, 4).toUpperCase()}/APT/\\d{4}/000001$`));
    ids.letter = l.id;
    ids.code = issued.verifyCode!;
    expect((await request(server()).get(`/api/v1/public/pay/verify/${issued.verifyCode}`).expect(200)).body).toMatchObject({ company: 'Life6B Org A', kind: 'Appointment letter', name: `Kavya ${run}`, status: 'current' });
    // An issued letter never changes (database trigger).
    await expect(inA((tx) => tx.letterIssue.update({ where: { id: l.id }, data: { sha256: 'a'.repeat(64) } }))).rejects.toThrow(/never changes/);
    expect(await drain(async () => (await api('hr', 'get', `/lifecycle/journeys/${ids.journey}`).expect(200)).body.tasks.find((t: { key: string }) => t.key === 'appointment_letter').status === 'done')).toBe(true);
    const lt = (await api('hr', 'get', `/lifecycle/journeys/${ids.journey}`).expect(200)).body.tasks.find((t: { key: string }) => t.key === 'appointment_letter');
    expect(lt.link).toEqual({ type: 'letter_issue', id: l.id });
  });

  it('the joiner accepts it in the portal with a code (G-19 once); the sealed copy is kept; a correction supersedes', async () => {
    const mail = `kavya-${run}@mail.test`;
    const me = (await portal('get', '/me', ids.portal).expect(200)).body;
    expect(me.letters[0]).toMatchObject({ id: ids.letter, signature: { status: 'open' } });
    email.send.mockClear();
    await portal('post', `/letters/${ids.letter}/sign/code`, ids.portal).expect(200);
    const code = await codeFor(mail);
    expect((await portal('post', `/letters/${ids.letter}/sign`, ids.portal).send({ code, accept: true }).expect(400)).body.code).toBe('ESIGN_DISCLOSURE');
    await portal('post', `/letters/${ids.letter}/sign`, ids.portal).send({ code, accept: true, disclosureAccepted: true }).expect(200);
    const l = await inA((tx) => tx.letterIssue.findFirstOrThrow({ where: { id: ids.letter } }));
    expect(l.acceptedAt).not.toBeNull();
    await portal('get', `/letters/${ids.letter}/file?which=acceptance`, ids.portal).expect(200);
    // Another joiner never reaches this letter.
    await addJoiner('Ravi', `ravi-${run}@mail.test`);
    const other = await signIn(`ravi-${run}@mail.test`);
    await portal('get', `/letters/${ids.letter}/file`, other).expect(404);
    // A correction: a new number, the old one superseded on the public page.
    const fix = (await api('hr', 'post', '/letters/issue').send({ letterType: 'appointment', personId: row.personId, supersedesId: ids.letter }).expect(201)).body;
    const task = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { assigneeUserId: users.signer, status: 'open' } }));
    await api('signer', 'post', `/workflow/approvals/tasks/${task.id}/decide`).send({ decision: 'approve' }).expect(200);
    expect(await drain(async () => (await inA((tx) => tx.letterIssue.findFirstOrThrow({ where: { id: fix.id } }))).status === 'issued')).toBe(true);
    expect((await inA((tx) => tx.letterIssue.findFirstOrThrow({ where: { id: fix.id } }))).referenceNo).toMatch(/000002$/);
    expect((await request(server()).get(`/api/v1/public/pay/verify/${ids.code}`).expect(200)).body.status).toBe('superseded');
  });

  // ------------------------------------------------------------------------------------------ joining and cancelling (LIFE-2.08)

  it('joining: on the day, with the identity check; the hire, identity and bank as change requests, the portal closed', async () => {
    const pb = (await api('hr', 'get', `/lifecycle/joiners/${ids.joiner}`).expect(200)).body;
    await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/join`).send({ identityAttested: true, status: 'probation', version: pb.version }).expect(400);
    await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/postpone`).send({ joiningOn: today, reason: 'Joins early', version: pb.version }).expect(200);
    const now = (await api('hr', 'get', `/lifecycle/joiners/${ids.joiner}`).expect(200)).body;
    await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/join`).send({ identityAttested: false, status: 'probation', version: now.version }).expect(400);
    const done = (await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/join`).send({ identityAttested: true, status: 'probation', version: now.version }).expect(200)).body;
    expect(done.changeRequests.sort()).toEqual(['aadhaar', 'bank_salary', 'legal_name', 'pan']);
    const reqs = await inA((tx) => tx.employeeProfileRequest.findMany({ where: { employeeId: done.employeeId } }));
    expect(reqs.every((r) => r.status === 'pending')).toBe(true);
    expect((await inA((tx) => tx.employeePersonalDetails.findFirstOrThrow({ where: { employeeId: done.employeeId } }))).city).toBe('Bengaluru');
    expect((await inA((tx) => tx.employee.findFirstOrThrow({ where: { id: done.employeeId } }))).personId).toBe(row.personId);
    await portal('get', '/me', ids.portal).expect(401);
    await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/join`).send({ identityAttested: true, status: 'probation', version: now.version + 1 }).expect(409);
  });

  it('a joiner who reneges is cancelled in one step (a fresh second step), nothing deleted', async () => {
    const j = await addJoiner('Meena', `meena-${run}@mail.test`);
    const t = await signIn(`meena-${run}@mail.test`);
    const pb = (await api('hr', 'get', `/lifecycle/joiners/${j.id}`).expect(200)).body;
    await api('hr', 'post', `/lifecycle/joiners/${j.id}/cancel`).send({ outcome: 'reneged', reason: 'Took another offer', version: pb.version }).expect(403);
    await markSteppedUp(tenantPrisma, token.hr);
    await api('hr', 'post', `/lifecycle/joiners/${j.id}/cancel`).send({ outcome: 'did_not_join', reason: 'x x x', version: pb.version }).expect(400);
    await api('hr', 'post', `/lifecycle/joiners/${j.id}/cancel`).send({ outcome: 'reneged', reason: 'Took another offer', version: pb.version }).expect(200);
    const after = await inA((tx) => tx.preboarding.findFirstOrThrow({ where: { id: j.id } }));
    expect(after).toMatchObject({ status: 'cancelled', outcome: 'reneged' });
    expect((await inA((tx) => tx.journey.findFirstOrThrow({ where: { id: j.journeyId } }))).status).toBe('cancelled');
    await portal('get', '/me', t).expect(401);
  });

  it('accepted offers wait in Ready to onboard; one becomes a joiner once; a current employee is not onboarded', async () => {
    const offers = await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      const job = await tx.job.create({ data: { ...o, title: 'Quality Inspector', createdById: users.hr } });
      const make = async (name: string, mail: string) => {
        const cand = await tx.candidate.create({ data: { ...o, name, email: mail } });
        const pe = await tx.pipelineEntry.create({ data: { ...o, jobId: job.id, candidateId: cand.id, enteredVia: 'manual' } });
        return (await tx.offer.create({ data: { ...o, pipelineEntryId: pe.id, candidateId: cand.id, compensation: '600000', startDate: new Date(`${joining}T00:00:00Z`), expiresAt: new Date(Date.now() + 86_400_000), status: 'accepted', letterSubject: 'Offer', letterBody: 'Offer' } })).id;
      };
      return { fresh: await make(`Asha ${run}`, `asha-${run}@mail.test`), internal: await make(`Divya ${run}`, `mgr@life6b-${run}.test`) };
    });
    const ready = (await api('hr', 'get', '/lifecycle/ready-to-onboard').expect(200)).body;
    expect(ready.find((r: { offerId: string }) => r.offerId === offers.fresh)).toMatchObject({ personType: 'new', jobTitle: 'Quality Inspector' });
    expect(ready.find((r: { offerId: string }) => r.offerId === offers.internal)).toMatchObject({ personType: 'internal' });
    const body = { givenName: 'Asha', familyName: run, joiningOn: joining, legalEntityId: ids.entity, locationId: ids.blr };
    await api('hr', 'post', `/lifecycle/ready-to-onboard/${offers.fresh}`).send(body).expect(201);
    await api('hr', 'post', `/lifecycle/ready-to-onboard/${offers.fresh}`).send(body).expect(409);
    await api('hr', 'post', `/lifecycle/ready-to-onboard/${offers.internal}`).send({ ...body, givenName: 'Divya' }).expect(409);
    expect((await api('hr', 'get', '/lifecycle/ready-to-onboard').expect(200)).body.some((r: { offerId: string }) => r.offerId === offers.fresh)).toBe(false);
  });

  it('two companies stay apart: B reads nothing of A by API, query or portal', async () => {
    await api('adminB', 'get', `/letters/${ids.letter}/file`).expect(404);
    expect((await api('adminB', 'get', '/letters/templates').expect(200)).body.templates).toEqual([]);
    const counts = await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, async (tx) => [await tx.letterIssue.count(), await tx.letterTemplate.count(), await tx.consentRecord.count(), await tx.bgvCheck.count(), await tx.preboardingPortalSession.count(), await tx.signatureRequest.count()]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0]);
    await request(server()).get(`/api/v1/portal/join/${org.B.slug}/me`).set('X-Join-Portal', ids.portal).expect(401);
  });
});
