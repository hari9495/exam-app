export const ORGANIZATION_STATUSES = ['active', 'suspended', 'deleted'] as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

/**
 * Shown to staff when their organization is suspended or deleted.
 *
 * Candidates must NEVER see this. The candidate-auth guard reuses the neutral
 * "this exam is not currently available" wording instead, so a candidate cannot
 * learn that their prospective employer's account is in trouble.
 */
export const ORGANIZATION_INACTIVE_MESSAGE = 'This organization is not currently active';

/**
 * Fails closed: anything that is not exactly 'active' denies access -- including
 * null, an unreadable value, or a status added later without updating this
 * function. A new status must be an explicit decision here, never an accidental
 * grant.
 */
export function isOrganizationActive(status: string | null | undefined): boolean {
  return status === 'active';
}
