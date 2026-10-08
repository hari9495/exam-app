import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import {
  CompanyLook,
  EMAIL_TYPES,
  EmailType,
  EmailTypeDef,
  RenderedEmail,
  VARIABLE_LABELS,
  accountLockedEmail,
  action,
  adminAlertEmail,
  appUrl,
  codeEmail,
  details,
  inviteEmail,
  isEmailType,
  newSignInEmail,
  passwordBreachedEmail,
  passwordResetEmail,
  securityChangeEmail,
  text,
} from '../email/account-emails';
import { EmailLookService } from '../email/email-look.service';
import { EmailService } from '../email/email.service';
import { WORDING_FIELDS, Wording, checkField, contrastWithWhite } from '../email/email-wording';
import { BrandingDto, WordingDto } from './dto';

const LANGUAGE = 'en'; // English now (P04 Q4: one template per language).
const MIN_CONTRAST = 4.5; // WCAG AA, white button text on the accent.

type Branding = { showLogo: boolean; accentColor: string | null; senderName: string | null; replyTo: string | null };
const NO_BRANDING: Branding = { showLogo: true, accentColor: null, senderName: null, replyTo: null };

/** Wording problems per field, for the editor. Empty when it can be saved. */
export function wordingProblems(type: EmailType, w: Wording): Partial<Record<keyof Wording, string>> {
  const d: EmailTypeDef = EMAIL_TYPES[type];
  const problems: Partial<Record<keyof Wording, string>> = {};
  for (const f of WORDING_FIELDS) {
    if (f === 'buttonLabel' && !d.button) {
      if (w.buttonLabel) problems.buttonLabel = 'This email has no button.';
      continue;
    }
    const problem = checkField(f, w[f], d.variables, f === 'subject' || f === 'heading' || f === 'buttonLabel');
    if (problem) problems[f] = problem;
  }
  return problems;
}

