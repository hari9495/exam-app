import { ConflictException } from '@nestjs/common';
import type { Tx } from '../org-structure/org-structure.service';

/**
 * HIR-10 / founder answer 364: a background check marked "must be clear before confirmation" blocks confirming the
 * probation until it is clear, cancelled, or a discrepancy a person decided to proceed with (founder decision 3), the
 * same rule as "must be clear before joining" at joining. The checks belong to the joining that started this employment.
 */
export async function openConfirmationChecks(tx: Tx, org: string, employmentId: string): Promise<number> {
  const joinings = await tx.preboarding.findMany({ where: { organizationId: org, employmentId }, select: { id: true } });
  if (!joinings.length) return 0;
  return tx.bgvCheck.count({ where: { organizationId: org, preboardingId: { in: joinings.map((p) => p.id) }, gate: 'before_confirmation', status: { notIn: ['clear', 'cancelled'] }, NOT: { status: 'discrepancy', decision: 'proceed' } } });
}

export const BGV_BEFORE_CONFIRMATION = 'BGV_NOT_CLEAR_FOR_CONFIRMATION';

/** 409 with a clear code while such a check is open. */
export async function assertClearForConfirmation(tx: Tx, org: string, employmentId: string): Promise<void> {
  const open = await openConfirmationChecks(tx, org, employmentId);
  if (open)
    throw new ConflictException({
      statusCode: 409,
      code: BGV_BEFORE_CONFIRMATION,
      message: `${open === 1 ? 'A background check' : `${open} background checks`} must be clear before confirmation. Record the result in Background checks (or decide the discrepancy), then confirm. HR can change the check's gate if the company decides so.`,
    });
}
