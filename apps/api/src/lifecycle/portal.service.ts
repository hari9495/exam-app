import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { OrgSecretsCryptoService, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { assertHuman } from '../auth/bot-challenge';
import { OtpService } from '../auth/otp.service';
import { EmailService } from '../email/email.service';
import { showDate } from '../people/employee-import';
import { settingFor } from '../people/probation';
import { hashValue } from '../people/profile.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DocumentsService } from '../documents/documents.service';
import { LettersService } from '../documents/letters/letters.service';
import { BankSectionDto, EmergencySectionDto, IdentitySectionDto, NomineesSectionDto, PersonalSectionDto, TaxSectionDto } from './portal-dto';

// LIFE-2.01 / 2.02 / 2.03 / 2.07 the pre-boarding portal (T9-01; design §8.2–8.3; P02 §4.7 "Pre-boarding candidate").
//   sign-in   a one-time code to the personal email HR gave (Turnstile when the company has it on); the same answer
//             whether or not the email belongs to a joiner; a 2-hour session that ends at joining or cancellation;
//   scope     the session reaches only its own joiner record, the person's own documents and letters;
//   answers   sealed with the platform key, shown back masked; PAN, Aadhaar and bank need a fresh code (step-up);
//   on day 1  personal details are written to the record and identity / bank become change requests (joining service);
//   closed    after joining, a decline or a cancellation the joiner can still sign in, reads the outcome and downloads
//             their own letters (founder 2 Nov 2026); every change is refused (409 PORTAL_CLOSED).

const SESSION_MINUTES = 120;
const STEP_UP_MINUTES = 10;
export const BGV_NOTICE = 'BGV v1';
/** The itemised BGV notice (DPDP Act 2023 and Rules 2025: data, purpose, withdrawal, complaint), in plain words. */
export const BGV_ITEMS = [
  'What we check: your identity, address, education and past jobs, and only what the company asks for your role.',
  'Why: to confirm what you told us before you join.',
  'Who sees it: HR people allowed to see background checks, and the checking partner if the company uses one.',
  'How long: until your confirmation plus one year, then deleted unless there is a dispute.',
  'You can withdraw this consent at any time in this portal. Checks then stop. HR decides what that means for your offer; nothing happens automatically.',
  'Questions or complaints: write to the company’s grievance officer; you may also complain to the Data Protection Board of India.',
];
export const SECTIONS = ['personal', 'identity', 'bank', 'emergency', 'nominees', 'tax'] as const;
type Section = (typeof SECTIONS)[number];
const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');
const mask = (s: string) => `${'•'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
type Answers = Partial<{ personal: PersonalSectionDto; identity: IdentitySectionDto; bank: BankSectionDto; emergency: EmergencySectionDto; nominees: NomineesSectionDto; tax: TaxSectionDto }>;
/** Nominees as saved: one share for all schemes before T9-01 (sharePercent), then one share per scheme. */
type StoredNominee = { name: string; relation: string; dateOfBirth?: string; pf?: number; gratuity?: number; insurance?: number; sharePercent?: number };
export const SCHEMES = ['pf', 'gratuity', 'insurance'] as const;
/** Every nominee per scheme (an older single share counts for each scheme; `single` marks it). */
export function nomineesOf(a: Answers) {
  const list = a.nominees?.nominees as StoredNominee[] | undefined;
  if (!list) return null;
  return list.map((n) => {
    const all = n.pf === undefined ? (n.sharePercent ?? 0) : null;
    return { name: n.name, relation: n.relation, dateOfBirth: n.dateOfBirth ?? null, pf: all ?? n.pf ?? 0, gratuity: all ?? n.gratuity ?? 0, insurance: all ?? n.insurance ?? 0, single: all !== null };
  });
}
/** Why the nominee shares cannot be saved, or null (each scheme adds up to 100; no nominee without any share). */
export function nomineeProblem(list: { name: string; pf: number; gratuity: number; insurance: number }[]): string | null {
  const label = { pf: 'PF', gratuity: 'Gratuity', insurance: 'Group insurance' } as const;
  for (const k of SCHEMES) {
    const total = list.reduce((n, x) => n + x[k], 0);
    if (total !== 100) return `${label[k]} shares add up to ${total}%. Make them add up to 100%.`;
  }
  const none = list.find((x) => x.pf + x.gratuity + x.insurance === 0);
  return none ? `${none.name} has no share in any scheme. Give a share or remove them.` : null;
}
const OUTCOME: Record<string, 'withdrawn' | 'reneged' | 'cancelled'> = { withdrawn: 'withdrawn', reneged: 'reneged', did_not_join: 'cancelled' };
const iso = (d: Date) => d.toISOString().slice(0, 10);
interface Session {
  org: string;
  preboardingId: string;
  personId: string;
  sessionId: string;
  steppedUp: boolean;
}

@Injectable()
export class PreboardingPortalService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly otp: OtpService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
    private readonly documents: DocumentsService,
    private readonly letters: LettersService,
  ) {}

  private async orgOf(slug: string) {
    const o = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.findUnique({ where: { slug }, select: { id: true } }));
    if (!o) throw new NotFoundException('No such company.');
    return o.id;
  }

  private otpKey = (org: string, email: string) => `preboarding-portal:${org}:${email}`;

  /** The joining waiting for this email; else the latest closed one, so its outcome can be read (never changed). */
  private async joinerByEmail(tx: Tx, org: string, email: string) {
    const persons = await tx.person.findMany({ where: { organizationId: org, primaryEmail: email, status: 'active' }, select: { id: true } });
    const personId = { in: persons.map((p) => p.id) };
    return (await tx.preboarding.findFirst({ where: { organizationId: org, personId, status: 'invited' } })) ?? tx.preboarding.findFirst({ where: { organizationId: org, personId }, orderBy: { updatedAt: 'desc' } });
  }

  /** Step 1: a code by email. Always the same answer. */
  async code(slug: string, email: string, ip: string | null, challengeToken?: string) {
    await assertHuman(challengeToken, ip);
    const org = await this.orgOf(slug);
    const e = email.toLowerCase();
    await this.otp.reserveSend(`preboarding-portal:${org}:${e}`, ip);
    const pb = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => this.joinerByEmail(tx, org, e));
    if (pb) this.otp.deliver('email', e, await this.otp.issue(this.otpKey(org, e), { email: e }), 'sign_in', org, { userId: '' });
    return { sent: true };
  }

  /** Step 2: the right code starts a session for that one joiner. */
  async verify(slug: string, email: string, code: string) {
    const org = await this.orgOf(slug);
    const e = email.toLowerCase();
    const data = await this.otp.check(this.otpKey(org, e), code);
    if (!data || data.email !== e) throw new UnauthorizedException('That code is not right or has expired. Ask for a new one.');
    return this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
      const pb = await this.joinerByEmail(tx, org, e);
      if (!pb) throw new UnauthorizedException('That code is not right or has expired. Ask for a new one.');
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60_000);
      await tx.preboardingPortalSession.create({ data: { organizationId: org, preboardingId: pb.id, tokenHash: tokenHash(token), expiresAt } });
      await audit(tx, { organizationId: org, isSuperAdmin: false }, 'preboarding.portal.signed_in', 'preboarding', pb.id);
      return { token, expiresAt: expiresAt.toISOString() };
    });
  }

  /**
   * Every portal call: a live session of this joiner, in that company only. A closed joining (joined, declined,
   * cancelled) is read-only: only calls that pass `closedOk` run, every change is refused.
   */
  private async inPortal<T>(slug: string, token: string | undefined, fn: (tx: Tx, s: Session, c: CompanyContext) => Promise<T>, closedOk = false): Promise<T> {
    if (!token) throw new UnauthorizedException('Sign in again.');
    const org = await this.orgOf(slug);
    const c = { organizationId: org, isSuperAdmin: false } as CompanyContext;
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const s = await tx.preboardingPortalSession.findFirst({ where: { organizationId: org, tokenHash: tokenHash(token), endedAt: null, expiresAt: { gt: new Date() } } });
      const pb = s ? await tx.preboarding.findFirst({ where: { organizationId: org, id: s.preboardingId } }) : null;
      if (!s || !pb) throw new UnauthorizedException('Sign in again.');
      if (pb.status !== 'invited' && !closedOk) throw new ConflictException({ statusCode: 409, code: 'PORTAL_CLOSED', message: 'Your joining is closed, so nothing can be changed here.' });
      return fn(tx, { org, preboardingId: pb.id, personId: pb.personId, sessionId: s.id, steppedUp: Boolean(s.steppedUpAt && s.steppedUpAt.getTime() > Date.now() - STEP_UP_MINUTES * 60_000) }, c);
    });
  }

  /** The joining behind a live session that is still waiting to join (the decline, which the joining service does). */
  async openJoining(slug: string, token: string | undefined) {
    return this.inPortal(slug, token, async (_tx, s) => ({ org: s.org, preboardingId: s.preboardingId }));
  }

  async signOut(slug: string, token: string | undefined) {
    if (!token) return { ok: true };
    const org = await this.orgOf(slug);
    await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => tx.preboardingPortalSession.updateMany({ where: { organizationId: org, tokenHash: tokenHash(token), endedAt: null }, data: { endedAt: new Date() } }));
    return { ok: true };
  }

  private answers(pb: { answersEnc: string | null }): Answers {
    return pb.answersEnc ? (JSON.parse(this.crypto.decrypt(pb.answersEnc)) as Answers) : {};
  }

  /** Answers for showing back: identity and bank only masked. */
  static shown(a: Answers) {
    return {
      personal: a.personal ?? null,
      identity: a.identity ? { legalName: a.identity.legalName, pan: mask(a.identity.pan), aadhaar: a.identity.aadhaar ? mask(a.identity.aadhaar) : null, uan: a.identity.uan ? mask(a.identity.uan) : null } : null,
      bank: a.bank ? { holderName: a.bank.holderName, account: mask(a.bank.accountNumber), ifsc: a.bank.ifsc } : null,
      emergency: a.emergency ?? null,
      nominees: nomineesOf(a)?.map(({ single: _single, ...n }) => n) ?? null,
      tax: a.tax ? { regime: a.tax.regime, previousIncome: a.tax.previousIncome ?? null } : null,
    };
  }

  /**
   * What the portal shows: the joiner, their sections, their own checklist tasks, documents to upload (with the day
   * each is due), consent, letters to accept, the first day and whether the date moved. A closed joining shows only
   * its outcome.
   */
  async me(slug: string, token: string | undefined) {
    return this.inPortal(
      slug,
      token,
      async (tx, s, c) => {
        const pb = await tx.preboarding.findFirstOrThrow({ where: { organizationId: s.org, id: s.preboardingId } });
        const p = await tx.person.findFirstOrThrow({ where: { organizationId: s.org, id: s.personId } });
        const org = await tx.organization.findUniqueOrThrow({ where: { id: s.org }, select: { name: true } });
        const name = [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ');
        if (pb.status !== 'invited') {
          const outcome = pb.status === 'joined' ? 'joined' : (OUTCOME[pb.outcome ?? ''] ?? 'cancelled');
          // joinedAt is an instant: show the India date it happened on (a 2 am join is that day, not the UTC day before).
          const on = pb.status === 'joined' ? (pb.joinedAt ? todayIst(pb.joinedAt) : null) : pb.cancelledOn ? iso(pb.cancelledOn) : null;
          // Founder 2 Nov 2026: the joiner's own letters stay downloadable (letterFile is the one closed route besides me).
          return { company: org.name, name, closed: { outcome, on }, letters: (await this.letters.lettersOf(tx, s.org, s.personId)).letters };
        }
        const [entity, loc, desig, mgr, buddy, batch] = await Promise.all([
          tx.legalEntity.findFirst({ where: { organizationId: s.org, id: pb.legalEntityId }, select: { name: true } }),
          tx.location.findFirst({ where: { organizationId: s.org, id: pb.locationId }, select: { name: true, address: true } }),
          pb.designationId ? tx.designation.findFirst({ where: { organizationId: s.org, id: pb.designationId }, select: { name: true } }) : null,
          pb.managerEmployeeId ? tx.employee.findFirst({ where: { organizationId: s.org, id: pb.managerEmployeeId } }) : null,
          pb.buddyEmployeeId ? tx.employee.findFirst({ where: { organizationId: s.org, id: pb.buddyEmployeeId } }) : null,
          pb.batchId ? tx.joinerBatch.findFirst({ where: { organizationId: s.org, id: pb.batchId }, select: { name: true } }) : null,
        ]);
        const who = (e: { preferredName: string | null; givenName: string; familyName: string | null } | null) => (e ? [e.preferredName || e.givenName, e.familyName].filter(Boolean).join(' ') : null);
        const docTasks = await this.documentTasks(tx, s);
        const sections = pb.sections as Record<string, string>;
        const bgvConsent = await tx.consentRecord.findFirst({ where: { organizationId: s.org, personId: s.personId, purpose: 'bgv', withdrawnAt: null } });
        const journey = await tx.journey.findFirst({ where: { organizationId: s.org, subjectType: 'preboarding', subjectId: s.preboardingId, kind: 'onboarding' } });
        // Only the joiner's own tasks (owner "the person"); HR's, IT's and the manager's stay with them.
        const tasks = journey ? await tx.journeyTask.findMany({ where: { organizationId: s.org, journeyId: journey.id, ownerType: 'person', status: { in: ['open', 'waiting', 'done'] } }, orderBy: [{ dueOn: 'asc' }, { sortOrder: 'asc' }] }) : [];
        const moved = await tx.auditLog.findFirst({ where: { organizationId: s.org, action: 'preboarding.joining_date.changed', entityType: 'preboarding', entityId: pb.id }, orderBy: { createdAt: 'desc' }, select: { metadataJson: true } });
        const movedFrom = moved?.metadataJson ? (JSON.parse(moved.metadataJson) as { from?: string; to?: string }) : null;
        const addr = (loc?.address ?? {}) as { lines?: string[]; city?: string; postalCode?: string | null };
        const docs = await this.documents.statusesFor(tx, s.org, s.personId, [...docTasks.keys()]);
        return {
          company: org.name,
          employer: entity?.name ?? '',
          name,
          joiningOn: iso(pb.joiningOn),
          location: loc?.name ?? '',
          designation: desig?.name ?? null,
          manager: who(mgr),
          completion: pb.completion,
          sections: Object.fromEntries(SECTIONS.map((k) => [k, sections[k] === 'done' ? 'done' : 'to_do'])),
          answers: PreboardingPortalService.shown(this.answers(pb)),
          steppedUp: s.steppedUp,
          documents: docs.map((d) => ({ ...d, dueOn: docTasks.get(d.typeKey) ?? null })),
          bgv: sections.bgv_requested === 'yes' ? { notice: BGV_NOTICE, items: BGV_ITEMS, consented: Boolean(bgvConsent), consentedAt: bgvConsent?.givenAt.toISOString() ?? null } : null,
          tasks: tasks.map((t) => ({ id: t.id, title: t.title, dueOn: iso(t.dueOn), status: t.status === 'done' ? 'done' : 'to_do' })),
          firstDay: {
            reportingTime: await settingFor(tx, c, 'joining.reporting_time', { legalEntityId: pb.legalEntityId, employmentTypeId: pb.employmentTypeId }),
            bring: await settingFor(tx, c, 'joining.bring_on_day_one', { legalEntityId: pb.legalEntityId }),
            address: [...(addr.lines ?? []), addr.city, addr.postalCode].filter(Boolean).join(', ') || null,
            buddy: who(buddy),
            batch: batch?.name ?? null,
          },
          // PPL-14 / PPL-15 postpone: the last move, while the joining day is still the one it moved to.
          dateMoved: movedFrom?.from && movedFrom.to === iso(pb.joiningOn) && movedFrom.from !== movedFrom.to ? { from: movedFrom.from } : null,
          ...(await this.letters.lettersOf(tx, s.org, s.personId)),
        };
      },
      true,
    );
  }

  /** The documents the joiner's checklist asks for, with the earliest day each is due. */
  private async documentTasks(tx: Tx, s: Session) {
    const j = await tx.journey.findFirst({ where: { organizationId: s.org, subjectType: 'preboarding', subjectId: s.preboardingId, kind: 'onboarding' } });
    const tasks = j ? await tx.journeyTask.findMany({ where: { organizationId: s.org, journeyId: j.id, kind: 'document', status: { not: 'cancelled' } }, orderBy: { dueOn: 'asc' } }) : [];
    const due = new Map<string, string>();
    for (const t of tasks) {
      const k = (t.config as { typeKey?: string }).typeKey;
      if (k && !due.has(k)) due.set(k, iso(t.dueOn));
    }
    return due;
  }

  private async documentKeys(tx: Tx, s: Session) {
    return [...(await this.documentTasks(tx, s)).keys()];
  }

  /** A fresh code for PAN, Aadhaar and bank entry (P02 §4.7 step-up for this login type). */
  async stepUpCode(slug: string, token: string | undefined, ip: string | null) {
    const { org, email } = await this.inPortal(slug, token, async (tx, s) => ({ org: s.org, email: (await tx.person.findFirstOrThrow({ where: { organizationId: s.org, id: s.personId } })).primaryEmail! }));
    await this.otp.reserveSend(`preboarding-stepup:${org}:${email}`, ip);
    this.otp.deliver('email', email, await this.otp.issue(`preboarding-stepup:${org}:${tokenHash(token!)}`, { email }), 'mfa', org, { userId: '' });
    return { sent: true };
  }

  async stepUp(slug: string, token: string | undefined, code: string) {
    const org = await this.orgOf(slug);
    if (!(await this.otp.check(`preboarding-stepup:${org}:${tokenHash(token ?? '')}`, code))) throw new UnauthorizedException('That code is not right or has expired. Ask for a new one.');
    return this.inPortal(slug, token, async (tx, s) => {
      await tx.preboardingPortalSession.update({ where: { id: s.sessionId }, data: { steppedUpAt: new Date() } });
      return { ok: true };
    });
  }

  async saveSection(slug: string, token: string | undefined, key: Section, value: unknown) {
    const done = await this.inPortal(slug, token, async (tx, s, c) => {
      if ((key === 'identity' || key === 'bank') && !s.steppedUp) throw new ForbiddenException({ statusCode: 403, code: 'PORTAL_STEP_UP', message: 'For PAN, Aadhaar and bank details, enter the code we send you first.' });
      const problem = key === 'nominees' ? nomineeProblem((value as NomineesSectionDto).nominees) : null;
      if (problem) throw new BadRequestException(problem);
      const prev = key === 'tax' ? (value as TaxSectionDto).previousIncome : null;
      if (prev && prev.tds > prev.grossSalary) throw new BadRequestException('The TDS is more than the gross salary. Check both on your Form 16 or last payslip.');
      if (key === 'personal' && (value as PersonalSectionDto).dateOfBirth > todayIst()) throw new BadRequestException('The date of birth is in the future.');
      const pb = await tx.preboarding.findFirstOrThrow({ where: { organizationId: s.org, id: s.preboardingId } });
      const a = this.answers(pb);
      (a as Record<string, unknown>)[key] = value;
      const sections = { ...(pb.sections as Record<string, string>), [key]: 'done' };
      const completion = await this.completion(tx, s, sections);
      // PPL-36: the keys "possible same person" matches on (PAN and UAN only as the company's keyed hashes).
      const keys =
        key === 'identity'
          ? { panHash: hashValue(this.crypto, s.org, 'pan', (value as IdentitySectionDto).pan), uanHash: (value as IdentitySectionDto).uan ? hashValue(this.crypto, s.org, 'uan', (value as IdentitySectionDto).uan!) : null }
          : key === 'personal'
            ? { dateOfBirth: new Date(`${(value as PersonalSectionDto).dateOfBirth}T00:00:00Z`) }
            : {};
      await tx.preboarding.update({ where: { id: pb.id }, data: { answersEnc: this.crypto.encrypt(JSON.stringify(a)), sections, completion, version: { increment: 1 }, ...keys } });
      await audit(tx, c, 'preboarding.section.saved', 'preboarding', pb.id, { section: key });
      // Named events for what the founder asked to find in the audit (never the values).
      if (key === 'nominees') await audit(tx, c, 'preboarding.nominees.saved', 'preboarding', pb.id, { nominees: (value as NomineesSectionDto).nominees.length });
      if (key === 'tax' && (prev || this.answers(pb).tax?.previousIncome)) await audit(tx, c, 'preboarding.form12b.saved', 'preboarding', pb.id, { previousIncome: Boolean(prev) });
      const first = completion === 100 && pb.completion < 100;
      if (first) await tx.eventOutbox.create({ data: { organizationId: s.org, eventType: 'preboarding.completed', payload: { preboardingId: pb.id } } });
      const p = first ? await tx.person.findFirst({ where: { organizationId: s.org, id: pb.personId }, select: { givenName: true, familyName: true, preferredName: true } }) : null;
      return { completion, first, hr: pb.hrOwnerUserId, org: s.org, pbId: pb.id, who: p ? [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ') : null };
    });
    if (done.first) await this.notifications.notifySystem({ organizationId: done.org, isSuperAdmin: false }, [done.hr], 'preboarding.completed', { entityType: 'preboarding', entityId: done.pbId, contextText: done.who ? `${done.who} finished their pre-boarding forms` : 'A joiner finished their pre-boarding forms', linkPath: '/yx/people/onboarding' }, { subject: 'A joiner finished their forms', html: '<p>A joiner finished their pre-boarding forms in YukthiX.</p>' }).catch(() => undefined);
    return { completion: done.completion };
  }

  /** Done sections over required ones (the six forms, the checklist's documents, BGV consent when asked, letters to accept). */
  private async completion(tx: Tx, s: Session, sections: Record<string, string>) {
    let total = SECTIONS.length;
    let done = SECTIONS.filter((k) => sections[k] === 'done').length;
    for (const d of await this.documents.statusesFor(tx, s.org, s.personId, await this.documentKeys(tx, s))) {
      total++;
      if (d.status === 'uploaded' || d.status === 'verified') done++;
    }
    if (sections.bgv_requested === 'yes') {
      total++;
      if (await tx.consentRecord.findFirst({ where: { organizationId: s.org, personId: s.personId, purpose: 'bgv', withdrawnAt: null }, select: { id: true } })) done++;
    }
    const toSign = await tx.signatureRequest.findMany({ where: { organizationId: s.org, personId: s.personId, status: { in: ['open', 'signed'] } } });
    total += toSign.length;
    done += toSign.filter((x) => x.status === 'signed').length;
    return Math.floor((100 * done) / total);
  }

  /** Recomputes progress after something outside the forms changed (a document or a signature). */
  private async refresh(tx: Tx, s: Session) {
    const pb = await tx.preboarding.findFirstOrThrow({ where: { organizationId: s.org, id: s.preboardingId } });
    const completion = await this.completion(tx, s, pb.sections as Record<string, string>);
    if (completion !== pb.completion) await tx.preboarding.update({ where: { id: pb.id }, data: { completion } });
  }

  async upload(slug: string, token: string | undefined, typeKey: string, file: { originalname: string; buffer: Buffer } | undefined) {
    const out = await this.inPortal(slug, token, async (tx, s, c) => {
      if (!(await this.documentKeys(tx, s)).includes(typeKey)) throw new ForbiddenException('This document is not asked for.');
      const r = await this.documents.uploadAsPreboarder(tx, c, s.personId, typeKey, file);
      await this.refresh(tx, s);
      return r;
    });
    await this.documents.scanUpload(out.org, out.fileId);
    return { status: out.d.status };
  }

  /** BGV consent given or withdrawn (DPDP Act 2023: itemised notice, recorded evidence, withdrawal stops the checks). */
  async bgvConsent(slug: string, token: string | undefined, dto: { consent: boolean; noticeVersion: string }, meta: { ip: string | null; device: string | null }) {
    return this.inPortal(slug, token, async (tx, s, c) => {
      const pb = await tx.preboarding.findFirstOrThrow({ where: { organizationId: s.org, id: s.preboardingId } });
      if ((pb.sections as Record<string, string>).bgv_requested !== 'yes') throw new BadRequestException('No background check was asked for.');
      if (dto.noticeVersion !== BGV_NOTICE) throw new BadRequestException('The notice changed. Reload the page and read it again.');
      const live = await tx.consentRecord.findFirst({ where: { organizationId: s.org, personId: s.personId, purpose: 'bgv', withdrawnAt: null } });
      if (dto.consent) {
        if (!live) {
          const r = await tx.consentRecord.create({ data: { organizationId: s.org, personId: s.personId, purpose: 'bgv', noticeVersion: BGV_NOTICE, itemsShown: BGV_ITEMS as unknown as Prisma.InputJsonValue, evidence: { ip: meta.ip, device: meta.device, via: 'pre-boarding portal (email code)' } } });
          await audit(tx, c, 'bgv.consent.given', 'preboarding', pb.id, { consentId: r.id, notice: BGV_NOTICE });
        }
      } else if (live) {
        await tx.consentRecord.update({ where: { id: live.id }, data: { withdrawnAt: new Date() } });
        const stopped = await tx.bgvCheck.updateMany({ where: { organizationId: s.org, consentId: live.id, status: { in: ['requested', 'in_progress'] } }, data: { status: 'cancelled', note: 'Consent withdrawn by the joiner', version: { increment: 1 } } });
        await audit(tx, c, 'bgv.consent.withdrawn', 'preboarding', pb.id, { consentId: live.id, checksStopped: stopped.count });
        await tx.eventOutbox.create({ data: { organizationId: s.org, eventType: 'bgv.consent.withdrawn', payload: { preboardingId: pb.id } } });
      }
      await this.refresh(tx, s);
      return { consented: dto.consent };
    });
  }

  /** HR (the joiner's owner) hears of a decline straight away: the bell and an email. */
  async tellHrDeclined(org: string, preboardingId: string, hr: string, who: string, reason: string) {
    const esc = (x: string) => x.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
    await this.notifications
      .notifySystem({ organizationId: org, isSuperAdmin: false }, [hr], 'preboarding.declined', { entityType: 'preboarding', entityId: preboardingId, contextText: `${who} declined the offer (${reason})`, linkPath: '/yx/people/onboarding' }, { subject: 'A joiner declined the offer', html: `<p>${esc(who)} declined the offer in the joining portal.</p><p>Reason: ${esc(reason)}</p>` })
      .catch(() => undefined);
  }

  async letterFile(slug: string, token: string | undefined, id: string, which: 'letter' | 'acceptance') {
    return this.inPortal(slug, token, async (tx, s, c) => {
      const l = await tx.letterIssue.findFirst({ where: { organizationId: s.org, id, personId: s.personId, status: { in: ['issued', 'superseded'] } } });
      if (!l) throw new NotFoundException('No such letter.');
      return this.letters.letterFile(tx, c, l, which, 'self');
    }, true);
  }

  async signCode(slug: string, token: string | undefined, id: string, ip: string | null) {
    const x = await this.inPortal(slug, token, async (tx, s) => {
      const l = await tx.letterIssue.findFirst({ where: { organizationId: s.org, id, personId: s.personId } });
      if (!l) throw new NotFoundException('No such letter.');
      return { org: s.org, personId: s.personId, email: (await tx.person.findFirstOrThrow({ where: { organizationId: s.org, id: s.personId } })).primaryEmail! };
    });
    return this.letters.sendCode(x.org, id, x.personId, x.email, ip);
  }

  async sign(slug: string, token: string | undefined, id: string, dto: { code: string; accept: boolean; disclosureAccepted?: boolean }, meta: { ip: string | null; device: string | null }) {
    const x = await this.inPortal(slug, token, async (tx, s) => {
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: s.org, id: s.personId } });
      return { org: s.org, personId: s.personId, who: [p.givenName, p.familyName].filter(Boolean).join(' '), s };
    });
    const r = await this.letters.signAs(x.org, x.personId, id, dto, { ...meta, channel: 'email', assurance: 'Joining portal (email code), then a one-time code', who: x.who });
    await this.tenantPrisma.forTenant({ organizationId: x.org, isSuperAdmin: false }, (tx) => this.refresh(tx, x.s));
    return r;
  }

  // ------------------------------------------------------------------------------------------ invitations (LIFE-2.01)

  /** Invitation to the portal (when HR adds a joiner with a personal email). Content stays in the app (P04 Q6). */
  async invite(org: string, preboardingId: string) {
    const x = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
      const pb = await tx.preboarding.findFirst({ where: { organizationId: org, id: preboardingId, status: 'invited' } });
      if (!pb) return null;
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: pb.personId } });
      const o = await tx.organization.findUniqueOrThrow({ where: { id: org }, select: { name: true, slug: true } });
      return p.primaryEmail ? { to: p.primaryEmail, first: p.preferredName || p.givenName, company: o.name, slug: o.slug } : null;
    });
    if (!x) return false;
    const link = `${(process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '')}/yx/join/${encodeURIComponent(x.slug)}`;
    const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
    await this.email.send({ to: x.to, organizationId: org, subject: `Welcome to ${x.company}: your joining forms`, html: `<p>Dear ${esc(x.first)},</p><p>Welcome to ${esc(x.company)}. Please fill in your joining forms before your first day: <a href="${esc(link)}">${esc(link)}</a></p><p>Sign in with this email address; we send you a one-time code.</p>` });
    return true;
  }

  /** PPL-14: a batch's new joining day, to a joiner with a personal email (when HR ticks "Email the members"). */
  async dateMoved(org: string, preboardingId: string, joiningOn: string) {
    const x = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
      const pb = await tx.preboarding.findFirst({ where: { organizationId: org, id: preboardingId, status: 'invited' } });
      if (!pb) return null;
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: pb.personId } });
      const o = await tx.organization.findUniqueOrThrow({ where: { id: org }, select: { name: true } });
      return p.primaryEmail ? { to: p.primaryEmail, first: p.preferredName || p.givenName, company: o.name } : null;
    });
    if (!x) return false;
    const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
    const day = showDate(joiningOn).replace(/^0/, ''); // "3 Nov 2026"
    await this.email.send({ to: x.to, organizationId: org, subject: `${x.company}: your joining day is now ${day}`, html: `<p>Dear ${esc(x.first)},</p><p>Your joining day at ${esc(x.company)} has moved to ${day}. Your joining forms and everything else stay as they were.</p>` });
    return true;
  }

  /** Daily: a reminder a week before joining when the forms are not finished (once). */
  async remind(today = todayIst()): Promise<number> {
    const soon = new Date(`${today}T00:00:00Z`);
    soon.setUTCDate(soon.getUTCDate() + 7);
    const rows = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.preboarding.findMany({ where: { status: 'invited', completion: { lt: 100 }, remindedOn: null, joiningOn: { lte: soon } }, select: { id: true, organizationId: true }, take: 500 }));
    let n = 0;
    for (const r of rows) {
      await this.tenantPrisma.forTenant({ organizationId: r.organizationId, isSuperAdmin: false }, (tx) => tx.preboarding.update({ where: { id: r.id }, data: { remindedOn: new Date(`${today}T00:00:00Z`) } }));
      if (await this.invite(r.organizationId, r.id).catch(() => false)) n++;
    }
    return n;
  }

  /** The joiner's sealed answers, for the joining day (joining service). */
  answersOf(pb: { answersEnc: string | null }): Answers {
    return this.answers(pb);
  }
}
