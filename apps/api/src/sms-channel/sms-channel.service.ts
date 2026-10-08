import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { adminAlertEmail, text } from '../email/account-emails';
import { EmailLookService } from '../email/email-look.service';
import { assertPublicHttpsHost, publicHttpsFetch } from '../common/ssrf';
import { SmsFetch, SmsProviderAdapter, getChannelProvider } from '../sms/providers';
import { normaliseMobileNumber } from '../auth/otp.service';
import { CallbackRequest, callbackFor, parseCallback, verifyCallback } from './sms-callbacks';
import { DEV_OTP_TEMPLATE, SmsTemplate, TemplateVariable, renderTemplate, smsSegments, templateProblem } from './sms-templates';

// P04 SMS channel (§4.4, §4.5a; YX-NTF-07/10/11/12/13/14), provider-agnostic. One send:
//   claim the idempotency key (a retried job is a no-op) -> consent -> routes (the company's accounts by
//   priority, then the YukthiX shared account when the company allows it) -> approved DLT template ->
//   monthly cap -> try each route; retry only when the gateway was never reached; stop at once when the
//   message may already have arrived. Anything that can't go by SMS returns a fallback reason, which the
//   caller turns into an email where its flow allows one. Every step is in notification_deliveries.

/** The outbound network for 'http' gateways: DNS-checked at save, address-pinned at send. Tests swap it. */
export interface SmsGatewayNet {
  assertPublicUrl(url: URL): Promise<void>;
  fetch: SmsFetch;
}
export const SMS_GATEWAY_NET = 'SMS_GATEWAY_NET';
export const PUBLIC_GATEWAY_NET: SmsGatewayNet = { assertPublicUrl: assertPublicHttpsHost, fetch: publicHttpsFetch };

export const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
export const tenantCtx = (organizationId: string | null): TenantContext => (organizationId ? { organizationId, isSuperAdmin: false } : SUPER);

export type FallbackReason = 'no_channel_consent' | 'no_sms_account' | 'no_approved_template' | 'over_monthly_cap' | 'all_providers_failed';
export type SmsOutcome =
  | { status: 'sent'; deliveryId: string }
  | { status: 'fallback'; reason: FallbackReason; deliveryId: string }
  | { status: 'unknown'; deliveryId: string }
  | { status: 'duplicate' };

export interface OtpSmsSend {
  organizationId: string | null;
  /** E.164. */
  to: string;
  code: string;
  /** Short label for the {#var#} "purpose", e.g. "sign-in code". */
  purpose: string;
  minutes: number;
  /** Same for every retry of this send (YX-NTF-02). */
  idempotencyKey: string;
  recipientUserId: string;
  /** The person asked for this code on SMS (YX-NTF-14: that is an authentication-only opt-in). */
  requestedOnChannel: boolean;
  kind?: 'otp' | 'test';
  /** Admin test: this account only, no failover. */
  onlyAccountId?: string;
}

interface Route {
  id: string | null;
  name: string;
  provider: string;
  adapter: SmsProviderAdapter;
  config: Record<string, unknown>;
  sender: string | null;
  dltEntityId: string | null;
  template: SmsTemplate | null;
  problem: string | null;
}

