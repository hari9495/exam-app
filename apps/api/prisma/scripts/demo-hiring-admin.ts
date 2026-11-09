import { PrismaClient } from '@prisma/client';
import { ROLE_TEMPLATES } from '../../src/access/role-templates';

// Demo access for walking Hiring as HR (Kaveri Foods, demo-org; founder 9 Nov 2026): the HR tester also gets the
// "Hiring admin" role from its template (headcount plans, jobs, recruiting costs), so Hiring can be tested as HR.
// Granted company-wide by one admin and approved by another, as demo-performance.ts does; the grant is audited.
// Adds only, never removes. Safe to run again. Run from apps/api:
//   npx ts-node --transpile-only prisma/scripts/demo-hiring-admin.ts
const prisma = new PrismaClient();

(async () => {
  const log: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = (await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } })).id;
    await tx.$executeRaw`SELECT set_config('app.current_org', ${org}, true)`;
    const o = { organizationId: org };
    const user = async (...emails: string[]) => {
      for (const email of emails) {
        const u = await tx.user.findFirst({ where: { ...o, email }, select: { id: true, email: true } });
        if (u) return u;
      }
      throw new Error(`None of ${emails.join(', ')} is in the demo company.`);
    };
    const hr = await user('hr-tester@demo-org.test');
    const admin = await user('admin-tester@demo-org.test', 'admin@demo-org.test');
    const approver = await user(...['admin2@demo-org.test', 'admin@demo-org.test'].filter((e) => e !== admin.email));

    const template = ROLE_TEMPLATES.find((t) => t.key === 'hiring_admin');
    if (!template) throw new Error('The hiring_admin role template is missing.');
    const role = template.name;
    let profile =
      (await tx.permissionProfile.findFirst({ where: { ...o, name: role } })) ??
      (await tx.permissionProfile.create({ data: { ...o, name: role, permissionsJson: JSON.stringify(template.permissions) } }));
    const have = JSON.parse(profile.permissionsJson) as string[];
    const missing = template.permissions.filter((k) => !have.includes(k));
    if (missing.length) {
      profile = await tx.permissionProfile.update({ where: { id: profile.id }, data: { permissionsJson: JSON.stringify([...have, ...missing].sort()) } });
      log.push(`${role}: added ${missing.join(', ')}`);
    }
    if (!(await tx.roleGrant.findFirst({ where: { ...o, userId: hr.id, permissionProfileId: profile.id, status: 'active' } }))) {
      const today = new Date().toISOString().slice(0, 10);
      const g = await tx.roleGrant.create({
        data: { ...o, userId: hr.id, permissionProfileId: profile.id, scopeType: 'tenant', validFrom: new Date(`${today}T00:00:00Z`), status: 'active', reason: 'Demo: test Hiring as HR (founder 9 Nov 2026)', grantedBy: admin.id, decidedBy: approver.id, decidedAt: new Date() },
      });
      const meta = JSON.stringify({ userId: hr.id, role, source: 'demo set-up script, founder 9 Nov 2026' });
      await tx.$executeRaw`INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (gen_random_uuid(), ${org}::uuid, 'access.grant.created', 'role_grant', ${g.id}, ${meta}, now())`;
      log.push(`${role} granted to ${hr.email}`);
    }
  });
  console.log(log.length ? log.join('\n') : 'Nothing to add: the demo access is already there.');
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
