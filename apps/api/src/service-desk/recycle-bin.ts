import { Prisma } from '@prisma/client';
import { Tx } from '../org-structure/org-structure.service';
import { DeskActor } from './desk-access';

/**
 * US-G-218: a deleted saved view or email rule is kept in the recycle bin as it was (restorable until purge_after, then
 * removed by the nightly purge, audited). Articles are only marked deleted (KbService.remove).
 */
export async function toBin(tx: Tx, a: { ctx: DeskActor['ctx']; userId: string }, kind: 'view' | 'email_rule', row: { id: string } & Record<string, unknown>, label: string, deskId: string | null) {
  const days = (await tx.sdPrivacySettings.findUnique({ where: { organizationId: a.ctx.organizationId } }))?.binDays ?? 30;
  await tx.sdRecycleBin.create({
    data: { organizationId: a.ctx.organizationId, kind, entityId: row.id, deskId, label: label.slice(0, 200), data: JSON.parse(JSON.stringify(row)) as Prisma.InputJsonValue, deletedBy: a.userId, purgeAfter: new Date(Date.now() + days * 86_400_000) },
  });
}
