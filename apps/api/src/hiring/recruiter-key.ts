import { BadRequestException } from '@nestjs/common';
import { PrismaService, TenantPrismaService, resolvePermissionGrants } from '@exam-platform/shared';

/**
 * Founder answer 348: the default recruiter for new requisitions must hold the recruiter key, the key recruiting works
 * with (jobs, the board, offers to send). `pipeline:manage` is the older key; the Recruiter template's `ats.job.manage`
 * or `ats.candidate.manage`, held for the whole company, stand in for it (LEGACY_ALIASES), and a System Admin holds it.
 */
export const RECRUITER_KEY = 'pipeline:manage';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Person = { id: string; role: string; permissionProfileId: string | null };

/** The people (active users of the company) who hold the recruiter key today, resolved exactly as the guard resolves it. */
export async function recruiterKeyHolders<P extends Person>(prisma: PrismaService, tenantPrisma: TenantPrismaService, org: string, people: P[]): Promise<P[]> {
  // shortcut: one grant lookup per active person, in batches of 10 (fine to a few hundred people); move to one SQL over
  // profiles and role grants when a company has thousands.
  const out: P[] = [];
  for (let i = 0; i < people.length; i += 10) {
    const batch = people.slice(i, i + 10);
    const held = await Promise.all(batch.map(async (u) => (await resolvePermissionGrants(prisma, tenantPrisma, { role: u.role, organizationId: org, permissionProfileId: u.permissionProfileId, userId: u.id }, [RECRUITER_KEY])).has(RECRUITER_KEY)));
    out.push(...batch.filter((_, k) => held[k]));
  }
  return out;
}

/** True when `userId` is an active user of the company who holds the recruiter key. */
export async function isRecruiter(prisma: PrismaService, tenantPrisma: TenantPrismaService, org: string, userId: string): Promise<boolean> {
  if (!UUID.test(userId)) return false;
  const u = await tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => tx.user.findFirst({ where: { organizationId: org, id: userId, status: 'active' }, select: { id: true, role: true, permissionProfileId: true } }));
  return Boolean(u && (await recruiterKeyHolders(prisma, tenantPrisma, org, [u])).length);
}

/** Refuses (400) anyone but none or an active person of the company with the recruiter key; another company's person reads the same. */
export async function assertDefaultRecruiter(prisma: PrismaService, tenantPrisma: TenantPrismaService, org: string, value: string): Promise<void> {
  if (value !== 'none' && !(await isRecruiter(prisma, tenantPrisma, org, value)))
    throw new BadRequestException('Choose someone who holds the recruiter key. They must be an active person of your company; choose from the list.');
}
