import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

// Local manual-test data for sign-in and access (README "Sign-in on your laptop"), fictional throughout:
//   - a second System Admin in the demo company, to approve Confidential role grants (two-admin rule);
//   - a second company, Ganga Textiles, with a minimal structure and its own admin;
//   - one outside consultant with an account in BOTH companies (same email, password and verified
//     mobile), so email-first, mobile and Google sign-in all show "Choose your company";
//   - two email domains on a (disabled) provider of the demo company: one verified, one lapsed.
// Idempotent: found by unique key / code, else created; the domain states are put back on every run.

type Tx = Prisma.TransactionClient;

export const CONSULTANT = { email: 'consultant@sharma-advisory.test', name: 'Nikhil Sharma', mobile: '+919845067890' };
const SIGN_IN_WAYS = { otpSignInChannels: ['email', 'sms'], googleSignIn: true, microsoftSignIn: true };

export async function seedSignInDemo(tx: Tx, demoOrgId: string, planId: string, hashes: { admin: string; staff: string }): Promise<void> {
  const user = (organizationId: string, email: string, name: string, role: string, passwordHash: string) =>
    tx.user.upsert({
      where: { organizationId_email: { organizationId, email } },
      update: {},
      create: { organizationId, email, name, role, passwordHash },
    });

  await user(demoOrgId, 'admin2@demo-org.test', 'Suresh Iyer', 'org_admin', hashes.admin);

  // ---- Ganga Textiles: one entity, one location, two departments ----
  const ganga = await tx.organization.upsert({ where: { slug: 'ganga-textiles' }, update: {}, create: { name: 'Ganga Textiles', slug: 'ganga-textiles', planId } });
  const org = { organizationId: ganga.id };
  const entity =
    (await tx.legalEntity.findFirst({ where: { ...org, isDefault: true } })) ??
    (await tx.legalEntity.create({
      data: { ...org, isDefault: true, name: 'Ganga Textiles Pvt Ltd', shortName: 'GTPL', registeredAddress: { lines: ['8 Mall Road'], city: 'Kanpur', state: 'IN-UP', postalCode: '208001', country: 'IN' } },
    }));
  if (!(await tx.location.findFirst({ where: { ...org, code: 'KNP-MILL' } }))) {
    await tx.location.create({
      data: { ...org, legalEntityId: entity.id, name: 'Kanpur mill', code: 'KNP-MILL', address: { lines: ['8 Mall Road'], city: 'Kanpur', state: 'IN-UP', postalCode: '208001', country: 'IN' }, country: 'IN', state: 'IN-UP', timezone: 'Asia/Kolkata' },
    });
  }
  for (const [name, code] of [['Weaving', 'WEAV'], ['People', 'PPL']]) {
    if (await tx.department.findFirst({ where: { ...org, code } })) continue;
    const id = randomUUID();
    await tx.department.create({ data: { ...org, id, name, code, path: `/${id}/` } });
  }
  await tx.tenantSecurityPolicy.upsert({ where: { organizationId: ganga.id }, update: SIGN_IN_WAYS, create: { ...org, ...SIGN_IN_WAYS } });
  await user(ganga.id, 'admin@ganga-textiles.test', 'Ganga Admin', 'org_admin', hashes.admin);

  // ---- the consultant in both companies ----
  for (const [organizationId, role] of [[demoOrgId, 'recruiter'], [ganga.id, 'panel']]) {
    await user(organizationId, CONSULTANT.email, CONSULTANT.name, role, hashes.staff);
    await tx.user.updateMany({ where: { organizationId, email: CONSULTANT.email, mobileVerifiedAt: null }, data: { mobileNumber: CONSULTANT.mobile, mobileVerifiedAt: new Date() } });
  }

  // ---- email domains (Settings › Security): one verified, one lapsed after repeated misses ----
  const demo = { organizationId: demoOrgId };
  const healthy = 'kaveri.test';
  const lapsed = 'kaverifoods-old.test';
  const provider =
    (await tx.identityProvider.findFirst({ where: { ...demo, name: 'Kaveri Foods Google Workspace' } })) ??
    (await tx.identityProvider.create({ data: { ...demo, type: 'oidc_google', name: 'Kaveri Foods Google Workspace', status: 'disabled', oidcIssuer: 'https://accounts.google.com' } }));
  const now = new Date();
  for (const domain of [healthy, lapsed]) {
    await tx.identityProviderDomain.upsert({ where: { organizationId_domain: { organizationId: demoOrgId, domain } }, update: {}, create: { ...demo, domain, identityProviderId: provider.id } });
    const state = domain === healthy ? { failedChecks: 0, lapsedAt: null } : { failedChecks: 3, lapsedAt: now } // 3 = domainRecheckMaxFailures() default;
    await tx.verifiedDomain.upsert({
      where: { organizationId_domain: { organizationId: demoOrgId, domain } },
      update: { ...state, lastCheckedAt: now },
      create: { ...demo, domain, verifiedAt: new Date('2026-09-01T00:00:00Z'), lastCheckedAt: now, ...state },
    });
  }
}
