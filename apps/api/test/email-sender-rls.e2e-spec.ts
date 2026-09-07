import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService, TenantPrismaService, PrismaModule, OrgSecretsCryptoService } from '@exam-platform/shared';
import { randomUUID } from 'crypto';
import { EmailService } from '../src/email/email.service';

// Regression test for a whole-branch-review finding: org_sender_addresses is under tenant RLS
// (this branch's `_rls` migration), but EmailService used to read the org's default sender with
// `this.prisma.orgSenderAddress.findFirst(...)` on the RAW PrismaService. The raw connection
// never sets app_current_org/app_is_super_admin in SESSION_CONTEXT, so the RLS predicate on
// org_sender_addresses returned ZERO rows for every org -- the default sender silently never
// applied (it failed "safe" to org.emailFromAddress, so nothing crashed and nothing looked
// wrong). Only a real database, with RLS actually enforced, can catch this -- a mocked
// `orgSenderAddress.findFirst` returns whatever the test tells it to regardless of session
// context, so it can't fail the way production did.
//
// Doesn't boot AppModule (mirrors tenant-isolation.e2e-spec.ts), so load ConfigModule directly
// so PrismaService sees DATABASE_URL from apps/api/.env.
describe('EmailService default-sender lookup under RLS', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let emailService: EmailService;
  let planId: string;
  let orgId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    emailService = new EmailService(prisma, new OrgSecretsCryptoService(), tenantPrisma);

    const plan = await prisma.plan.create({
      data: { name: `ci-sender-rls-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({
      data: {
        name: 'CI Sender RLS Org',
        slug: `ci-sender-rls-org-${randomUUID()}`,
        planId,
        // SMTP fields are on `organizations`, which is NOT under RLS -- set directly so
        // resolveTransporter() takes the org-SMTP branch (the only branch that reads a default
        // sender at all).
        smtpHost: 'smtp.customer.test',
        smtpPort: 587,
        smtpUser: 'org-mailbox@customer.test',
        smtpPasswordEncrypted: new OrgSecretsCryptoService().encrypt('irrelevant-password'),
        emailFromAddress: 'configured@customer.test',
      },
    });
    orgId = org.id;

    // org_sender_addresses IS under RLS -- must be written through forTenant.
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.orgSenderAddress.create({
        data: { organizationId: orgId, label: 'Careers', address: 'careers@ci-sender-rls.test', isDefault: true },
      }),
    );
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.orgSenderAddress.deleteMany({ where: { organizationId: orgId } }),
    );
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('resolves From to the org default sender by reading it through tenant-scoped RLS context', async () => {
    // Call the private resolveTransporter() directly rather than send(): send() would go on to
    // call transporter.sendMail() against the fake customer.test host, which is real network
    // I/O this test doesn't need and shouldn't depend on. resolveTransporter() is where the
    // RLS-scoped read actually happens, and its `fromAddress` is what the bug corrupted --
    // that's the exact thing this test needs to observe.
    const result = await (
      emailService as unknown as {
        resolveTransporter: (
          organizationId: string | undefined,
          fromAddressOverride?: string,
        ) => Promise<{ fromAddress: string }>;
      }
    ).resolveTransporter(orgId, undefined);

    expect(result.fromAddress).toBe('careers@ci-sender-rls.test');
  });

  it('still returns zero rows for the same lookup on the raw (non-tenant-scoped) client -- pinning why the bug happened', async () => {
    const rawResult = await prisma.orgSenderAddress.findFirst({
      where: { organizationId: orgId, isDefault: true },
      select: { address: true },
    });
    expect(rawResult).toBeNull();
  });
});
