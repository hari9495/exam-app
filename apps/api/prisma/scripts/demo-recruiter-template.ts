import { PrismaClient } from '@prisma/client';
import { ROLE_TEMPLATES } from '../../src/access/role-templates';
import { upgrade } from '../../src/access/template-sync.service';

// Demo Recruiter role (Kaveri Foods, demo-org; founder answer 796, 11 Nov 2026): demo-org's "Recruiter" role is a
// company role that does not follow the Recruiter template, so answer 452's key (ats.staffing.view) never reached it and
// hr-tester saw no staffing desk. Links the role to the template and gives it the keys the template has that it lacks,
// with the app's own rule (additions only; never a Confidential key to a role people hold). From then on the start-up
// sync keeps it in step until someone edits its keys. Audited as coming from this script. Safe to run again.
// Run from apps/api:
//   npx ts-node --transpile-only prisma/scripts/demo-recruiter-template.ts
const prisma = new PrismaClient();
const sorted = (keys: readonly string[]) => JSON.stringify([...new Set(keys)].sort());

(async () => {
  const log: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = (await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } })).id;
    await tx.$executeRaw`SELECT set_config('app.current_org', ${org}, true)`;
    const template = ROLE_TEMPLATES.find((t) => t.key === 'recruiter');
    if (!template) throw new Error('No Recruiter template.');
    const role = await tx.permissionProfile.findFirst({ where: { organizationId: org, name: 'Recruiter', archivedAt: null } });
    if (!role) throw new Error('demo-org has no "Recruiter" role.');
    const current = JSON.parse(role.permissionsJson) as string[];
    const u = upgrade(current, template.permissions, true);
    if (role.templateKey === template.key && !u.granted.length) return void log.push('Recruiter already follows the template, nothing to do');
    await tx.permissionProfile.update({ where: { id: role.id }, data: { permissionsJson: JSON.stringify(u.keys), templateKey: template.key, templateSet: sorted(u.keys), templateChecked: true } });
    await tx.$executeRaw`INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, metadata_json, created_at)
      VALUES (gen_random_uuid(), ${org}::uuid, 'access.role.template_linked', 'permission_profile', ${role.id}, ${JSON.stringify({ role: role.name, template: template.key, added: u.granted, notAddedConfidential: u.skipped, source: 'demo set-up script, founder answer 796, 11 Nov 2026' })}, now())`;
    log.push(`Recruiter now follows the Recruiter template; added: ${u.granted.join(', ') || 'nothing'}${u.skipped.length ? `; not added (Confidential): ${u.skipped.join(', ')}` : ''}`);
  });
  console.log(log.join('\n'));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e.message);
  await prisma.$disconnect();
  process.exit(1);
});
