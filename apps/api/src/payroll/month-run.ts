import { BadRequestException } from '@nestjs/common';
import { Tx } from '../org-structure/org-structure.service';
import { asDate, monthRange } from '../time/time-core';

const NIL = '00000000-0000-0000-0000-000000000000';

/**
 * The month as the regular run would pay it today (today's records, the rules in force for that month), for a what-if
 * calculation: arrears worksheets and the PAY-05 one-time pay effect. Nothing is saved.
 */
export async function monthRun(tx: Tx, org: string, em: { id: string; legalEntityId: string }, m: string, by: string) {
  const { from: ms, to: me } = monthRange(m);
  const member = await tx.payGroupMember.findFirst({
    where: { organizationId: org, employmentId: em.id, validFrom: { lte: asDate(me) }, OR: [{ validTo: null }, { validTo: { gte: asDate(ms) } }] },
    orderBy: { validFrom: 'desc' },
  });
  const group = member ? { id: member.payGroupId } : await tx.payGroup.findFirst({ where: { organizationId: org, legalEntityId: em.legalEntityId }, orderBy: { createdAt: 'asc' } });
  if (!group) throw new BadRequestException('The person is in no pay group.');
  return {
    id: NIL,
    organizationId: org,
    legalEntityId: em.legalEntityId,
    payGroupId: group.id,
    periodStart: asDate(ms),
    periodEnd: asDate(me),
    runType: 'regular',
    offcycleKind: null,
    status: 'draft',
    calcVersion: 0,
    wfRequestId: null,
    preparedBy: by,
    approvedBy: null,
    approvedAt: null,
    publishedAt: null,
    releaseAt: null,
    releaseReason: null,
    releaseNoticedAt: null,
    postedAt: null,
    totals: null,
    voidReason: null,
    reference: null,
    subPeriod: 0,
    rangeStart: null,
    version: 1,
    createdAt: new Date(),
  };
}
