import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';

// P01 §4.5a persons (J15): one person per human per company, with a role for every way they appear. The
// person is only ever looked up inside the caller's company (RLS, YX-ORG-26). Identities are never merged
// here: a login stays a users row and an employee record stays an employees row; roles only link them.

export interface PersonInput {
  givenName: string;
  familyName?: string | null;
  preferredName?: string | null;
  email?: string | null;
  phone?: string | null;
  /** HR confirmed this existing person (YX-ORG-27: a deterministic match is linked only once confirmed). */
  personId?: string;
}

/** E.164, or a 400 (YX-ORG-28). India is the default country for numbers written without a code. */
export function e164(phone: string): string {
  const parsed = parsePhoneNumberFromString(phone, 'IN');
  if (!parsed?.isValid()) throw new BadRequestException('That phone number is not valid.');
  return parsed.number;
}

/**
 * The person a new employee record belongs to. A new person is created unless HR names one; an email or
 * phone that already belongs to a person is never linked silently (YX-ORG-27: HR confirms, and a name alone
 * never links), and a person has at most one employee record (P01 §4.4; a rehire is a new employment on it).
 */
export async function personForEmployee(tx: Tx, c: CompanyContext, input: PersonInput): Promise<string> {
  const org = c.organizationId;
  const phone = input.phone ? e164(input.phone) : null;
  const email = input.email?.trim() || null;
  const keys = [...(email ? [{ primaryEmail: email }] : []), ...(phone ? [{ primaryPhone: phone }] : [])];
  const matches = keys.length ? await tx.person.findMany({ where: { organizationId: org, status: 'active', OR: keys }, select: { id: true } }) : [];
  if (input.personId) {
    const person = await tx.person.findFirst({ where: { id: input.personId, organizationId: org } });
    if (!person) throw new BadRequestException('No such person in this company.');
    if (person.status !== 'active') throw new BadRequestException('That person record was merged or erased.');
    if (await tx.employee.findFirst({ where: { organizationId: org, personId: person.id }, select: { id: true } })) {
      throw new ConflictException('That person already has an employee record; a rehire is a new employment on it (YX-ORG-26).');
    }
    // Conflicting deterministic keys never link (YX-ORG-27).
    if (matches.some((m) => m.id !== person.id)) throw new ConflictException('That email or phone belongs to another person.');
    await tx.personLinkLog.create({ data: { organizationId: org, action: 'confirmed', personId: person.id, basis: 'hr_confirmed', decidedBy: c.userId ?? null } });
    return person.id;
  }
  if (matches.length) {
    throw new ConflictException({
      statusCode: 409,
      code: 'POSSIBLE_SAME_PERSON',
      message: 'That email or phone already belongs to a person in this company. Check it is the same person and link the record to them (YX-ORG-27).',
      personIds: [...new Set(matches.map((m) => m.id))],
    });
  }
  const person = await tx.person.create({
    data: {
      organizationId: org,
      givenName: input.givenName.trim(),
      familyName: input.familyName?.trim() || null,
      preferredName: input.preferredName?.trim() || null,
      primaryEmail: email,
      primaryPhone: phone,
      createdBy: c.userId ?? null,
    },
  });
  return person.id;
}

export async function addRole(tx: Tx, c: CompanyContext, personId: string, roleType: 'employee' | 'login', source: { table: 'employments' | 'users'; id: string }, startOn: Date) {
  await tx.personRole.create({ data: { organizationId: c.organizationId, personId, roleType, sourceTable: source.table, sourceId: source.id, startOn } });
}

/**
 * A login may be linked to an employee record only when its email is the record's work email, never by the
 * person linking their own login (that would hand them someone's self view, pay included), and only once.
 */
export async function checkLoginLink(tx: Tx, c: CompanyContext, userId: string, workEmail: string | null): Promise<void> {
  if (userId === c.userId) throw new ForbiddenException('You cannot link your own login to an employee record.');
  const user = await tx.user.findFirst({ where: { id: userId, organizationId: c.organizationId }, select: { email: true } });
  if (!user) throw new BadRequestException('No such login in this company.');
  if (!workEmail || user.email.toLowerCase() !== workEmail.toLowerCase()) throw new BadRequestException("A login is linked only when its email is the person's work email.");
}
