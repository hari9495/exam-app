import { randomBytes } from 'crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { todayIst } from '../org-structure/org-validation';
import { EmailService } from '../email/email.service';
import { buildCandidateEmailHtml } from '../candidate-emails/candidate-email-render';
import { ageOn, daysLeft } from './crm-rules';
import { minorRule, minorState, sealDob } from './minor';

const FRONTEND = () => process.env.FRONTEND_URL ?? 'http://localhost:3000';
const token = () => randomBytes(32).toString('hex');
const DAY = 86_400_000;
/** The lookup context for a public token: no company until the token names one. */
const LOOKUP: TenantContext = { organizationId: null, isSuperAdmin: true };

export interface SourcedInput {
  name: string;
  email: string;
  headline?: string | null;
  site: string;
  sourceNote: string;
}

/**
 * HIR-20 sourced profiles (DPDP) and HIR-05 guardian consent. A sourced profile is a person a recruiter found outside
 * YukthiX, kept in its own table: not in candidate search, lists or campaigns, and contacted only by the one consent
 * email (with the company's talent-pool notice). On consent they become a candidate with a talent-pool consent; on
 * refusal, or with no answer by the company's limit (hiring.sourced.keep_days, default 30), they are erased.
 * Under 18 (rule set HIR.MINOR): the date of birth is sealed; a parent or guardian is emailed for consent, and until
 * they give it the candidate stays at screening and gets no offer (pipeline and offer services ask minorHold).
 */
@Injectable()
export class CrmConsentsService {
  private readonly logger = new Logger(CrmConsentsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  private async mail(org: string, to: string, subject: string, text: string): Promise<boolean> {
    const company = await this.prisma.organization.findUnique({ where: { id: org }, select: { name: true } });
    const html = buildCandidateEmailHtml({ logoUrl: null, orgName: company?.name ?? null, bodyText: text });
    return (await this.email.send({ to, subject, html, organizationId: org })).success;
  }

  // ---- sourced profiles -------------------------------------------------------------------------

  listSourced(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.sourcedProfile.findMany({ where: { organizationId: c.organizationId }, orderBy: { createdAt: 'desc' } });
      const users = await tx.user.findMany({ where: { id: { in: rows.map((r) => r.capturedBy).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } });
      const keep = Number(await settingFor(tx, c, 'hiring.sourced.keep_days', { legalEntityId: '' }));
      const now = new Date();
      return {
        keepDays: keep,
        profiles: rows.map((r) => {
          const u = users.find((x) => x.id === r.capturedBy);
          return { id: r.id, name: r.name, email: r.email, headline: r.headline, site: r.site, sourceNote: r.sourceNote, status: r.status, askedAt: r.askedAt, createdAt: r.createdAt, purgeAfter: r.purgeAfter, daysLeft: r.status === 'given' ? null : daysLeft(r.purgeAfter, now), candidateId: r.candidateId, capturedBy: u ? (u.name ?? u.email) : null };
        }),
      };
    });
  }