/** The branding as stored, or the reasons it can't be. */
export function brandingProblems(b: BrandingDto): { value: Branding; problems: Partial<Record<keyof Branding, string>> } {
  const problems: Partial<Record<keyof Branding, string>> = {};
  const accentColor = b.accentColor ? b.accentColor.toUpperCase() : null;
  if (accentColor && contrastWithWhite(accentColor) < MIN_CONTRAST) problems.accentColor = 'White button text is hard to read on this colour. Choose a darker one.';
  const senderName = b.senderName?.replace(/\s+/g, ' ').trim() || null;
  if (senderName) {
    if (senderName.length < 2) problems.senderName = 'Use at least 2 characters.';
    else if (!/^[\p{L}\p{N} &'.,()-]+$/u.test(senderName)) problems.senderName = 'Use letters, numbers, spaces and & \' . , ( ) - only.';
    else if (/yukthi/i.test(senderName)) problems.senderName = '"via YukthiX" is added for you. Use your company’s own name.';
  }
  const replyTo = b.replyTo?.trim().toLowerCase() || null;
  return { value: { showLogo: b.showLogo, accentColor, senderName, replyTo }, problems };
}

const invalid = (problems: object) => {
  if (Object.keys(problems).length) throw new BadRequestException({ statusCode: 400, message: 'Some fields need changes.', errors: problems });
};

const SAMPLE_LINK = appUrl('/yx/reset-password/sample-link');
const SAMPLE_FACTS = { when: new Date(), timeZone: 'Asia/Kolkata', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36', country: 'IN', ip: '203.0.113.9' };

/** The real email, with sample facts, so the preview is exactly what people get. */
function sampleEmail(type: EmailType, base: { to: string; company: string; firstName: string | null; look: CompanyLook }): Promise<RenderedEmail> {
  switch (type) {
    case 'sign_in_code':
    case 'verification_code':
    case 'mobile_code':
      return codeEmail({ ...base, code: '532112', minutes: 5, purpose: type === 'sign_in_code' ? 'sign_in' : type === 'verification_code' ? 'mfa' : 'mobile' });
    case 'invite':
      return inviteEmail({ ...base, link: SAMPLE_LINK, minutes: 15 });
    case 'password_reset':
      return passwordResetEmail({ ...base, link: SAMPLE_LINK, minutes: 15 });
    case 'password_breached':
      return passwordBreachedEmail(base);
    case 'new_sign_in':
    case 'new_country_sign_in':
      return newSignInEmail({ ...base, facts: SAMPLE_FACTS, newCountry: type === 'new_country_sign_in' });
    case 'account_locked':
      return accountLockedEmail({ ...base, facts: SAMPLE_FACTS, lockedForSeconds: 15 * 60 });
    case 'security_change':
      return securityChangeEmail({ ...base, subject: 'A passkey was removed from your YukthiX account', what: 'A passkey was removed from your account.', when: new Date(), timeZone: 'Asia/Kolkata' });
    default:
      return adminAlertEmail(type, { ...base, facts: SAMPLE_ALERTS[type] });
  }
}

const SAMPLE_ALERTS: Record<string, ReturnType<typeof text>[]> = {
  break_glass_used: [text('The break-glass account rescue@kaveri.example just signed in with a password while SSO-only is on.'), details([['IP address', '203.0.113.9'], ['Device', 'Chrome on Windows']]), text("If this wasn't expected, review Login activity and sign out that session."), action(appUrl('/yx/admin/login-activity'))],
  break_glass_failures: [text('Someone has repeatedly failed to sign in to the break-glass account rescue@kaveri.example.'), details([['IP address', '203.0.113.9']]), text('Review Login activity to see where the attempts came from.'), action(appUrl('/yx/admin/login-activity'))],
  sso_changed: [text('The Microsoft Entra ID sign-in provider was changed.'), details([['When', '8 Oct 2026, 10:15 am IST']]), text("If this wasn't expected, review the Single Sign-On settings and the audit log now."), action(appUrl('/yx/settings/security'))],
  domain_lapsed: [text("We couldn't find the TXT record that proves your organisation owns kaveri.example in 3 checks in a row."), text('People with an @kaveri.example email are no longer sent straight to your identity provider.'), action(appUrl('/yx/settings/security'))],
  support_requested: [text('Anand Iyer from YukthiX support asks to look at your company for up to 4 hours. Nothing is visible until a System Admin approves.'), details([['Reason', 'Payroll stuck at readiness']]), text('Pay, identity and bank details stay hidden. The session is read-only and everything done is listed for you.'), action(appUrl('/yx/settings/support-access'))],
  sms_limit_reached: [text('Your organisation has sent its limit of 1000 text messages this month.'), text('Until next month, one-time codes go by email where the sign-in allows it.')],
};

// Settings › Notifications › Email (P04 Q5, §4 Editing & Branding). Every change is audited with before / after.
@Injectable()
export class EmailTemplatesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly looks: EmailLookService,
    private readonly email: EmailService,
  ) {}

  private org(ctx: TenantContext): string {
    if (!ctx.organizationId) throw new ForbiddenException('Email templates belong to a company');
    return ctx.organizationId;
  }

  private type(type: string): EmailType {
    if (!isEmailType(type)) throw new NotFoundException('No such email');
    return type;
  }

  async overview(ctx: TenantContext) {
    const organizationId = this.org(ctx);
    const [[org, branding, rows], logoUrl] = await Promise.all([
      this.tenantPrisma.forTenant(ctx, (tx) =>
        Promise.all([
          tx.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
          tx.emailBranding.findUnique({ where: { organizationId } }),
          tx.emailTemplateOverride.findMany({ where: { organizationId, language: LANGUAGE } }),
        ]),
      ),
      this.looks.logoOf(organizationId),
    ]);
    const custom = new Map(rows.map((r) => [r.type, r]));
    return {
      companyName: org?.name ?? '',
      /** The company logo (Settings › Branding), whether or not emails show it. */
      logoUrl,
      branding: branding ? { showLogo: branding.showLogo, accentColor: branding.accentColor, senderName: branding.senderName, replyTo: branding.replyTo } : NO_BRANDING,
      variables: VARIABLE_LABELS,
      emails: (Object.entries(EMAIL_TYPES) as [EmailType, EmailTypeDef][]).map(([type, d]) => {
        const row = custom.get(type);
        return {
          type,
          group: d.group,
          name: d.name,
          sentWhen: d.sentWhen,
          button: d.button,
          variables: d.variables,
          locked: d.locked,
          defaults: d.defaults,
          custom: row ? { subject: row.subject, heading: row.heading, intro: row.intro, buttonLabel: row.buttonLabel, footer: row.footer } : null,
          updatedAt: row?.updatedAt ?? null,
        };
      }),
    };
  }

  async saveBranding(ctx: TenantContext, actorUserId: string, dto: BrandingDto) {
    const organizationId = this.org(ctx);
    const { value, problems } = brandingProblems(dto);
    invalid(problems);
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const before = await tx.emailBranding.findUnique({ where: { organizationId } });
      await tx.emailBranding.upsert({ where: { organizationId }, create: { organizationId, ...value, updatedBy: actorUserId }, update: { ...value, updatedBy: actorUserId } });
      await AuditService.recordIn(tx, ctx, {
        actorUserId,
        action: 'notification.email_branding.updated',
        entityType: 'email_branding',
        entityId: organizationId,
        metadata: { before: before ? { showLogo: before.showLogo, accentColor: before.accentColor, senderName: before.senderName, replyTo: before.replyTo } : NO_BRANDING, after: value },
      });
    });
    return this.overview(ctx);
  }

  async saveTemplate(ctx: TenantContext, actorUserId: string, rawType: string, dto: WordingDto) {
    const organizationId = this.org(ctx);
    const type = this.type(rawType);
    const wording: Wording = { subject: dto.subject.trim(), heading: dto.heading.trim(), intro: dto.intro.trim(), buttonLabel: dto.buttonLabel.trim(), footer: dto.footer.trim() };
    invalid(wordingProblems(type, wording));
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const key = { organizationId_type_language: { organizationId, type, language: LANGUAGE } };
      const before = await tx.emailTemplateOverride.findUnique({ where: key });
      const row = await tx.emailTemplateOverride.upsert({ where: key, create: { organizationId, type, language: LANGUAGE, ...wording, updatedBy: actorUserId }, update: { ...wording, updatedBy: actorUserId } });
      await AuditService.recordIn(tx, ctx, {
        actorUserId,
        action: 'notification.email_template.updated',
        entityType: 'email_template',
        entityId: row.id,
        metadata: { type, language: LANGUAGE, before: before ? pick(before) : null, after: wording },
      });
    });
    return this.overview(ctx);
  }

  async resetTemplate(ctx: TenantContext, actorUserId: string, rawType: string) {
    const organizationId = this.org(ctx);
    const type = this.type(rawType);
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const before = await tx.emailTemplateOverride.findUnique({ where: { organizationId_type_language: { organizationId, type, language: LANGUAGE } } });
      if (!before) return;
      await tx.emailTemplateOverride.delete({ where: { id: before.id } });
      await AuditService.recordIn(tx, ctx, { actorUserId, action: 'notification.email_template.reset', entityType: 'email_template', entityId: before.id, metadata: { type, language: LANGUAGE, before: pick(before) } });
    });
    return this.overview(ctx);
  }

  /** The email exactly as people would get it, with the draft wording (and draft branding, if given). */
  async preview(ctx: TenantContext, actorUserId: string, rawType: string, draft: { wording: WordingDto; branding?: BrandingDto }): Promise<RenderedEmail & { to: string }> {
    const organizationId = this.org(ctx);
    const type = this.type(rawType);
    const wording: Wording = { subject: draft.wording.subject, heading: draft.wording.heading, intro: draft.wording.intro, buttonLabel: draft.wording.buttonLabel, footer: draft.wording.footer };
    invalid(wordingProblems(type, wording));
    const [saved, me] = await Promise.all([
      this.looks.forCompany(organizationId, type),
      this.tenantPrisma.forTenant(ctx, (tx) => tx.user.findUnique({ where: { id: actorUserId }, select: { email: true, name: true, organization: { select: { name: true } } } })),
    ]);
    if (!me) throw new NotFoundException('Account not found');
    let look: CompanyLook = { ...(saved ?? { logoUrl: null, accentColor: null, senderName: null, replyTo: null }), wording };
    if (draft.branding) {
      const { value, problems } = brandingProblems(draft.branding);
      invalid(problems);
      look = { ...look, ...value, logoUrl: value.showLogo ? await this.looks.logoOf(organizationId) : null };
    }
    const mail = await sampleEmail(type, { to: me.email, company: me.organization?.name ?? '', firstName: me.name, look });
    return { ...mail, to: me.email };
  }

  /** "Send me a test": the draft, to the signed-in admin's own address only. */
  async sendTest(ctx: TenantContext, actorUserId: string, rawType: string, draft: { wording: WordingDto; branding?: BrandingDto }) {
    const mail = await this.preview(ctx, actorUserId, rawType, draft);
    const result = await this.email.send({ ...mail, subject: `Test: ${mail.subject}`, organizationId: this.org(ctx) });
    if (!result.success) throw new BadRequestException('The test email could not be sent. Try again in a moment.');
    return { to: mail.to };
  }
}

const pick = (r: Wording) => ({ subject: r.subject, heading: r.heading, intro: r.intro, buttonLabel: r.buttonLabel, footer: r.footer });
