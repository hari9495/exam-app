import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { markSteppedUp } from './fixtures/step-up';
import { giveStaffRoles } from './fixtures/staff-roles';
import { PublicApplicationsThrottlerGuard } from '../src/public-applications/public-applications.throttler.guard';

// Security review 25 Nov 2026 (docs/yukthix/reviews/security-review-2026-11-25.md). Every test here states the SAFE
// behaviour and FAILS on test/yukthix-main as of 24c509c1a: each failure is a finding. When a fix lands, its test passes.

describe('Security review 2026-11-25: proofs', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'recruiterA' | 'panelA' | 'auditorA' | 'adminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  let staffId: string;
  let staffToken: string;
  const api = (who: Who, method: 'get' | 'post' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inOrg = <T>(k: 'A' | 'B', fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, fn);

  beforeAll(async () => {
    app = await bootAdminApp();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `secrev-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `SecRev Org ${k}`, slug: `secrev-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string][] = [
      ['adminA', 'A', 'org_admin'],
      ['recruiterA', 'A', 'recruiter'],
      ['panelA', 'A', 'panel'],
      ['auditorA', 'A', 'auditor'],
      ['adminB', 'B', 'org_admin'],
    ];
    for (const [who, k, role] of roster) {
      users[who] = (await inOrg(k, (tx) => tx.user.create({ data: { organizationId: org[k].id, email: `${who}@secrev-${run}.test`, name: `${who} ${run}`, passwordHash, role } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@secrev-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }

    // A YukthiX staff member with the Finance staff role only (no support role), signed in with the security key proven.
    staffId = (
      await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.user.create({ data: { email: `staff-${run}@platform.test`, passwordHash, role: 'super_admin', organizationId: null } }),
      )
    ).id;
    await giveStaffRoles(staffId, ['finance']);
    staffToken = (await request(server()).post('/api/v1/auth/platform/login').send({ email: `staff-${run}@platform.test`, password: PASSWORD }).expect(200)).body.accessToken;
    await markSteppedUp(tenantPrisma, staffToken);
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
      await tx.user.deleteMany({ where: { id: staffId } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  // ---------------------------------------------------------------- F1 (High): staff impersonation skips the support session

  describe('F1: YukthiX staff acting as a company user without an approved support session', () => {
    let impersonationToken: string | undefined;

    it('staff cannot impersonate a company System Admin when the company approved no support session', async () => {
      const res = await request(server()).post(`/api/v1/auth/impersonate/${users.adminB}`).set('Authorization', `Bearer ${staffToken}`);
      impersonationToken = res.body?.accessToken;
      expect(res.status).toBe(403);
    });

    it('an impersonation token minted that way cannot list the company users', async () => {
      const res = await request(server()).get('/api/v1/users').set('Authorization', `Bearer ${impersonationToken}`);
      expect(res.status).not.toBe(200);
    });
  });

  // ---------------------------------------------------------------- F3 (Medium): approval request detail is open to anyone

  describe('F3/F4: recruiting approvals (requisition and offer gate)', () => {
    let requestId: string;
    let jobId: string;

    beforeAll(async () => {
      await inOrg('A', async (tx) => {
        jobId = (await tx.job.create({ data: { organizationId: org.A.id, title: `Secret hire ${run}`, createdById: users.recruiterA, status: 'pending_approval' } })).id;
        // The submitter is also the approver of the only step (a "users" step, or the job's hiring manager).
        const steps = [{ position: 0, name: 'Hiring manager', approverType: 'users', approverUserIds: [users.recruiterA] }];
        requestId = (
          await tx.approvalRequest.create({
            data: { organizationId: org.A.id, gate: 'requisition', subjectType: 'job', subjectId: jobId, currentStepPosition: 0, submittedByUserId: users.recruiterA, chainSnapshotJson: JSON.stringify(steps) },
          })
        ).id;
      });
    });

    it('F3: a panel user who is neither submitter nor approver cannot read the request (offer pay, chain, notes)', async () => {
      const res = await api('panelA', 'get', `/approvals/requests/${requestId}`);
      expect([403, 404]).toContain(res.status);
    });

    it('F4: the submitter cannot approve their own request', async () => {
      const res = await api('recruiterA', 'post', `/approvals/requests/${requestId}/decide`).send({ decision: 'approved' });
      expect(res.status).toBe(403);
    });

    it('F3/F4: the submitter and an approver on the chain read it, and that approver approves (positive)', async () => {
      const other = await inOrg('A', async (tx) => {
        const job = await tx.job.create({ data: { organizationId: org.A.id, title: `Second hire ${run}`, createdById: users.recruiterA, status: 'pending_approval' } });
        const steps = [{ position: 0, name: 'Panel lead', approverType: 'users', approverUserIds: [users.panelA] }];
        return (await tx.approvalRequest.create({ data: { organizationId: org.A.id, gate: 'requisition', subjectType: 'job', subjectId: job.id, currentStepPosition: 0, submittedByUserId: users.recruiterA, chainSnapshotJson: JSON.stringify(steps) } })).id;
      });
      await api('recruiterA', 'get', `/approvals/requests/${other}`).expect(200);
      await api('panelA', 'get', `/approvals/requests/${other}`).expect(200);
      await api('adminB', 'get', `/approvals/requests/${other}`).expect(404);
      await api('panelA', 'get', '/approvals/requests/not-a-uuid').expect(400);
      expect((await api('panelA', 'post', `/approvals/requests/${other}/decide`).send({ decision: 'approved' }).expect(201)).body).toBeDefined();
    });
  });

  // ---------------------------------------------------------------- F5 (Medium): read-only Auditor reassigns candidates

  describe('F5: write routes behind the read key results:view', () => {
    let entryId: string;

    beforeAll(async () => {
      await inOrg('A', async (tx) => {
        const job = await tx.job.create({ data: { organizationId: org.A.id, title: `Open role ${run}`, createdById: users.recruiterA } });
        const cand = await tx.candidate.create({ data: { organizationId: org.A.id, email: `cand-${run}@secrev.test`, name: 'Asha Candidate' } });
        entryId = (await tx.pipelineEntry.create({ data: { organizationId: org.A.id, jobId: job.id, candidateId: cand.id, enteredVia: 'manual', assignedUserId: users.recruiterA } })).id;
      });
    });

    it('the read-only Auditor cannot take over a candidate (PATCH /entries/:id/assignment)', async () => {
      const res = await api('auditorA', 'patch', `/entries/${entryId}/assignment`).send({ assigneeUserId: users.auditorA });
      expect(res.status).toBe(403);
    });

    it('the read-only Auditor cannot rate a candidate (POST /entries/:id/feedback)', async () => {
      const res = await api('auditorA', 'post', `/entries/${entryId}/feedback`).send({ rating: 1, note: 'Weak' });
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------- F7 (Medium): one public throttle bucket for every caller

  describe('F7: public careers/feed throttle key', () => {
    it('two different visitors of a careers page do not share one rate-limit bucket', async () => {
      const guard = Object.create(PublicApplicationsThrottlerGuard.prototype) as { getTracker(req: Record<string, unknown>): Promise<string> };
      const visitor = (ip: string, orgSlug: string) => ({ ip, params: { orgSlug }, route: { path: '/api/v1/public/careers/:orgSlug' } });
      const attacker = await guard.getTracker(visitor('203.0.113.9', 'no-such-company'));
      const candidate = await guard.getTracker(visitor('198.51.100.7', 'demo-org'));
      expect(attacker).not.toBe(candidate);
    });
  });

  // ---------------------------------------------------------------- F2 (Medium): audit rows name the real actor

  describe('F2: an action taken while impersonating names the real actor in the audit log', () => {
    let entryId: string;
    beforeAll(async () => {
      await inOrg('A', async (tx) => {
        const job = await tx.job.create({ data: { organizationId: org.A.id, title: `Audit role ${run}`, createdById: users.recruiterA } });
        const cand = await tx.candidate.create({ data: { organizationId: org.A.id, email: `audit-${run}@secrev.test`, name: 'Ravi Candidate' } });
        entryId = (await tx.pipelineEntry.create({ data: { organizationId: org.A.id, jobId: job.id, candidateId: cand.id, enteredVia: 'manual', assignedUserId: users.recruiterA } })).id;
      });
    });
    const rows = () => inOrg('A', (tx) => tx.auditLog.findMany({ where: { action: 'feedback.added', entityId: entryId }, orderBy: { createdAt: 'asc' } }));

    it('the org admin acting as the recruiter is named beside the recruiter (positive)', async () => {
      const acting = (await api('adminA', 'post', `/auth/impersonate/${users.recruiterA}`).expect(200)).body.accessToken as string;
      await request(server()).post(`/api/v1/entries/${entryId}/feedback`).set('Authorization', `Bearer ${acting}`).send({ rating: 4, note: 'Good' }).expect(201);
      const [row] = await rows();
      expect(row.actorUserId).toBe(users.recruiterA);
      expect(JSON.parse(row.metadataJson!)).toMatchObject({ impersonatorUserId: users.adminA });
    });

    it('the recruiter acting for themselves gets no impersonator on the row (negative)', async () => {
      await api('recruiterA', 'post', `/entries/${entryId}/feedback`).send({ rating: 3, note: 'Fine' }).expect(201);
      const all = await rows();
      expect(JSON.parse(all[all.length - 1].metadataJson!)).not.toHaveProperty('impersonatorUserId');
    });
  });
});
