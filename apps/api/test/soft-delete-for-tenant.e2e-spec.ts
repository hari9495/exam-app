import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { PrismaModule } from '@exam-platform/shared';
import { randomUUID } from 'crypto';

// Proves the Task 3 wiring end to end against a real DB: `TenantPrismaService.forTenant` now
// runs through the soft-delete-filtered client (soft-delete.extension.ts), so a soft-deleted
// Candidate is invisible to `findUnique` inside it -- while staying correctly tenant-scoped, on
// the same tx/SESSION_CONTEXT as any other forTenant query, for a non-deleted row -- and the
// SAME findUnique via `forTenantIncludingDeleted` (raw client, no filter) still sees it. Harness
// pattern copied from tenant-isolation.e2e-spec.ts (same real DB, same PrismaModule bootstrap)
// -- deliberately not a new harness.
describe('TenantPrismaService soft-delete filtering (real DB)', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let liveCandidateId: string;
  let deletedCandidateId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: 'test-plan-soft-delete', candidateLimit: 100, aiCreditLimit: 10, proctoringMinutesLimit: 100 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({
      data: { name: 'Org Soft Delete', slug: `org-soft-delete-${randomUUID()}`, planId },
    });
    orgId = org.id;

    const context = { organizationId: orgId, isSuperAdmin: false };

    const live = await tenantPrisma.forTenant(context, (tx) =>
      tx.candidate.create({ data: { organizationId: orgId, email: 'live@candidate.test', name: 'Live Candidate' } }),
    );
    liveCandidateId = live.id;

    const deleted = await tenantPrisma.forTenant(context, (tx) =>
      tx.candidate.create({ data: { organizationId: orgId, email: 'deleted@candidate.test', name: 'Deleted Candidate' } }),
    );
    deletedCandidateId = deleted.id;

    // Soft-delete it via the raw client -- `update` is untouched by the extension's write path
    // (Tasks 4-6 own the real soft-delete write endpoint); this just needs `deletedAt` set so
    // the read-side filter has something to prove itself against.
    await tenantPrisma.forTenantIncludingDeleted(context, (tx) =>
      tx.candidate.update({ where: { id: deletedCandidateId }, data: { deletedAt: new Date() } }),
    );
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.candidate.deleteMany({ where: { organizationId: orgId } }),
    );
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.organization.delete({ where: { id: orgId } }),
    );
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  const context = () => ({ organizationId: orgId, isSuperAdmin: false });

  it('forTenant: findUnique on a non-deleted candidate returns the row, correctly tenant-scoped', async () => {
    const result = await tenantPrisma.forTenant(context(), (tx) => tx.candidate.findUnique({ where: { id: liveCandidateId } }));

    expect(result).not.toBeNull();
    expect(result?.id).toBe(liveCandidateId);
    expect(result?.organizationId).toBe(orgId);
  });

  // The previous test proves forTenant's tenant scoping still works for findUnique (a real row
  // comes back). This one proves the soft-delete filter is what's hiding the deleted row, not
  // some tenant-scoping regression -- both hit the same tx/SESSION_CONTEXT, only one is filtered.
  it('forTenant: findUnique on a soft-deleted candidate returns null (filtered, not merely tenant-invisible)', async () => {
    const result = await tenantPrisma.forTenant(context(), (tx) => tx.candidate.findUnique({ where: { id: deletedCandidateId } }));

    expect(result).toBeNull();
  });

  it('forTenant: findUniqueOrThrow on a soft-deleted candidate throws not-found', async () => {
    await expect(tenantPrisma.forTenant(context(), (tx) => tx.candidate.findUniqueOrThrow({ where: { id: deletedCandidateId } }))).rejects.toThrow();
  });

  it('forTenantIncludingDeleted: the SAME findUnique on the soft-deleted candidate returns the row', async () => {
    const result = await tenantPrisma.forTenantIncludingDeleted(context(), (tx) => tx.candidate.findUnique({ where: { id: deletedCandidateId } }));

    expect(result).not.toBeNull();
    expect(result?.id).toBe(deletedCandidateId);
    expect(result?.deletedAt).not.toBeNull();
  });

  // Fix round: candidate.upsert (public apply + pipeline addEntry "new candidate" paths) is
  // native Prisma, unfiltered by the $extends soft-delete hook -- so its `where` unique
  // (organizationId_email) still matches a soft-deleted row even though the preceding
  // `findUnique` reported "not found". Before the fix, the `update` branch never touched
  // deletedAt, so the row silently gained new activity while staying hidden. The fix adds
  // `deletedAt: null, deletedByUserId: null` to both call sites' `update` payload. This
  // reproduces the exact mechanism against the real DB: an upsert with that payload against a
  // soft-deleted row must (a) match the existing row (not create a new one), (b) clear
  // deletedAt, and (c) land its new data where a normal forTenant read can see it.
  it('upsert fix: an update payload with deletedAt/deletedByUserId: null resurrects a soft-deleted candidate matched via the org+email unique', async () => {
    const email = `resurrect-${randomUUID()}@candidate.test`;

    const created = await tenantPrisma.forTenant(context(), (tx) =>
      tx.candidate.create({ data: { organizationId: orgId, email, name: 'Before Resurrect' } }),
    );

    await tenantPrisma.forTenantIncludingDeleted(context(), (tx) =>
      tx.candidate.update({ where: { id: created.id }, data: { deletedAt: new Date() } }),
    );

    // Sanity: soft-deleted, same as the fixture candidate above.
    expect(await tenantPrisma.forTenant(context(), (tx) => tx.candidate.findUnique({ where: { id: created.id } }))).toBeNull();

    // The fixed upsert shape (mirrors public-applications.service.ts and pipeline.service.ts).
    const resurrected = await tenantPrisma.forTenant(context(), (tx) =>
      tx.candidate.upsert({
        where: { organizationId_email: { organizationId: orgId, email } },
        create: { organizationId: orgId, email, name: 'Should Not Be Created' },
        update: { name: 'New Application Attached', deletedAt: null, deletedByUserId: null },
      }),
    );

    expect(resurrected.id).toBe(created.id); // matched the existing (soft-deleted) row, not a fresh create
    expect(resurrected.deletedAt).toBeNull();

    const visibleAfter = await tenantPrisma.forTenant(context(), (tx) => tx.candidate.findUnique({ where: { id: created.id } }));
    expect(visibleAfter).not.toBeNull();
    expect(visibleAfter?.deletedAt).toBeNull();
    expect(visibleAfter?.name).toBe('New Application Attached');

    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.candidate.deleteMany({ where: { id: created.id } }));
  });
});
