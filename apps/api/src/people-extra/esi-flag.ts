import type { Prisma } from '@prisma/client';

/**
 * The only thing payroll learns from a disability declaration (PPL-38): whether the person may use the higher ESI wage
 * ceiling on a date. True only for a verified declaration (the certificate was checked) still valid on that date; never
 * the category, percentage, certificate or adjustments. Payroll cannot set it; withdrawing the declaration clears it.
 */
export async function esiPwdFlags(tx: Prisma.TransactionClient, organizationId: string, employeeIds: string[], on: string): Promise<Set<string>> {
  if (!employeeIds.length) return new Set();
  const rows = await tx.disabilityDeclaration.findMany({
    where: { organizationId, employeeId: { in: employeeIds }, status: 'verified', OR: [{ validUntil: null }, { validUntil: { gte: new Date(`${on}T00:00:00Z`) } }] },
    select: { employeeId: true },
  });
  return new Set(rows.map((r) => r.employeeId));
}
