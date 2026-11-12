import { PrismaClient } from '@prisma/client';
import { AuditService, revokeStaffSessions } from '@exam-platform/shared';

// Test-app staff tidy (founder 12 Nov 2026, answer 1162): keep super@ and rules@ as the two Security leads, give rules@
// the Rules editor role, and deactivate the leftover staff accounts that early e2e runs made in this database (before
// e2e moved to examapp_org_e2e). Uses the app's own deactivate function, ends their sessions, audits every change as
// coming from this script with super@ as the actor. Safe to run again. Run from apps/api:
//   npx ts-node --transpile-only prisma/scripts/test-app-staff-tidy.ts
const prisma = new PrismaClient();
const KEEP = ['super@platform.test', 'rules@platform.test'];
const REASON = 'Test-app tidy, founder 12 Nov 2026 (answer 1162): leftover account from early automated test runs';
const PLATFORM = { organizationId: null, isSuperAdmin: true };

(async () => {
  const log: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const staff = await tx.user.findMany({ where: { organizationId: null, role: 'super_admin' }, select: { id: true, email: true, status: true } });
    const actor = staff.find((s) => s.email === 'super@platform.test');
    const rules = staff.find((s) => s.email === 'rules@platform.test');
    if (!actor || !rules) throw new Error('super@ or rules@ is missing; nothing changed.');
    // Through the app's own function (role rows are not writable directly); it returns the roles held before.
    const want = ['rules_editor', 'security_lead'];
    const [{ before }] = await tx.$queryRaw<{ before: string[] }[]>`SELECT platform_set_staff_roles(${rules.id}::uuid, ${want}::text[], ${actor.id}::uuid) AS before`;
    if (!before.includes('rules_editor')) {
      await AuditService.recordIn(tx as never, PLATFORM, { actorUserId: actor.id, action: 'platform.staff.roles_changed', entityType: 'user', entityId: rules.id, metadata: { before, after: want, reason: 'Test-app tidy, founder 12 Nov 2026 (answer 1162)', source: 'test-app staff tidy script' } });
      log.push('rules@: Rules editor added (still a Security lead)');
    }
    for (const s of staff.filter((x) => !KEEP.includes(x.email) && x.status === 'active')) {
      await tx.$executeRaw`SELECT platform_deactivate_staff(${s.id}::uuid, ${actor.id}::uuid)`;
      const sessions = await revokeStaffSessions(tx as never, { userId: s.id }, 'deactivated');
      await tx.refreshToken.updateMany({ where: { userId: s.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await AuditService.recordIn(tx as never, PLATFORM, { actorUserId: actor.id, action: 'platform.staff.deactivated', entityType: 'user', entityId: s.id, metadata: { reason: REASON, sessionsEnded: sessions, source: 'test-app staff tidy script' } });
      log.push(`deactivated ${s.email}`);
    }
  });
  console.log(log.length ? log.join('\n') : 'nothing to do');
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
