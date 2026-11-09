import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { SETTINGS } from '../org-structure/settings-registry';
import { settingFor } from '../people/probation';

// Lifecycle 6e rehire policy (YX-LC-11 / 18), shared by the joiner's checklist (PUT joiners/:id/rehire) and the
// Create drawer of Ready to onboard (PPL-12), where HR sees the impact and may change a choice before the joiner exists.

export const REHIRE_OPTIONS = ['code', 'pf', 'same_fy_tax', 'service', 'gratuity', 'leave', 'probation', 'prior_records'] as const;

/** The choices that differ from the company policy, each with its reason; a choice equal to the policy is dropped. */
export async function rehireOverridesIn(tx: Tx, c: CompanyContext, legalEntityId: string, overrides: Record<string, { value: string; reason?: string | null }>) {
  const next: Record<string, { value: string; reason: string }> = {};
  for (const [key, x] of Object.entries(overrides)) {
    if (!(REHIRE_OPTIONS as readonly string[]).includes(key) || typeof x?.value !== 'string' || !SETTINGS[`rehire.${key}`].values.includes(x.value)) throw new BadRequestException(`No such rehire choice: ${key}.`);
    const policy = await settingFor(tx, c, `rehire.${key}`, { legalEntityId });
    if (x.value === policy) continue;
    if (!x.reason || x.reason.trim().length < 3) throw new BadRequestException(`Say why "${key.replace(/_/g, ' ')}" differs from the company policy.`);
    next[key] = { value: x.value, reason: x.reason.trim().slice(0, 300) };
  }
  return next;
}

/**
 * The ex-employee an accepted offer is for (P01 person match: the candidate's email is a person's or an employee's work
 * email), or null for a new person. A current employee is refused: their move is a job change (YX-LC-11).
 */
export async function offerRehire(tx: Tx, org: string, offerId: string) {
  const o = await tx.offer.findFirst({ where: { organizationId: org, id: offerId, status: 'accepted' } });
  if (!o) throw new NotFoundException('No accepted offer with this id.');
  const cand = await tx.candidate.findFirstOrThrow({ where: { organizationId: org, id: o.candidateId }, select: { email: true } });
  const match = await personByEmail(tx, org, cand.email);
  if (!match) return { offer: o, email: cand.email, rehire: null };
  if (match.current) {
    throw new ConflictException('This is a current employee. Their move is a transfer or promotion on their record (People › Job changes), not onboarding (YX-LC-11).');
  }
  return { offer: o, email: cand.email, rehire: { personId: match.personId, employmentId: match.lastEmployment.id } };
}

/**
 * The P01 person match for a candidate's email: a person's email or an employee's work email. Shared by the offer
 * hand-off above and the HIR-05 ex-employee banner, so there is one matcher. `current`: still employed.
 */
export async function personByEmail(tx: Tx, org: string, email: string) {
  const persons = await tx.person.findMany({ where: { organizationId: org, primaryEmail: email, status: 'active' }, select: { id: true } });
  const emp = await tx.employee.findFirst({ where: { organizationId: org, OR: [{ personId: { in: persons.map((p) => p.id) } }, { workEmail: email }] }, select: { id: true, personId: true } });
  if (!emp) return null;
  const current = Boolean(await tx.employment.findFirst({ where: { organizationId: org, employeeId: emp.id, exitedOn: null }, select: { id: true } }));
  const lastEmployment = await tx.employment.findFirstOrThrow({ where: { organizationId: org, employeeId: emp.id }, orderBy: { exitedOn: 'desc' } });
  return { employeeId: emp.id, personId: emp.personId, current, lastEmployment };
}
