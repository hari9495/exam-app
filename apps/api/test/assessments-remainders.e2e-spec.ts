import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp } from './dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';

// Assessments remainders (answers 2241, 2285, 2286, 2287), end to end against the real database (forced RLS, the app
// role): each with the right role, the wrong role refused, another company seeing nothing and bad input saving nothing.
describe('Assessments remainders', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const run = randomUUID().slice(0, 8);
  const PASSWORD = 'Corr3ct-Horse-Battery';
  type Who = 'adminA' | 'adminB' | 'writer' | 'reader';
  const token = {} as Record<Who, string>;
  const users = {} as Record<Who, string>;
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(http)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inOrg = <T>(o: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const SUPER = { organizationId: null, isSuperAdmin: true };

  beforeAll(async () => {
    app = await bootAdminApp();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `rem-plan-${run}`, candidateLimit: 50, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const o = await prisma.organization.create({ data: { name: `REM ${k}`, slug: `rem-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: o.id, slug: o.slug };
    }
    const hash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['writer', 'A', 'panel', ['asmt.test.manage']],
      ['reader', 'A', 'panel', ['asmt.results.view']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k];
      const permissionProfileId = keys ? (await inOrg(o.id, (tx) => tx.permissionProfile.create({ data: { organizationId: o.id, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(o.id, (tx) => tx.user.create({ data: { organizationId: o.id, email: `${who}-${run}@rem.test`, name: `${who} ${run}`, passwordHash: hash, role, permissionProfileId } }))).id;
      token[who] = (await request(http).post('/api/v1/auth/staff/login').send({ organizationSlug: o.slug, email: `${who}-${run}@rem.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        for (const o of [org.A.id, org.B.id]) {
          await tx.asmtInstitution.deleteMany({ where: { organizationId: o } });
          await tx.exam.deleteMany({ where: { organizationId: o } });
          await tx.question.deleteMany({ where: { organizationId: o } });
          await tx.tag.deleteMany({ where: { organizationId: o } });
        }
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: all } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('2241 import institutions from CSV', () => {
    const CSV = ['name,code,city,coordinator_name,coordinator_email,results', 'Coromandel Institute,CIT-14,Chennai,Dr. Latha,latha@cit.test,each', 'Kongu Valley College,KVEC-22,,,,', 'Copy of CIT,cit-14,,,,', 'X,,,,,', 'Bad Mail College,BMC-1,,,not-an-email,', 'Odd Results College,ORC-1,,,,maybe'].join('\n');
    const codes = async (o: string) => (await inOrg(o, (tx) => tx.asmtInstitution.findMany({ where: { organizationId: o }, select: { code: true } }))).map((r) => r.code).sort();

    it('checks every row without saving; commit adds only the good rows, audited', async () => {
      const check = (await api('adminA', 'post', '/asmt/institutions/import').send({ csv: CSV, commit: false }).expect(200)).body as { rows: { line: number; ok: boolean; problem: string | null }[]; added: number };
      expect(check.added).toBe(0);
      expect(check.rows.map((r) => r.ok)).toEqual([true, true, false, false, false, false]);
      expect(check.rows[2]!.problem).toMatch(/already in the list/);
      expect(check.rows[4]!.problem).toMatch(/Not an email/);
      expect(await codes(org.A.id)).toEqual([]);
      const done = (await api('adminA', 'post', '/asmt/institutions/import').send({ csv: CSV, commit: true }).expect(200)).body as { added: number };
      expect(done.added).toBe(2);
      const rows = (await api('adminA', 'get', '/asmt/institutions').expect(200)).body as { code: string; resultsVisibility: string; coordinatorEmail: string | null }[];
      expect(rows.map((r) => [r.code, r.resultsVisibility, r.coordinatorEmail])).toEqual([
        ['CIT-14', 'per_candidate', 'latha@cit.test'],
        ['KVEC-22', 'aggregate', null],
      ]);
      const audit = await inOrg(org.A.id, (tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'institution.imported' } }));
      expect(audit?.actorUserId).toBe(users.adminA);
      // Importing the same file again adds nothing: the codes are now taken.
      expect(((await api('adminA', 'post', '/asmt/institutions/import').send({ csv: CSV, commit: true }).expect(200)).body as { added: number }).added).toBe(0);
    });

    it('negative: bad files are a 400 with nothing saved; the wrong role is refused; another company sees nothing', async () => {
      await api('adminB', 'post', '/asmt/institutions/import').send({ csv: 'name,code\n', commit: true }).expect(400);
      await api('adminB', 'post', '/asmt/institutions/import').send({ csv: 'name,campus\nA,B', commit: true }).expect(400);
      await api('adminB', 'post', '/asmt/institutions/import').send({ csv: 'city\nChennai', commit: true }).expect(400);
      await api('adminB', 'post', '/asmt/institutions/import').send({ csv: '', commit: true }).expect(400);
      await api('adminB', 'post', '/asmt/institutions/import').send({ csv: 'name,code\nA,B' }).expect(400);
      await api('adminB', 'post', '/asmt/institutions/import').send({ csv: ['name,code', ...Array.from({ length: 501 }, (_, i) => `College ${i},C-${i}`)].join('\n'), commit: true }).expect(400);
      expect(await codes(org.B.id)).toEqual([]);
      await api('reader', 'post', '/asmt/institutions/import').send({ csv: CSV, commit: true }).expect(403);
      await api('writer', 'post', '/asmt/institutions/import').send({ csv: CSV, commit: true }).expect(403);
      // Company B may use the same codes: they are per company, and B still sees none of A's.
      expect(((await api('adminB', 'post', '/asmt/institutions/import').send({ csv: 'name,code\nB College,CIT-14', commit: true }).expect(200)).body as { added: number }).added).toBe(1);
      expect(((await api('adminB', 'get', '/asmt/institutions').expect(200)).body as { code: string }[]).map((r) => r.code)).toEqual(['CIT-14']);
      expect(await codes(org.A.id)).toEqual(['CIT-14', 'KVEC-22']);
    });
  });
});
