import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { assertHuman } from '../auth/bot-challenge';
import { OtpService } from '../auth/otp.service';
import { settingFor } from '../people/probation';
import { LettersService } from '../documents/letters/letters.service';
import { alumniUntil } from './exit-rules';

// LIFE-4.04 the alumni login (T9-02; P02 §4.7 "Alumni"; P05 Q6): someone who left signs in with a one-time code to
// their personal email (Turnstile when the company has it on) and reads, never changes, their own issued letters,
// for alumni.access_years (starter 7) after the last day. The same answer whether or not the email is known.
// Someone working here again uses their staff login instead.

const SESSION_MINUTES = 60;
const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');
interface Alumnus {
  org: string;
  personId: string;
  lastDay: string;
  until: string;
}

@Injectable()
export class AlumniPortalService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly otp: OtpService,
    private readonly letters: LettersService,
  ) {}

  private async orgOf(slug: string) {
    const o = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.findUnique({ where: { slug }, select: { id: true, name: true } }));
    if (!o) throw new NotFoundException('No such company.');
    return o;
  }

  private otpKey = (org: string, email: string) => `alumni-portal:${org}:${email}`;

  /** The person behind an email, if they left and their access has not ended (and they do not work here again). */
  private async alumnus(tx: Tx, c: CompanyContext, personId: string): Promise<Alumnus | null> {
    const org = c.organizationId;
    if (await tx.employment.findFirst({ where: { organizationId: org, exitedOn: null, employeeId: { in: (await tx.employee.findMany({ where: { organizationId: org, personId }, select: { id: true } })).map((e) => e.id) } }, select: { id: true } })) return null;
    const emps = await tx.employee.findMany({ where: { organizationId: org, personId }, select: { id: true } });
    const last = await tx.employment.findFirst({ where: { organizationId: org, employeeId: { in: emps.map((e) => e.id) }, exitedOn: { not: null } }, orderBy: { exitedOn: 'desc' } });
    if (!last?.exitedOn) return null;
    const lastDay = last.exitedOn.toISOString().slice(0, 10);
    const until = alumniUntil(lastDay, Number(await settingFor(tx, c, 'alumni.access_years', { legalEntityId: last.legalEntityId })));
    return todayIst() <= until ? { org, personId, lastDay, until } : null;
  }

  private async byEmail(tx: Tx, c: CompanyContext, email: string): Promise<Alumnus | null> {
    const org = c.organizationId;
    const fromDetails = await tx.employeePersonalDetails.findMany({ where: { organizationId: org, personalEmail: { equals: email, mode: 'insensitive' } }, select: { employeeId: true } });
    const viaEmp = fromDetails.length ? await tx.employee.findMany({ where: { organizationId: org, id: { in: fromDetails.map((d) => d.employeeId) } }, select: { personId: true } }) : [];
    const persons = [...new Set([...viaEmp.map((e) => e.personId), ...(await tx.person.findMany({ where: { organizationId: org, primaryEmail: email }, select: { id: true } })).map((p) => p.id)])];
    for (const p of persons) {
      const a = await this.alumnus(tx, c, p);
      if (a) return a;
    }
    return null;
  }

  async code(slug: string, email: string, ip: string | null, challengeToken?: string) {
    await assertHuman(challengeToken, ip);
    const o = await this.orgOf(slug);
    const e = email.toLowerCase();
    await this.otp.reserveSend(this.otpKey(o.id, e), ip);
    const a = await this.tenantPrisma.forTenant({ organizationId: o.id, isSuperAdmin: false }, (tx) => this.byEmail(tx, { organizationId: o.id, isSuperAdmin: false }, e));
    if (a) this.otp.deliver('email', e, await this.otp.issue(this.otpKey(o.id, e), { email: e }), 'sign_in', o.id, { userId: '' });
    return { sent: true };
  }

  async verify(slug: string, email: string, code: string) {
    const o = await this.orgOf(slug);
    const e = email.toLowerCase();
    const data = await this.otp.check(this.otpKey(o.id, e), code);
    const wrong = () => new UnauthorizedException('That code is not right or has expired. Ask for a new one.');
    if (!data || data.email !== e) throw wrong();
    const c: CompanyContext = { organizationId: o.id, isSuperAdmin: false };
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const a = await this.byEmail(tx, c, e);
      if (!a) throw wrong();
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60_000);
      await tx.alumniSession.create({ data: { organizationId: o.id, personId: a.personId, tokenHash: tokenHash(token), expiresAt } });
      await audit(tx, c, 'alumni.signed_in', 'person', a.personId, {});
      return { token, expiresAt: expiresAt.toISOString() };
    });
  }

  /** Every alumni call: a live session, of someone whose access has not ended, in that company only. */
  private async inPortal<T>(slug: string, token: string | undefined, fn: (tx: Tx, a: Alumnus, c: CompanyContext) => Promise<T>): Promise<T> {
    if (!token) throw new UnauthorizedException('Sign in again.');
    const o = await this.orgOf(slug);
    const c: CompanyContext = { organizationId: o.id, isSuperAdmin: false };
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const s = await tx.alumniSession.findFirst({ where: { organizationId: o.id, tokenHash: tokenHash(token), endedAt: null, expiresAt: { gt: new Date() } } });
      const a = s ? await this.alumnus(tx, c, s.personId) : null;
      if (!s || !a) throw new UnauthorizedException('Sign in again.');
      return fn(tx, a, c);
    });
  }

  async signOut(slug: string, token: string | undefined) {
    if (!token) return { ok: true };
    const o = await this.orgOf(slug);
    await this.tenantPrisma.forTenant({ organizationId: o.id, isSuperAdmin: false }, (tx) => tx.alumniSession.updateMany({ where: { organizationId: o.id, tokenHash: tokenHash(token), endedAt: null }, data: { endedAt: new Date() } }));
    return { ok: true };
  }

  async me(slug: string, token: string | undefined) {
    const o = await this.orgOf(slug);
    return this.inPortal(slug, token, async (tx, a) => {
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: a.org, id: a.personId } });
      return { company: o.name, name: p.preferredName || [p.givenName, p.familyName].filter(Boolean).join(' '), lastDay: a.lastDay, accessUntil: a.until, ...(await this.letters.lettersOf(tx, a.org, a.personId)) };
    });
  }

  async letterFile(slug: string, token: string | undefined, id: string, which: 'letter' | 'acceptance') {
    return this.inPortal(slug, token, async (tx, a, c) => {
      const l = await tx.letterIssue.findFirst({ where: { organizationId: a.org, id, personId: a.personId, status: { in: ['issued', 'superseded'] } } });
      if (!l) throw new NotFoundException('No such letter.');
      return this.letters.letterFile(tx, c, l, which, 'alumni');
    });
  }
}
