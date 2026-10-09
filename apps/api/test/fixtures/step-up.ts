import { JwtService } from '@nestjs/jwt';
import { TenantPrismaService } from '@exam-platform/shared';

// Test shortcut for suites that are not about MFA but call step-up actions (P12 YX-IAM-02):
// marks the session behind `accessToken` as having just proven AAL2, exactly the state
// POST /auth/mfa/step-up leaves it in. mfa.e2e-spec.ts proves the real flow end to end.
export async function markSteppedUp(tenantPrisma: TenantPrismaService, accessToken: string): Promise<void> {
  const { sid } = new JwtService({}).decode(accessToken) as { sid: string };
  await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
    tx.session.update({ where: { id: sid }, data: { assuranceLevel: 'aal2', mfaVerifiedAt: new Date(), mfaMethod: 'totp' } }),
  );
}
