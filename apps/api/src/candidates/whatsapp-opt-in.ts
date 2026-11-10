import { ConflictException } from '@nestjs/common';
import { AuditService, TenantContext } from '@exam-platform/shared';
import type { Tx } from '../org-structure/org-structure.service';

export type OptInSource = 'apply' | 'status_page' | 'unsubscribe';

/**
 * Answer 561: the candidate's own WhatsApp opt-in ("Message me on WhatsApp about jobs"), off until they tick it. Opting in
 * records the time and where, and clears an earlier WhatsApp opt-out (it is their newer choice); withdrawing clears the
 * opt-in. Only an opted-in candidate is in a WhatsApp campaign (HIR-20 audienceSkip). Audited each time it changes;
 * the same answer twice changes nothing. Opting in needs a mobile number on file.
 */
export async function setWhatsappOptIn(tx: Tx, ctx: TenantContext, candidateId: string, on: boolean, source: OptInSource): Promise<boolean> {
  const c = await tx.candidate.findUniqueOrThrow({ where: { id: candidateId }, select: { phone: true, whatsappOptedInAt: true } });
  if (on === Boolean(c.whatsappOptedInAt)) return on;
  if (on && !c.phone?.trim()) throw new ConflictException('Add a mobile number first: we have none to message on WhatsApp.');
  await tx.candidate.update({ where: { id: candidateId }, data: on ? { whatsappOptedInAt: new Date(), whatsappOptedOutAt: null, whatsappOptInSource: source } : { whatsappOptedInAt: null, whatsappOptInSource: source } });
  await AuditService.recordIn(tx, ctx, { actorUserId: null, action: on ? 'candidate.whatsapp.opted_in' : 'candidate.whatsapp.opted_out', entityType: 'candidate', entityId: candidateId, metadata: { source } });
  return on;
}
