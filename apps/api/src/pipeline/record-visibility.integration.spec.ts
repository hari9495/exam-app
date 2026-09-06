import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService, TenantPrismaService, PrismaModule } from '@exam-platform/shared';
import { randomUUID } from 'crypto';

// Real-DB RLS integration test (Task 5, harness decision: REAL-DB PATH).
//
// Why real DB, not mocks: pipeline.service.spec.ts mocks tenantPrisma.forTenant's tx entirely
// (hand-rolled `{ job: { create } }` objects) -- a mock can prove the service *calls* forTenant
// correctly, but cannot exercise the actual SQL Server security policy that T3 built. The repo
// DOES already have a real-DB integration harness for exactly this class of test:
// apps/api/test/tenant-isolation.e2e-spec.ts boots a bare `Test.createTestingModule` with
// `PrismaModule` (no AppModule, no HTTP layer) and drives `TenantPrismaService.forTenant` against
// the live dev SQL Server instance. This spec reuses that identical pattern -- no new harness is
// stood up, per the brief's "do not stand up a new DB test harness" constraint. It lives under
// src/pipeline (not test/) and is named `*.integration.spec.ts` specifically so the default
// `apps/api/jest.config.js` (testRegex `.*\.spec\.ts$`) picks it up under both `npx jest pipeline`
// and the full `npx jest` run, exactly as the task brief's Step 3/4 commands expect -- unlike the
// `.e2e-spec.ts` suites, which only run under the separate `npx jest --config test/jest-e2e.json`.
//
// This is the real predicate registered by 20260906140001_record_visibility_rls:
// dbo.fn_pipeline_entries_combined_predicate(organizationId, assignedUserId, assignedGroupId) =
//   fn_tenant_access_predicate(orgId)          -- tenant isolation, unchanged
//   AND fn_record_visibility_predicate(...)    -- new: passes when
//     app_is_super_admin = 1
//     OR app_record_visibility_governed = 0    (non-recruiter role, or no role at all)
//     OR the owning org has record_visibility_enabled = 0
//     OR assignedUserId = app_current_user
//     OR assignedGroupId is a group app_current_user belongs to
//     OR (assignedUserId IS NULL AND assignedGroupId IS NULL)   -- unassigned always visible
describe('Record-level visibility RLS (pipeline_entries)', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let r1Id: string;
  let r2Id: string;
  let adminId: string;
  let groupId: string;
  let jobId: string;
  let entryR1Id: string;
  let entryGId: string;
  let entryR2Id: string;
  let entryUnassignedId: string;
  let candidateIds: string[] = [];

  // No-principal / system context: an org is set (tenant isolation still applies) but no
  // userId/role -- forTenant computes isRecordVisibilityGoverned(undefined) = false, so
  // app_record_visibility_governed is set to 0. This is the shape a public-apply / background-job
  // caller has (see public-applications.service.ts), not "no context at all" (which would fail
  // tenant isolation itself, per tenant-isolation.e2e-spec.ts's "zero rows" case -- a different
  // predicate, not what this feature governs).
  const systemContext = () => ({ organizationId: orgId, isSuperAdmin: false });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: 'test-plan-rv', candidateLimit: 100, aiCreditLimit: 10, proctoringMinutesLimit: 100 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({
      data: { name: 'Record Visibility Org', slug: `rv-org-${randomUUID()}`, planId, recordVisibilityEnabled: true },
    });
    orgId = org.id;

    // Seed users, group, membership, job, candidates, entries all under a plain org-scoped
    // (non-governed) context -- writes go through the BLOCK predicate (tenant check only, per T3's
    // report: record-visibility only touches the FILTER predicate), so setup itself is unaffected
    // by which role/user is "current" during INSERT.
    await tenantPrisma.forTenant(systemContext(), async (tx) => {
      const r1 = await tx.user.create({ data: { organizationId: orgId, email: 'r1@rv.test', passwordHash: 'x', role: 'recruiter' } });
      r1Id = r1.id;
      const r2 = await tx.user.create({ data: { organizationId: orgId, email: 'r2@rv.test', passwordHash: 'x', role: 'recruiter' } });
      r2Id = r2.id;
      const admin = await tx.user.create({ data: { organizationId: orgId, email: 'admin@rv.test', passwordHash: 'x', role: 'org_admin' } });
      adminId = admin.id;

      const group = await tx.userGroup.create({ data: { organizationId: orgId, name: 'Group G' } });
      groupId = group.id;
      await tx.userGroupMember.create({ data: { organizationId: orgId, groupId, userId: r1Id } });

      const job = await tx.job.create({ data: { organizationId: orgId, title: 'RV Test Job', createdById: adminId } });
      jobId = job.id;

      const mkCandidate = (email: string, name: string) => tx.candidate.create({ data: { organizationId: orgId, email, name } });
      const [candR1, candG, candR2, candUnassigned] = await Promise.all([
        mkCandidate('cand-r1@rv.test', 'Candidate R1'),
        mkCandidate('cand-g@rv.test', 'Candidate G'),
        mkCandidate('cand-r2@rv.test', 'Candidate R2'),
        mkCandidate('cand-unassigned@rv.test', 'Candidate Unassigned'),
      ]);
      candidateIds = [candR1.id, candG.id, candR2.id, candUnassigned.id];

      const entryR1 = await tx.pipelineEntry.create({
        data: { organizationId: orgId, jobId, candidateId: candR1.id, enteredVia: 'manual', assignedUserId: r1Id },
      });
      entryR1Id = entryR1.id;
      const entryG = await tx.pipelineEntry.create({
        data: { organizationId: orgId, jobId, candidateId: candG.id, enteredVia: 'manual', assignedGroupId: groupId },
      });
      entryGId = entryG.id;
      const entryR2 = await tx.pipelineEntry.create({
        data: { organizationId: orgId, jobId, candidateId: candR2.id, enteredVia: 'manual', assignedUserId: r2Id },
      });
      entryR2Id = entryR2.id;
      const entryUnassigned = await tx.pipelineEntry.create({
        data: { organizationId: orgId, jobId, candidateId: candUnassigned.id, enteredVia: 'manual' },
      });
      entryUnassignedId = entryUnassigned.id;
    });
  });

  afterAll(async () => {
    // Reverse-dependency cleanup, all under a no-principal (governed=0) context so every row is
    // visible regardless of assignment -- mirrors tenant-isolation.e2e-spec.ts's cleanup pattern.
    await tenantPrisma.forTenant(systemContext(), async (tx) => {
      await tx.pipelineEntry.deleteMany({ where: { jobId } });
      await tx.candidate.deleteMany({ where: { id: { in: candidateIds } } });
      await tx.job.deleteMany({ where: { id: jobId } });
      await tx.userGroupMember.deleteMany({ where: { groupId } });
      await tx.userGroup.deleteMany({ where: { id: groupId } });
      await tx.user.deleteMany({ where: { id: { in: [r1Id, r2Id, adminId] } } });
    });
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.deleteMany({ where: { id: orgId } }));
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  const idsOf = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

  it('R1 (recruiter, direct assignment + group membership) sees E_r1, E_g, E_unassigned but not E_r2', async () => {
    const rows = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false, userId: r1Id, role: 'recruiter' }, (tx) =>
      tx.pipelineEntry.findMany({ where: { jobId } }),
    );
    expect(idsOf(rows)).toEqual(idsOf([{ id: entryR1Id }, { id: entryGId }, { id: entryUnassignedId }]));
  });

  it('R2 (recruiter, direct assignment only) sees E_r2, E_unassigned but not E_r1 or E_g', async () => {
    const rows = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false, userId: r2Id, role: 'recruiter' }, (tx) =>
      tx.pipelineEntry.findMany({ where: { jobId } }),
    );
    expect(idsOf(rows)).toEqual(idsOf([{ id: entryR2Id }, { id: entryUnassignedId }]));
  });

  it('org_admin (non-governed role) sees all four entries', async () => {
    const rows = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false, userId: adminId, role: 'org_admin' }, (tx) =>
      tx.pipelineEntry.findMany({ where: { jobId } }),
    );
    expect(rows).toHaveLength(4);
  });

  it('feature OFF: the same recruiter (R1) who was restricted above now sees all four', async () => {
    await prisma.organization.update({ where: { id: orgId }, data: { recordVisibilityEnabled: false } });
    try {
      const rows = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false, userId: r1Id, role: 'recruiter' }, (tx) =>
        tx.pipelineEntry.findMany({ where: { jobId } }),
      );
      expect(rows).toHaveLength(4);
    } finally {
      await prisma.organization.update({ where: { id: orgId }, data: { recordVisibilityEnabled: true } });
    }
  });

  it('system/no-principal context (no userId/role) sees all four regardless of assignment', async () => {
    const rows = await tenantPrisma.forTenant(systemContext(), (tx) => tx.pipelineEntry.findMany({ where: { jobId } }));
    expect(rows).toHaveLength(4);
  });

  it('public-apply-style INSERT under a no-principal context succeeds', async () => {
    const candidate = await tenantPrisma.forTenant(systemContext(), (tx) =>
      tx.candidate.create({ data: { organizationId: orgId, email: 'cand-public@rv.test', name: 'Candidate Public' } }),
    );
    candidateIds.push(candidate.id);

    const entry = await tenantPrisma.forTenant(systemContext(), (tx) =>
      tx.pipelineEntry.create({ data: { organizationId: orgId, jobId, candidateId: candidate.id, enteredVia: 'application' } }),
    );

    expect(entry.id).toBeDefined();
    const readBack = await tenantPrisma.forTenant(systemContext(), (tx) => tx.pipelineEntry.findUnique({ where: { id: entry.id } }));
    expect(readBack?.candidateId).toBe(candidate.id);
  });
});