  async addSourced(ctx: TenantContext, dto: SourcedInput) {
    const made = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const email = dto.email.trim().toLowerCase();
      if (await tx.candidate.findFirst({ where: { organizationId: org, email, mergedIntoId: null }, select: { id: true } })) throw new ConflictException('This person is already a candidate. Open them from the candidate list.');
      if (await tx.sourcedProfile.findFirst({ where: { organizationId: org, email: { equals: email, mode: 'insensitive' }, status: 'pending' }, select: { id: true } })) throw new ConflictException('This person was already added and is waiting to consent.');
      const notice = await tx.consentNotice.findFirst({ where: { organizationId: org, purpose: 'talent_pool' }, orderBy: { version: 'desc' }, select: { id: true } });
      if (!notice) throw new ConflictException('Publish a talent-pool consent notice first (Hiring › Careers site › Consent notices): the consent email shows it.');
      const keep = Number(await settingFor(tx, c, 'hiring.sourced.keep_days', { legalEntityId: '' }));
      const row = await tx.sourcedProfile.create({ data: { organizationId: org, name: dto.name.trim(), email, headline: dto.headline?.trim() || null, site: dto.site, sourceNote: dto.sourceNote.trim(), consentToken: token(), purgeAfter: new Date(Date.now() + keep * DAY), capturedBy: c.userId ?? null } });
      await audit(tx, c, 'ats.sourced.added', 'sourced_profile', row.id, { site: dto.site });
      return row;
    });
    await this.askSourced(made.organizationId, made.id, made.name, made.email, made.consentToken);
    return { id: made.id, status: 'pending', purgeAfter: made.purgeAfter };
  }

  private async askSourced(org: string, id: string, name: string, email: string, consentToken: string) {
    const company = await this.prisma.organization.findUnique({ where: { id: org }, select: { name: true } });
    const ok = await this.mail(
      org,
      email,
      `${company?.name ?? 'A company'} would like to keep your details for job openings`,
      `Hello ${name},\n\nA recruiter at ${company?.name ?? 'our company'} found your public profile and would like to keep your details to tell you about suitable jobs. We will not contact you again or keep your details unless you agree.\n\nRead the notice and choose: ${FRONTEND()}/consent/sourced/${consentToken}\n\nIf you do nothing, your details are deleted.`,
    );
    await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
      if (ok) await tx.sourcedProfile.update({ where: { id }, data: { askedAt: new Date() } });
      await audit(tx, { organizationId: org, isSuperAdmin: false, userId: null }, ok ? 'ats.sourced.consent_asked' : 'ats.sourced.consent_email_failed', 'sourced_profile', id);
    });
    return ok;
  }

  /** Sends the consent email again (not within a day of the last one, and only while pending). */
  async resendSourced(ctx: TenantContext, id: string) {
    const row = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.sourcedProfile.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!r) throw new NotFoundException('Sourced profile not found.');
      if (r.status !== 'pending') throw new ConflictException('This person has already answered.');
      if (r.askedAt && Date.now() - r.askedAt.getTime() < DAY) throw new ConflictException('The consent email went less than a day ago. Send it again tomorrow.');
      return r;
    });
    const ok = await this.askSourced(row.organizationId, row.id, row.name, row.email, row.consentToken);
    if (!ok) throw new ConflictException('The email could not be sent. Check the company email settings.');
    return { sent: true };
  }

  /** Erases a sourced profile now (the recruiter no longer needs it). */
  eraseSourced(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.sourcedProfile.findFirst({ where: { id, organizationId: c.organizationId }, select: { id: true, status: true } });
      if (!r) throw new NotFoundException('Sourced profile not found.');
      if (r.status === 'given') throw new ConflictException('This person consented and is a candidate now. Erase them from the candidate record.');
      await tx.sourcedProfile.delete({ where: { id } });
      await audit(tx, c, 'ats.sourced.erased', 'sourced_profile', id, { reason: 'recruiter' });
      return { erased: true };
    });
  }

  /** The 'sourced-purge' sweep: no consent by the company's limit means erased (no personal data in the audit). */
  async purgeSourced(now = new Date()) {
    const due = await this.tenantPrisma.forTenant(LOOKUP, (tx) => tx.sourcedProfile.findMany({ where: { status: { not: 'given' }, purgeAfter: { lte: now } }, select: { id: true, organizationId: true }, take: 1000 }));
    for (const d of due) {
      await this.tenantPrisma.forTenant({ organizationId: d.organizationId, isSuperAdmin: false }, async (tx) => {
        const { count } = await tx.sourcedProfile.deleteMany({ where: { id: d.id, status: { not: 'given' } } });
        if (count) await audit(tx, { organizationId: d.organizationId, isSuperAdmin: false, userId: null }, 'ats.sourced.erased', 'sourced_profile', d.id, { reason: 'no_consent' });
      });
    }
    return { erased: due.length };
  }

  private async sourcedByToken(t: string) {
    if (!/^[0-9a-f]{64}$/.test(t)) throw new NotFoundException('This link is not valid.');
    const r = await this.tenantPrisma.forTenant(LOOKUP, (tx) => tx.sourcedProfile.findUnique({ where: { consentToken: t } }));
    if (!r || r.status !== 'pending' || r.purgeAfter <= new Date()) throw new NotFoundException('This link is not valid any more.');
    return r;
  }

  async sourcedPage(t: string) {
    const r = await this.sourcedByToken(t);
    const [company, notice] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: r.organizationId }, select: { name: true } }),
      this.tenantPrisma.forTenant({ organizationId: r.organizationId, isSuperAdmin: false }, (tx) => tx.consentNotice.findFirst({ where: { organizationId: r.organizationId, purpose: 'talent_pool' }, orderBy: { version: 'desc' }, select: { text: true } })),
    ]);
    return { orgName: company?.name ?? '', name: r.name, notice: notice?.text ?? '' };
  }

  /** The person answers: agree makes them a candidate with a talent-pool consent; refuse erases them at once. */
  async answerSourced(t: string, agree: boolean) {
    const r = await this.sourcedByToken(t);
    const org = r.organizationId;
    const sys: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    return this.tenantPrisma.forTenant(sys, async (tx) => {
      if (!agree) {
        await tx.sourcedProfile.delete({ where: { id: r.id } });
        await audit(tx, sys, 'ats.sourced.erased', 'sourced_profile', r.id, { reason: 'declined' });
        return { agreed: false };
      }
      const notice = await tx.consentNotice.findFirst({ where: { organizationId: org, purpose: 'talent_pool' }, orderBy: { version: 'desc' } });
      if (!notice) throw new ConflictException('The company has no consent notice at the moment. Try again later.');
      const existing = await tx.candidate.findFirst({ where: { organizationId: org, email: r.email, mergedIntoId: null }, select: { id: true } });
      const cand = existing ?? (await tx.candidate.create({ data: { organizationId: org, name: r.name, email: r.email } }));
      await tx.candidateConsent.create({ data: { organizationId: org, candidateId: cand.id, noticeId: notice.id, purpose: 'talent_pool', version: notice.version, source: 'sourced' } });
      if (r.headline && !existing) await tx.candidateProfile.create({ data: { organizationId: org, candidateId: cand.id, parsedTitle: r.headline } });
      await tx.sourcedProfile.update({ where: { id: r.id }, data: { status: 'given', answeredAt: new Date(), candidateId: cand.id } });
      await audit(tx, sys, 'ats.sourced.consented', 'sourced_profile', r.id, { candidateId: cand.id });
      return { agreed: true };
    });
  }

  // ---- under 18: date of birth and guardian consent ----------------------------------------------

  /**
   * Records the date of birth (sealed). Under the rule's age, a guardian is needed: their name and email, and the
   * consent email goes at once. Returns whether the candidate is a minor and the guardian state.
   */
  async setDob(ctx: TenantContext, candidateId: string, dto: { dob: string; guardianName?: string | null; guardianEmail?: string | null }) {
    const day = todayIst();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.dob) || Number.isNaN(Date.parse(`${dto.dob}T00:00:00Z`)) || dto.dob > day) throw new BadRequestException('Enter a date of birth in the past.');
    const age = ageOn(dto.dob, day);
    if (age > 100) throw new BadRequestException('Check the date of birth.');
    const r = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const cand = await tx.candidate.findFirst({ where: { id: candidateId, organizationId: org, mergedIntoId: null }, select: { id: true, erasedAt: true } });
      if (!cand) throw new NotFoundException('Candidate not found.');
      if (cand.erasedAt) throw new ConflictException('This candidate was erased.');
      const rule = await minorRule(tx, day);
      const minor = Boolean(rule && age < rule.minAge);
      if (minor && (!dto.guardianName?.trim() || !dto.guardianEmail?.trim())) throw new BadRequestException(`Under ${rule!.minAge}: enter the parent or guardian's name and email.`);
      await tx.candidate.update({ where: { id: candidateId }, data: { dobSealed: sealDob(org, candidateId, dto.dob) } });
      // The date itself never goes in the audit (Special data).
      await audit(tx, c, 'ats.candidate.dob_recorded', 'candidate', candidateId, { minor });
      if (!minor) return { minor: false as const };
      const g = await this.newGuardian(tx, c, candidateId, dto.guardianName!.trim(), dto.guardianEmail!.trim().toLowerCase());
      return { minor: true as const, guardian: g, minAge: rule!.minAge };
    });
    if (r.minor) await this.askGuardian(r.guardian.organizationId, r.guardian.id);
    return { minor: r.minor, guardian: r.minor ? 'pending' : null };
  }

  private async newGuardian(tx: Tx, c: CompanyContext, candidateId: string, name: string, email: string) {
    const g = await tx.guardianConsent.create({ data: { organizationId: c.organizationId, candidateId, guardianName: name, guardianEmail: email, token: token(), askedBy: c.userId ?? null } });
    await audit(tx, c, 'ats.candidate.guardian_asked', 'candidate', candidateId);
    return g;
  }

  private async askGuardian(org: string, id: string) {
    const g = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => tx.guardianConsent.findFirstOrThrow({ where: { id } }));
    const cand = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => tx.candidate.findFirstOrThrow({ where: { id: g.candidateId }, select: { name: true } }));
    const company = await this.prisma.organization.findUnique({ where: { id: org }, select: { name: true } });
    return this.mail(
      org,
      g.guardianEmail,
      `Your consent is needed for ${cand.name}'s job application`,
      `Hello ${g.guardianName},\n\n${cand.name} has applied for a job at ${company?.name ?? 'our company'}. As they are under 18, we need the consent of a parent or lawful guardian before we go further with the application or make an offer.\n\nRead what we keep and choose: ${FRONTEND()}/consent/guardian/${g.token}\n\nIf you are not ${cand.name}'s parent or guardian, please ignore this email.`,
    );
  }

  /** Sends the guardian email again (a new link; the old one stops working). */
  async resendGuardian(ctx: TenantContext, candidateId: string) {
    const g = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await minorState(tx, c.organizationId, candidateId, todayIst());
      if (!(await tx.candidate.findFirst({ where: { id: candidateId, organizationId: c.organizationId }, select: { id: true } }))) throw new NotFoundException('Candidate not found.');
      if (!s.minor) throw new ConflictException('No guardian consent is needed for this candidate.');
      if (s.guardian === 'given') throw new ConflictException('The guardian has already consented.');
      const last = await tx.guardianConsent.findFirst({ where: { organizationId: c.organizationId, candidateId }, orderBy: { askedAt: 'desc' } });
      if (!last) throw new ConflictException('Record the date of birth with the guardian first.');
      if (Date.now() - last.askedAt.getTime() < DAY && last.status === 'pending') throw new ConflictException('The guardian email went less than a day ago. Send it again tomorrow.');
      await tx.guardianConsent.updateMany({ where: { organizationId: c.organizationId, candidateId, status: 'pending' }, data: { status: 'declined', answeredAt: new Date() } });
      return this.newGuardian(tx, c, candidateId, last.guardianName, last.guardianEmail);
    });
    const ok = await this.askGuardian(g.organizationId, g.id);
    if (!ok) throw new ConflictException('The email could not be sent. Check the company email settings.');
    return { sent: true };
  }

  private async guardianByToken(t: string) {
    if (!/^[0-9a-f]{64}$/.test(t)) throw new NotFoundException('This link is not valid.');
    const g = await this.tenantPrisma.forTenant(LOOKUP, (tx) => tx.guardianConsent.findUnique({ where: { token: t } }));
    if (!g || g.status !== 'pending') throw new NotFoundException('This link is not valid any more.');
    return g;
  }

  async guardianPage(t: string) {
    const g = await this.guardianByToken(t);
    const company = await this.prisma.organization.findUnique({ where: { id: g.organizationId }, select: { name: true } });
    const cand = await this.tenantPrisma.forTenant({ organizationId: g.organizationId, isSuperAdmin: false }, (tx) => tx.candidate.findFirst({ where: { id: g.candidateId }, select: { name: true } }));
    return { orgName: company?.name ?? '', candidateName: cand?.name ?? '', guardianName: g.guardianName };
  }

  async answerGuardian(t: string, agree: boolean) {
    const g = await this.guardianByToken(t);
    const sys: CompanyContext = { organizationId: g.organizationId, isSuperAdmin: false, userId: null };
    return this.tenantPrisma.forTenant(sys, async (tx) => {
      await tx.guardianConsent.update({ where: { id: g.id }, data: { status: agree ? 'given' : 'declined', answeredAt: new Date() } });
      await audit(tx, sys, agree ? 'ats.candidate.guardian_consented' : 'ats.candidate.guardian_declined', 'candidate', g.candidateId);
      return { agreed: agree };
    });
  }
}
