import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// "System Admin" is the user role org_admin (users.role is the one source of truth). Every path that takes it
// away (Roles & access, the staff-users page, deactivation) goes through this guard.

export const SYSTEM_ADMIN_ROLE = 'org_admin';

/**
 * Refuses to take away the company's last active System Admin. Takes a per-company transaction lock first, so
 * two admins removing each other at the same moment are serialised and the second one sees the first's change.
 */
export async function assertAnotherSystemAdmin(tx: Prisma.TransactionClient, organizationId: string, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`system-admins:${organizationId}`}))`;
  const others = await tx.user.count({ where: { organizationId, role: SYSTEM_ADMIN_ROLE, status: 'active', id: { not: userId } } });
  if (!others) {
    throw new ConflictException({ statusCode: 409, code: 'LAST_SYSTEM_ADMIN', message: 'This is the only System Admin. Make someone else a System Admin first.' });
  }
}
