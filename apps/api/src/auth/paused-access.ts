import { UnauthorizedException } from '@nestjs/common';
import type { TenantPrismaService } from '@exam-platform/shared';

export const DEACTIVATED_MESSAGE = 'This account has been deactivated';
export const pausedMessage = (until: Date) =>
  `Your access is paused for block leave until ${until.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}. Ask HR if you need access sooner.`;

/**
 * The refusal for an account that is not active, shown only where the sign-in flow already told this account
 * "deactivated" (after the password, code or provider proved who it is). TIM-39 Suspend: an account paused for a
 * block-leave plan that is running says so with the block's last day; anything else stays "deactivated".
 */
export async function inactiveAccountError(tenantPrisma: TenantPrismaService, user: { id: string; organizationId: string | null; status: string }, now = new Date()): Promise<UnauthorizedException> {
  if (user.status !== 'paused' || !user.organizationId) return new UnauthorizedException(DEACTIVATED_MESSAGE);
  const org = user.organizationId;
  const today = new Date(`${now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}T00:00:00Z`);
  const plan = await tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
    const emp = await tx.employee.findFirst({ where: { organizationId: org, userId: user.id }, select: { id: true } });
    if (!emp) return null;
    return tx.blockLeavePlan.findFirst({ where: { organizationId: org, employeeId: emp.id, accessPause: 'scheduled', fromOn: { lte: today }, toOn: { gte: today } }, orderBy: { toOn: 'desc' }, select: { toOn: true } });
  });
  return plan?.toOn ? new UnauthorizedException(pausedMessage(plan.toOn)) : new UnauthorizedException(DEACTIVATED_MESSAGE);
}
