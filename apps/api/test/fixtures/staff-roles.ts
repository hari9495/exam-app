import { PrismaClient } from '@prisma/client';

// Console staff roles (answers 1058, 1086): a staff account holds only the platform.* keys of its staff roles. Suites
// that create their own staff accounts give them roles here, as the database owner would on a new environment (the app
// itself changes roles only through a Security lead, see console-staff-roles.e2e-spec.ts).
export const ALL_STAFF_ROLES = ['support_agent', 'customer_success', 'rules_editor', 'finance', 'security_lead'] as const;
export type StaffRole = (typeof ALL_STAFF_ROLES)[number];

export async function giveStaffRoles(userId: string, roles: readonly StaffRole[] = ALL_STAFF_ROLES): Promise<void> {
  const owner = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
  try {
    await owner.$transaction([
      owner.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'on', true)`),
      owner.$executeRawUnsafe(`DELETE FROM platform_staff_roles WHERE user_id = $1::uuid`, userId),
      ...roles.map((r) => owner.$executeRawUnsafe(`INSERT INTO platform_staff_roles (user_id, role) VALUES ($1::uuid, $2)`, userId, r)),
    ]);
  } finally {
    await owner.$disconnect();
  }
}
