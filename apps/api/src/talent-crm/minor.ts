import { OrgSecretsCryptoService } from '@exam-platform/shared';
import type { Tx } from '../org-structure/org-structure.service';
import { ageOn } from './crm-rules';

// HIR-05 under 18 (DPDP s.9; Child and Adolescent Labour Act). The age and what is held are data in the rule set
// HIR.MINOR (statutory_rule_sets, marked verify), never code. The date of birth is Special data: sealed with the
// company key and bound to the company and candidate, so a sealed value copied to another row does not open.

export const MINOR_STATUTE = 'HIR.MINOR';

export interface MinorRule {
  name: string;
  minAge: number;
  holdAfter: string;
  offerNeedsGuardian: boolean;
  verify: boolean;
}

// Stateless (the key comes from the environment), so the gates need no injected service.
const crypto = new OrgSecretsCryptoService();

export const sealDob = (org: string, candidateId: string, dob: string) => crypto.encrypt(`${org}:${candidateId}:${dob}`);

/** The sealed date of birth (YYYY-MM-DD), or null when it does not belong to this company and candidate. */
export function openDob(org: string, candidateId: string, sealed: string): string | null {
  try {
    const plain = crypto.decrypt(sealed);
    const prefix = `${org}:${candidateId}:`;
    return plain.startsWith(prefix) ? plain.slice(prefix.length) : null;
  } catch {
    return null;
  }
}

export async function minorRule(tx: Tx, day: string): Promise<MinorRule | null> {
  const on = new Date(`${day}T00:00:00Z`);
  const row = await tx.statutoryRuleSet.findFirst({
    where: { statute: MINOR_STATUTE, status: 'published', validFrom: { lte: on }, OR: [{ validTo: null }, { validTo: { gte: on } }] },
    orderBy: { validFrom: 'desc' },
    select: { values: true, verify: true },
  });
  if (!row) return null;
  const v = row.values as { name?: string; minAge?: number; holdAfter?: string; offerNeedsGuardian?: boolean };
  return { name: v.name ?? MINOR_STATUTE, minAge: Number(v.minAge ?? 18), holdAfter: v.holdAfter ?? 'screening', offerNeedsGuardian: v.offerNeedsGuardian !== false, verify: row.verify };
}

export type MinorState = { minor: false } | { minor: true; dob: string; guardian: 'none' | 'pending' | 'given' | 'declined'; rule: MinorRule };

/** Is the candidate under the rule's age on `day`, and where is the guardian's consent? */
export async function minorState(tx: Tx, org: string, candidateId: string, day: string): Promise<MinorState> {
  const cand = await tx.candidate.findFirst({ where: { organizationId: org, id: candidateId }, select: { dobSealed: true } });
  if (!cand?.dobSealed) return { minor: false };
  const dob = openDob(org, candidateId, cand.dobSealed);
  const rule = dob ? await minorRule(tx, day) : null;
  if (!dob || !rule || ageOn(dob, day) >= rule.minAge) return { minor: false };
  const g = await tx.guardianConsent.findFirst({ where: { organizationId: org, candidateId }, orderBy: { askedAt: 'desc' }, select: { status: true } });
  return { minor: true, dob, guardian: (g?.status as 'pending' | 'given' | 'declined' | undefined) ?? 'none', rule };
}

/** The refusal for a move past screening or an offer while a guardian has not consented; null when allowed. */
export async function minorHold(tx: Tx, org: string, candidateId: string, day: string, what: 'move' | 'offer'): Promise<string | null> {
  const s = await minorState(tx, org, candidateId, day);
  if (!s.minor || s.guardian === 'given') return null;
  if (what === 'offer' && !s.rule.offerNeedsGuardian) return null;
  return what === 'offer'
    ? `This candidate is under ${s.rule.minAge}, so no offer is made until a parent or guardian consents. Send the guardian consent email from the candidate record.`
    : `This candidate is under ${s.rule.minAge}, so they stay at screening until a parent or guardian consents. Send the guardian consent email from the candidate record.`;
}
