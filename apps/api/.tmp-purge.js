const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const sup = async (fn) => p.$transaction(async (tx) => { await tx.$executeRawUnsafe(`SELECT set_config('app.is_super_admin','on',true)`); return fn(tx); }, { timeout: 120000 });
(async () => {
  const run = Math.random().toString(16).slice(2, 10);
  const plan = await p.plan.create({ data: { name: `purge-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } });
  const org = await p.organization.create({ data: { name: `Purge ${run}`, slug: `purge-${run}`, planId: plan.id } });
  await sup(async (tx) => {
    await tx.legalEntity.create({ data: { organizationId: org.id, name: 'Throwaway Ltd', shortName: 'TWL', isDefault: true } });
    await tx.user.create({ data: { organizationId: org.id, email: `x-${run}@purge.test`, name: 'X', passwordHash: 'x', role: 'org_admin' } });
    await tx.setting.create({ data: { organizationId: org.id, scopeType: 'tenant', scopeId: org.id, key: 'leave.send_back', value: 'on' } });
    await tx.organization.update({ where: { id: org.id }, data: { lifecycle: 'closed' } });
  });
  try {
    const r = await sup((tx) => tx.$queryRawUnsafe(`SELECT purge_company($1::uuid) AS c`, org.id));
    console.log('OK', JSON.stringify(r[0].c));
    console.log('org left?', await p.organization.count({ where: { id: org.id } }));
  } catch (e) { console.log('ERR', e.message.slice(0, 1500)); }
  await p.plan.delete({ where: { id: plan.id } }).catch(() => undefined);
  await p.$disconnect();
})();