export const SMS_RETRIES = 2;
export const OTP_CONSENT_TEXT_VERSION = 'otp-request-v1';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The billing month in India (IST), as YYYY-MM-01. */
export function smsMonth(at = new Date()): string {
  const ist = new Date(at.getTime() + 330 * 60_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export const maskAddress = (e164: string) => `${e164.slice(0, 3)}${'•'.repeat(Math.max(0, e164.length - 5))}${e164.slice(-2)}`;

@Injectable()
export class SmsChannelService {
  private readonly logger = new Logger(SmsChannelService.name);
  /** Backoff before retry n (ms). */
  backoff = (attempt: number) => 250 * 3 ** attempt;

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly email: EmailService,
    @Inject(SMS_GATEWAY_NET) private readonly net: SmsGatewayNet,
    private readonly looks: EmailLookService,
  ) {}

  addressHash(e164: string): string {
    return this.crypto.hmac('sms-address', e164);
  }

  decryptConfig(blob: string): Record<string, unknown> {
    return JSON.parse(this.crypto.decrypt(blob)) as Record<string, unknown>;
  }

  async sendOtp(req: OtpSmsSend): Promise<SmsOutcome> {
    const ctx = tenantCtx(req.organizationId);
    const addressHash = this.addressHash(req.to);
    let deliveryId: string;
    try {
      deliveryId = (
        await this.tenantPrisma.forTenant(ctx, (tx) =>
          tx.notificationDelivery.create({
            data: { organizationId: req.organizationId, channel: 'sms', kind: req.kind ?? 'otp', idempotencyKey: req.idempotencyKey, addressMasked: maskAddress(req.to), addressHash },
            select: { id: true },
          }),
        )
      ).id;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return { status: 'duplicate' };
      throw error;
    }
    const finish = (data: Prisma.NotificationDeliveryUncheckedUpdateInput) =>
      this.tenantPrisma.forTenant(ctx, (tx) => tx.notificationDelivery.update({ where: { id: deliveryId }, data }));
    const fallback = async (reason: FallbackReason, detail: string | null, data: Prisma.NotificationDeliveryUncheckedUpdateInput = {}): Promise<SmsOutcome> => {
      await finish({ ...data, status: 'fallback', error: (detail ? `${reason}: ${detail}` : reason).slice(0, 500) });
      this.logger.warn(`SMS ${deliveryId} not sent (${reason})`);
      return { status: 'fallback', reason, deliveryId };
    };

    if (!(await this.hasConsent(ctx, req, addressHash))) return fallback('no_channel_consent', null);

    const policy = await this.policy(req.organizationId);
    const routes = await this.routes(req.organizationId, policy.smsSharedAccount, req.onlyAccountId);
    if (!routes.length) return fallback('no_sms_account', null);
    const usable = routes.filter((r) => !r.problem);
    if (!usable.length) return fallback('no_approved_template', routes.map((r) => `${r.name}: ${r.problem}`).join('; '));

    if (req.organizationId && !(await this.reserveUnit(req.organizationId, policy.smsMonthlyCap))) {
      this.alertCapReached(req.organizationId, policy.smsMonthlyCap ?? 0);
      return fallback('over_monthly_cap', null);
    }

    const values: Record<TemplateVariable, string> = { code: req.code, purpose: req.purpose, minutes: String(req.minutes), app: 'YukthiX' };
    const errors: string[] = [];
    let attempts = 0;
    for (const route of usable) {
      const { text, vars } = renderTemplate(route.template!, values);
      const args = { to: req.to, body: text, sender: route.sender, dltEntityId: route.dltEntityId, dltTemplateId: route.template!.dltTemplateId ?? null, vars, idempotencyKey: req.idempotencyKey };
      for (let attempt = 0; ; attempt++) {
        attempts++;
        const result = await route.adapter.send(route.config, args, route.provider === 'http' ? this.net.fetch : undefined);
        const where = { channelAccountId: route.id, provider: route.provider, attempts };
        if (result.ok) {
          await finish({ ...where, status: 'sent', providerMsgId: result.providerMsgId ?? null, costUnits: smsSegments(text), sentAt: new Date(), error: errors.length ? errors.join('; ').slice(0, 500) : null });
          return { status: 'sent', deliveryId };
        }
        errors.push(`${route.name}: ${result.error ?? 'failed'}`);
        // It may already have arrived: never send the code again, by any route (the unit stays counted).
        if (result.failure === 'unknown') {
          await finish({ ...where, status: 'unknown', error: errors.join('; ').slice(0, 500) });
          this.logger.warn(`SMS ${deliveryId}: outcome unknown, not resent`);
          return { status: 'unknown', deliveryId };
        }
        if (result.failure !== 'unavailable' || attempt >= SMS_RETRIES) break;
        await sleep(this.backoff(attempt));
      }
    }
    if (req.organizationId) await this.releaseUnit(req.organizationId);
    return fallback('all_providers_failed', errors.join('; '), { attempts });
  }

  // ---- consent (YX-NTF-14) --------------------------------------------------------------------

  private hasConsent(ctx: TenantContext, req: OtpSmsSend, addressHash: string): Promise<boolean> {
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const active = await tx.channelConsent.findFirst({
        where: { organizationId: req.organizationId, recipientType: 'user', recipientId: req.recipientUserId, channel: 'sms', addressHash, withdrawnAt: null },
        select: { id: true },
      });
      if (active) return true;
      if (!req.requestedOnChannel) return false;
      // Asking for a code by SMS is itself the opt-in, for authentication messages only (APX-A §5.4).
      await tx.channelConsent.create({
        data: {
          organizationId: req.organizationId,
          recipientType: 'user',
          recipientId: req.recipientUserId,
          channel: 'sms',
          addressHash,
          addressMasked: maskAddress(req.to),
          scope: 'authentication_only',
          source: req.kind === 'test' ? 'sms_test' : 'otp_prompt',
          textVersion: OTP_CONSENT_TEXT_VERSION,
          language: 'en',
          capturedBy: req.recipientUserId,
          evidence: { purpose: req.purpose },
        },
      });
      return true;
    });
  }

  /** Stops SMS to an address (STOP, provider opt-out): every active opt-in for it is withdrawn (YX-NTF-11). */
  withdrawConsents(ctx: TenantContext, organizationId: string | null | undefined, addressHash: string, source: 'provider_callback' | 'stop_keyword'): Promise<number> {
    return this.tenantPrisma.forTenant(ctx, async (tx) =>
      (
        await tx.channelConsent.updateMany({
          where: { ...(organizationId !== undefined ? { organizationId } : {}), channel: 'sms', addressHash, withdrawnAt: null },
          data: { withdrawnAt: new Date(), withdrawalSource: source },
        })
      ).count,
    );
  }

  // ---- routes ---------------------------------------------------------------------------------

  async policy(organizationId: string | null): Promise<{ smsSharedAccount: boolean; smsMonthlyCap: number | null }> {
    if (!organizationId) return { smsSharedAccount: true, smsMonthlyCap: null };
    const row = await this.tenantPrisma.forTenant(tenantCtx(organizationId), (tx) => tx.tenantNotificationPolicy.findUnique({ where: { organizationId } }));
    return { smsSharedAccount: row?.smsSharedAccount ?? true, smsMonthlyCap: row?.smsMonthlyCap ?? null };
  }

  /** The company's active accounts by priority, then the shared account(s) when allowed. */
  private async routes(organizationId: string | null, sharedAllowed: boolean, onlyAccountId?: string): Promise<Route[]> {
    const select = { id: true, organizationId: true, name: true, provider: true, configEncrypted: true, sender: true, dltEntityId: true, templates: true };
    const active = { channel: 'sms', status: 'active', ...(onlyAccountId ? { id: onlyAccountId } : {}) };
    const order = [{ priority: 'asc' as const }, { createdAt: 'asc' as const }];
    const own = organizationId
      ? await this.tenantPrisma.forTenant(tenantCtx(organizationId), (tx) => tx.channelAccount.findMany({ where: { ...active, organizationId }, orderBy: order, select }))
      : [];
    // The shared account is platform-only data: read with the platform context, never the tenant's.
    const useShared = (sharedAllowed || !organizationId) && (!onlyAccountId || !organizationId);
    const shared = useShared ? await this.tenantPrisma.forTenant(SUPER, (tx) => tx.channelAccount.findMany({ where: { ...active, organizationId: null }, orderBy: order, select })) : [];

    const routes: Route[] = [];
    for (const row of [...own, ...shared]) {
      const adapter = getChannelProvider(row.provider);
      let config: Record<string, unknown> = {};
      let problem: string | null = adapter ? null : `unknown provider ${row.provider}`;
      try {
        config = this.decryptConfig(row.configEncrypted);
        adapter?.validateConfig(config);
      } catch {
        problem ??= 'configuration is not valid';
      }
      const template = ((row.templates as Record<string, unknown> | null)?.otp ?? null) as SmsTemplate | null;
      problem ??= templateProblem(template, Boolean(row.dltEntityId));
      routes.push({ id: row.id, name: row.organizationId ? row.name : 'YukthiX shared', provider: row.provider, adapter: adapter!, config, sender: row.sender, dltEntityId: row.dltEntityId, template, problem });
    }
    // Local development and tests: without a configured shared account, a built-in dev sink stands in.
    if (useShared && !shared.length && process.env.NODE_ENV !== 'production' && !onlyAccountId) {
      routes.push({ id: null, name: 'YukthiX shared (development)', provider: 'dev', adapter: getChannelProvider('dev')!, config: {}, sender: 'YKTHIX', dltEntityId: null, template: DEV_OTP_TEMPLATE, problem: null });
    }
    return routes;
  }

  /** True when a company (or the platform) has somewhere to send SMS at all. */
  async hasRoute(organizationId: string | null): Promise<boolean> {
    const policy = await this.policy(organizationId);
    return (await this.routes(organizationId, policy.smsSharedAccount)).some((r) => !r.problem);
  }

  // ---- metering (YX-NTF-12) -------------------------------------------------------------------

  /** Reserves one SMS against the month's cap, atomically. False when the cap is reached. */
  private reserveUnit(organizationId: string, cap: number | null): Promise<boolean> {
    const month = smsMonth();
    return this.tenantPrisma.forTenant(tenantCtx(organizationId), async (tx) => {
      await tx.$executeRaw`INSERT INTO sms_usage_monthly (organization_id, month, sent_count) VALUES (${organizationId}::uuid, ${month}::date, 0) ON CONFLICT DO NOTHING`;
      const updated = await tx.$executeRaw`UPDATE sms_usage_monthly SET sent_count = sent_count + 1
        WHERE organization_id = ${organizationId}::uuid AND month = ${month}::date AND (${cap}::int IS NULL OR sent_count < ${cap}::int)`;
      return updated === 1;
    });
  }

  private async releaseUnit(organizationId: string): Promise<void> {
    const month = smsMonth();
    await this.tenantPrisma.forTenant(tenantCtx(organizationId), (tx) =>
      tx.$executeRaw`UPDATE sms_usage_monthly SET sent_count = sent_count - 1 WHERE organization_id = ${organizationId}::uuid AND month = ${month}::date AND sent_count > 0`,
    );
  }

  async usage(organizationId: string): Promise<{ month: string; sent: number }> {
    const month = smsMonth();
    const row = await this.tenantPrisma.forTenant(tenantCtx(organizationId), (tx) =>
      tx.smsUsageMonthly.findUnique({ where: { organizationId_month: { organizationId, month: new Date(`${month}T00:00:00Z`) } } }),
    );
    return { month, sent: row?.sentCount ?? 0 };
  }

  // Over the cap: the company's admins hear about it once a month (the first refused send claims it).
  private alertCapReached(organizationId: string, cap: number): void {
    const month = smsMonth();
    const ctx = tenantCtx(organizationId);
    this.tenantPrisma
      .forTenant(ctx, async (tx) => {
        await tx.$executeRaw`INSERT INTO sms_usage_monthly (organization_id, month, sent_count) VALUES (${organizationId}::uuid, ${month}::date, 0) ON CONFLICT DO NOTHING`;
        const first = await tx.$executeRaw`UPDATE sms_usage_monthly SET cap_alerted_at = now()
          WHERE organization_id = ${organizationId}::uuid AND month = ${month}::date AND cap_alerted_at IS NULL`;
        return first === 1
          ? tx.user.findMany({ where: { organizationId, role: 'org_admin', status: 'active' }, select: { email: true, name: true, organization: { select: { name: true } } } })
          : [];
      })
      .then(async (admins) => {
        const look = admins.length ? await this.looks.forCompany(organizationId, 'sms_limit_reached') : null;
        for (const admin of admins) {
          const mail = await adminAlertEmail('sms_limit_reached', {
            to: admin.email,
            company: admin.organization?.name,
            firstName: admin.name,
            look,
            facts: [
              text(`Your organisation has sent its limit of ${cap} text messages this month.`),
              text('Until next month, one-time codes go by email where the sign-in allows it. You can change the limit in Settings › Notifications › SMS.'),
            ],
          });
          void this.email.send({ to: admin.email, organizationId, ...mail });
        }
      })
      .catch((error) => this.logger.error(`Could not alert the admins of ${organizationId} about the SMS limit`, error as Error));
  }

  // ---- provider callbacks (YX-NTF-10/11) ------------------------------------------------------

  /** A delivery-status / opt-out callback for one account. 401 for an unknown account or a bad secret. */
  async handleCallback(accountId: string, req: CallbackRequest): Promise<{ updated: number }> {
    const account = await this.tenantPrisma.forTenant(SUPER, (tx) =>
      tx.channelAccount.findUnique({ where: { id: accountId }, select: { id: true, organizationId: true, provider: true, configEncrypted: true } }),
    );
    let config: Record<string, unknown> = {};
    try {
      if (account) config = this.decryptConfig(account.configEncrypted);
    } catch {
      config = {};
    }
    const callback = account ? callbackFor(account.provider, config.callback) : null;
    if (!account || !callback || !verifyCallback(callback, config.callbackSecret, req)) throw new UnauthorizedException();

    // The account's own tenant context: a callback can only ever touch its own company's rows, and only
    // deliveries this account sent (the shared account's deliveries span companies: platform context,
    // still pinned to this account).
    const ctx = tenantCtx(account.organizationId);
    let updated = 0;
    for (const event of parseCallback(callback, req)) {
      if (event.messageId && event.outcome) {
        const delivery = await this.tenantPrisma.forTenant(ctx, (tx) =>
          tx.notificationDelivery.findFirst({ where: { channelAccountId: account.id, providerMsgId: event.messageId }, select: { id: true, organizationId: true, addressHash: true, status: true } }),
        );
        if (delivery && ['sent', 'unknown', 'delivered', 'failed'].includes(delivery.status)) {
          const status = event.outcome === 'opted_out' ? 'opted_out' : event.outcome;
          await this.tenantPrisma.forTenant(ctx, (tx) =>
            tx.notificationDelivery.update({ where: { id: delivery.id }, data: { status, ...(status === 'delivered' ? { deliveredAt: new Date() } : {}) } }),
          );
          updated++;
          if (event.outcome === 'opted_out') await this.withdrawConsents(ctx, delivery.organizationId, delivery.addressHash, 'provider_callback');
        }
      } else if (event.outcome === 'opted_out' && event.address) {
        const number = normaliseMobileNumber(event.address.startsWith('+') ? event.address : `+${event.address}`) ?? normaliseMobileNumber(event.address);
        if (number) updated += await this.withdrawConsents(ctx, account.organizationId ?? undefined, this.addressHash(number), 'stop_keyword');
      }
    }
    return { updated };
  }
}
