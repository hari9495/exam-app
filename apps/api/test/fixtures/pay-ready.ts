import { TenantPrismaService } from '@exam-platform/shared';

/**
 * Batch H A2: a run is approved only when the entity has its TAN and PAN and a PT registration in each state where its
 * people work that charges PT. Test entities get those here (made-up numbers), for every state they have a place in now.
 */
export async function payReady(tenantPrisma: TenantPrismaService, organizationId: string, legalEntityId: string) {
  await tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${legalEntityId}}`}, true)`;
    const e = await tx.legalEntity.findFirstOrThrow({ where: { organizationId, id: legalEntityId }, select: { tan: true, pan: true } });
    await tx.legalEntity.update({ where: { id: legalEntityId }, data: { tan: e.tan ?? 'BLRT00000T', pan: e.pan ?? 'AAACT0000T' } });
    const states = [...new Set((await tx.location.findMany({ where: { organizationId, legalEntityId }, select: { state: true } })).map((l) => l.state))];
    for (const state of states) {
      const old = await tx.statutoryRegistration.findFirst({ where: { organizationId, legalEntityId, statute: 'IN.PT', state } });
      if (!old) await tx.statutoryRegistration.create({ data: { organizationId, legalEntityId, statute: 'IN.PT', state, status: 'on', registrationNo: 'PT-TEST-1', startOn: new Date('2020-04-01T00:00:00Z'), responsiblePerson: 'Test Director', responsibleDesignation: 'Director' } });
    }
  });
}
