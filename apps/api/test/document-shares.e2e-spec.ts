import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { FileStore } from '../src/documents/file-store';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// PPL-30 "Share an expiring link" end to end against the real database (forced RLS, the app role): an employee shares
// their own issued letter or pay document for 1, 7 or 30 days; the public link opens that one document, is counted
// and audited; nobody shares someone else's document or an upload; "Stop sharing" and expiry close the link; two
// companies stay apart.
process.env.LETTER_PDF_CONVERTER = 'dev-fake';
process.env.SD_SCANNER = 'dev-fake';

describe('PPL-30 document share links', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let store: FileStore;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'emp1' | 'emp2';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const PAY_PDF = Buffer.from('%PDF-1.4\n% payslip for the share test\n%%EOF\n');
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const open = (path: string) => request(server()).get(`/api/v1${path}`).buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    store = moduleRef.get(FileStore);

    planId = (await prisma.plan.create({ data: { name: `share-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Share Org ${k}`, slug: `share-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['emp1', 'A', 'panel', []],
      ['emp2', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@share-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@share-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Share Foods Pvt Ltd', shortName: `SH${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Quality', code: 'QA', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, given: string, code: string) =>
      (await api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@share-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } }).expect(201)).body.id as string;
    emp.emp1 = await hire('emp1', 'Divya', 'SH-001');
    emp.emp2 = await hire('emp2', 'Ravi', 'SH-002');
    const t = (await api('adminA', 'post', '/letters/templates/starter').send({ letterType: 'employment_certificate' }).expect(201)).body;
    await api('adminA', 'get', `/letters/templates/${t.id}/preview`).expect(200);
    await api('adminA', 'post', `/letters/templates/${t.id}/activate`).expect(200);
    await markSteppedUp(tenantPrisma, token.adminA);
    await api('adminA', 'post', '/letters/signatories').field('legalEntityId', ids.entity).field('userId', users.adminA).field('title', 'Head of People').expect(201);
    ids.letter = (await api('emp1', 'post', '/letters/me/certificates').send({ letterType: 'employment_certificate' }).expect(201)).body.id;
    ids.letter2 = (await api('emp2', 'post', '/letters/me/certificates').send({ letterType: 'employment_certificate' }).expect(201)).body.id;
    // A pay document of emp1 (as payroll would issue it), its file sealed in the shared store.
    const fileRef = await store.put(`pay/${org.A.id}/share-${run}.pdf`, PAY_PDF);
    const sha = createHash('sha256').update(PAY_PDF).digest('hex');
    ids.pay = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return (await tx.payDocument.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, employeeId: emp.emp1, kind: 'payslip', title: 'Payslip, August 2026', templateKey: 'payslip', templateVersion: 1, referenceNo: `SH/PS/2026/${run}`, fileRef, sha256: sha, unsignedSha256: sha, unsignedBytes: PAY_PDF.length, status: 'issued', issuedBy: users.adminA, retainUntil: new Date('2034-03-31T00:00:00Z') } })).id;
    });
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

  it('the table is company-isolated by forced RLS and kept from YukthiX support', async () => {
    const rows = await prisma.$queryRaw<{ forced: boolean; policies: bigint }[]>`
      SELECT c.relforcerowsecurity AS forced, (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public' WHERE c.relname = 'document_shares'`;
    expect(rows).toEqual([{ forced: true, policies: BigInt(2) }]);
  });

  it('an employee shares their own letter; the link opens that one PDF, read-only, counted and audited', async () => {
    const s = (await api('emp1', 'post', '/documents/shares').send({ source: 'letter', id: ids.letter, days: 7 }).expect(201)).body;
    expect(s.path).toMatch(new RegExp(`^/public/shares/${org.A.id}/[A-Za-z0-9_-]{43}$`));
    const days = (new Date(s.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    ids.letterShare = s.id;
    ids.letterPath = s.path;
    // Only the hash is stored.
    const row = await inA((tx) => tx.documentShare.findFirstOrThrow({ where: { id: s.id } }));
    expect(row.tokenHash).toBe(createHash('sha256').update(s.path.split('/').pop()).digest('hex'));
    const res = await open(s.path).expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^inline;/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'document.share.opened', entityId: s.id } }))).toBe(1);
    const mine = (await api('emp1', 'get', '/documents/shares').expect(200)).body;
    expect(mine).toEqual([expect.objectContaining({ id: s.id, source: 'letter', sourceId: ids.letter, opens: 1 })]);
    expect((await api('emp2', 'get', '/documents/shares').expect(200)).body).toEqual([]);
  });

  it('a pay document is shared the same way; its bytes are checked against the issued hash', async () => {
    const s = (await api('emp1', 'post', '/documents/shares').send({ source: 'pay', id: ids.pay, days: 1 }).expect(201)).body;
    const res = await open(s.path).expect(200);
    expect(Buffer.compare(res.body as Buffer, PAY_PDF)).toBe(0);
    ids.payPath = s.path;
  });

  it("nobody shares someone else's document, an upload, or for longer than the choices", async () => {
    await api('emp2', 'post', '/documents/shares').send({ source: 'letter', id: ids.letter, days: 7 }).expect(404);
    await api('emp2', 'post', '/documents/shares').send({ source: 'pay', id: ids.pay, days: 7 }).expect(404);
    await api('adminA', 'post', '/documents/shares').send({ source: 'letter', id: ids.letter, days: 7 }).expect(403);
    await api('emp1', 'post', '/documents/shares').send({ source: 'letter', id: ids.letter2, days: 7 }).expect(404);
    await api('emp1', 'post', '/documents/shares').send({ source: 'upload', id: ids.letter, days: 7 }).expect(400);
    await api('emp1', 'post', '/documents/shares').send({ source: 'letter', id: ids.letter, days: 365 }).expect(400);
    await request(server()).post('/api/v1/documents/shares').send({ source: 'letter', id: ids.letter, days: 7 }).expect(401);
  });

  it('a wrong or guessed token, or the right token under another company, opens nothing', async () => {
    const t = ids.letterPath.split('/').pop()!;
    await open(`/public/shares/${org.A.id}/${randomBytes(32).toString('base64url')}`).expect(404);
    await open(`/public/shares/${org.B.id}/${t}`).expect(404);
    await open(`/public/shares/not-a-company/${t}`).expect(404);
    await open(`/public/shares/${org.A.id}/${t.slice(0, 20)}`).expect(404);
    expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.documentShare.count())).toBe(0);
    await api('adminB', 'post', `/documents/shares/${ids.letterShare}/revoke`).expect(404);
  });

  it('"Stop sharing" closes the link at once; only the owner can stop it', async () => {
    await api('emp2', 'post', `/documents/shares/${ids.letterShare}/revoke`).expect(404);
    await open(ids.letterPath).expect(200);
    await api('emp1', 'post', `/documents/shares/${ids.letterShare}/revoke`).expect(200);
    await open(ids.letterPath).expect(404);
    await api('emp1', 'post', `/documents/shares/${ids.letterShare}/revoke`).expect(404);
    expect(((await api('emp1', 'get', '/documents/shares').expect(200)).body as { id: string }[]).map((x) => x.id)).not.toContain(ids.letterShare);
  });

  it('an expired link opens nothing; a superseded letter stops opening too', async () => {
    const id = (await inA((tx) => tx.documentShare.findFirstOrThrow({ where: { source: 'pay' } }))).id;
    await open(ids.payPath).expect(200);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.documentShare.update({ where: { id }, data: { createdAt: new Date(Date.now() - 2 * 86_400_000), expiresAt: new Date(Date.now() - 1000) } }));
    await open(ids.payPath).expect(404);
    const s = (await api('emp1', 'post', '/documents/shares').send({ source: 'letter', id: ids.letter, days: 30 }).expect(201)).body;
    await open(s.path).expect(200);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.letterIssue.update({ where: { id: ids.letter }, data: { status: 'superseded', supersededById: ids.letter2 } }));
    await open(s.path).expect(404);
  });
});
