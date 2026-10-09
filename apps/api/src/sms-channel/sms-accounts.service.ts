import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt, randomUUID } from 'crypto';
import { AuditService, OrgSecretsCryptoService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { getChannelProvider } from '../sms/providers';
import { callbackConfigError } from './sms-callbacks';
import { SMS_GATEWAY_NET, SUPER, SmsChannelService, SmsGatewayNet, smsMonth } from './sms-channel.service';
import { SmsTemplate, TEMPLATE_VARIABLES, templateShapeError } from './sms-templates';
import { CreateSmsAccountDto, UpdateSmsAccountDto, UpdateSmsPolicyDto } from './dto';

// Settings › Notifications › SMS (P04 §7). A company uses the YukthiX shared account (default) or adds its
// own gateway accounts (its own DLT registration); the platform (super admin, no organisation) manages the
// shared account through the same endpoints. Secrets are write-only: no response, log or audit entry ever
// carries one.

/** Top-level secret fields; every other secret name is an http {secret.name}. */
const TOP_SECRETS = ['authToken', 'authHeader', 'callbackSecret'] as const;
const NOT_IN_CONFIG = new Set<string>([...TOP_SECRETS, 'secrets']);

export interface SmsAccountView {
  id: string;
  name: string;
  provider: string;
  sender: string | null;
  dltEntityId: string | null;
  priority: number;
  status: string;
  /** Non-secret settings only. */
  config: Record<string, unknown>;
  /** Names of the secrets that are set ("authToken", "secret.authkey"); never their values. */
  secretsSet: string[];
  otpTemplate: unknown;
  /** Where the gateway posts delivery reports. */
  callbackUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

export function callbackUrlFor(accountId: string): string {
  return `${(process.env.API_ORIGIN ?? 'http://localhost:3001').replace(/\/$/, '')}/api/v1/notifications/sms/callbacks/${accountId}`;
}

/** The account as the browser may see it: secrets reduced to their names. */
export function accountView(row: { id: string; name: string; provider: string; sender: string | null; dltEntityId: string | null; priority: number; status: string; templates: Prisma.JsonValue; createdAt: Date; updatedAt: Date }, config: Record<string, unknown>): SmsAccountView {
  const visible = Object.fromEntries(Object.entries(config).filter(([key]) => !NOT_IN_CONFIG.has(key)));
  const secretsSet = [
    ...TOP_SECRETS.filter((key) => typeof config[key] === 'string' && config[key] !== ''),
    ...Object.keys(isRecord(config.secrets) ? config.secrets : {}).map((name) => `secret.${name}`),
  ];
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    sender: row.sender,
    dltEntityId: row.dltEntityId,
    priority: row.priority,
    status: row.status,
    config: visible,
    secretsSet,
    otpTemplate: isRecord(row.templates) ? (row.templates.otp ?? null) : null,
    callbackUrl: callbackUrlFor(row.id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class SmsAccountsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly audit: AuditService,
    private readonly channel: SmsChannelService,
    @Inject(SMS_GATEWAY_NET) private readonly net: SmsGatewayNet,
  ) {}

  /** The organisation managed: the caller's, or null (the shared account) for platform staff outside any organisation. */
  private scope(ctx: TenantContext): string | null {
    if (ctx.organizationId) return ctx.organizationId;
    if (ctx.isSuperAdmin) return null;
    throw new BadRequestException('Switch into an organisation to manage its SMS settings');
  }

  async overview(ctx: TenantContext) {
    const scope = this.scope(ctx);
    const rows = await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.channelAccount.findMany({ where: { organizationId: scope, channel: 'sms' }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] }),
    );
    const accounts = rows.map((row) => accountView(row, this.safeConfig(row.configEncrypted)));
    if (!scope) return { scope: 'platform' as const, accounts, policy: null, usage: null, sharedAccountAvailable: accounts.some((a) => a.status === 'active'), templateVariables: TEMPLATE_VARIABLES };
    const policy = await this.channel.policy(scope);
    // Whether YukthiX has a shared account at all; the tenant never sees its details (platform-only rows).
    const shared = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.channelAccount.count({ where: { organizationId: null, channel: 'sms', status: 'active' } }));
    return {
      scope: 'company' as const,
      accounts,
      policy: { useSharedAccount: policy.smsSharedAccount, monthlyCap: policy.smsMonthlyCap },
      usage: { ...(await this.channel.usage(scope)), cap: policy.smsMonthlyCap },
      sharedAccountAvailable: shared > 0 || process.env.NODE_ENV !== 'production',
      templateVariables: TEMPLATE_VARIABLES,
    };
  }

  async updatePolicy(ctx: TenantContext, actorUserId: string, dto: UpdateSmsPolicyDto) {
    const organizationId = this.scope(ctx);
    if (!organizationId) throw new BadRequestException('The shared account has no company policy');
    const data = {
      ...(dto.useSharedAccount !== undefined ? { smsSharedAccount: dto.useSharedAccount } : {}),
      ...(dto.monthlyCap !== undefined ? { smsMonthlyCap: dto.monthlyCap } : {}),
      updatedByUserId: actorUserId,
    };
    const before = await this.channel.policy(organizationId);
    await this.tenantPrisma.forTenant(ctx, (tx) => tx.tenantNotificationPolicy.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data }));
    await this.audit.record(ctx, {
      actorUserId,
      action: 'notification.sms_policy_updated',
      entityType: 'tenant_notification_policy',
      entityId: organizationId,
      metadata: { from: before, to: await this.channel.policy(organizationId) },
    });
    return this.overview(ctx);
  }

  private safeConfig(blob: string): Record<string, unknown> {
    try {
      return this.channel.decryptConfig(blob);
    } catch {
      return {};
    }
  }

  /** Merges non-secret config and write-only secrets into the stored config, then validates the whole. */
  private async buildConfig(provider: string, current: Record<string, unknown>, dto: { config?: Record<string, unknown>; secrets?: Record<string, string | null> }) {
    const adapter = getChannelProvider(provider);
    if (!adapter) throw new BadRequestException('Unknown provider');
    const sentIn = dto.config ?? {};
    const smuggled = Object.keys(sentIn).filter((key) => NOT_IN_CONFIG.has(key));
    if (smuggled.length) throw new BadRequestException(`${smuggled[0]} is a secret: send it in secrets`);

    const kept = Object.fromEntries(Object.entries(current).filter(([key]) => NOT_IN_CONFIG.has(key)));
    const next: Record<string, unknown> = { ...(dto.config ? sentIn : Object.fromEntries(Object.entries(current).filter(([key]) => !NOT_IN_CONFIG.has(key)))), ...kept };
    const httpSecrets: Record<string, unknown> = { ...(isRecord(next.secrets) ? next.secrets : {}) };
    for (const [name, value] of Object.entries(dto.secrets ?? {})) {
      if (value !== null && (typeof value !== 'string' || value === '')) throw new BadRequestException(`Secret ${name.slice(0, 40)} must be text, or null to remove it`);
      const target = (TOP_SECRETS as readonly string[]).includes(name) ? next : httpSecrets;
      if (value === null) delete target[name];
      else target[name] = value;
    }
    if (Object.keys(httpSecrets).length) next.secrets = httpSecrets;
    else delete next.secrets;

    adapter.validateConfig(next);
    if (next.callback !== undefined) {
      const problem = callbackConfigError(next.callback);
      if (problem) throw new BadRequestException(problem);
    }
    if (typeof next.callbackSecret === 'string' && (next.callbackSecret.length < 16 || next.callbackSecret.length > 200)) {
      throw new BadRequestException('The callback secret must be 16 to 200 characters');
    }
    // SSRF: the gateway host must resolve to public addresses only (every send is pinned the same way).
    if (provider === 'http') {
      try {
        await this.net.assertPublicUrl(new URL(next.url as string));
      } catch {
        throw new BadRequestException('The gateway URL must be a public https address');
      }
    }
    return next;
  }

  private templatesWith(current: Prisma.JsonValue, otp: unknown, dltEntityId: string | null): Prisma.InputJsonValue {
    const templates = isRecord(current) ? { ...current } : {};
    if (otp !== undefined) {
      const shape = templateShapeError(otp, Boolean(dltEntityId));
      if (shape) throw new BadRequestException(`One-time-code template: ${shape}`);
      const { dltTemplateId, body, variables, status } = otp as SmsTemplate;
      templates.otp = { dltTemplateId: dltTemplateId ?? null, body, variables, status };
    } else if (templates.otp !== undefined) {
      const shape = templateShapeError(templates.otp, Boolean(dltEntityId));
      if (shape) throw new BadRequestException(`One-time-code template: ${shape}`);
    }
    return templates as Prisma.InputJsonValue;
  }

  async create(ctx: TenantContext, actorUserId: string, dto: CreateSmsAccountDto) {
    const organizationId = this.scope(ctx);
    const dltEntityId = dto.dltEntityId ?? null;
    await this.assertNameFree(ctx, organizationId, dto.name);
    const config = await this.buildConfig(dto.provider, {}, dto);
    const row = await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.channelAccount.create({
        data: {
          organizationId,
          channel: 'sms',
          provider: dto.provider,
          name: dto.name.trim(),
          sender: dto.sender ?? null,
          dltEntityId,
          priority: dto.priority ?? 100,
          status: dto.status ?? 'active',
          configEncrypted: this.crypto.encrypt(JSON.stringify(config)),
          templates: this.templatesWith({}, dto.otpTemplate, dltEntityId),
          createdByUserId: actorUserId,
        },
      }),
    );
    await this.record(ctx, actorUserId, 'notification.sms_account_created', row.id, { name: row.name, provider: row.provider, secretsSet: accountView(row, config).secretsSet });
    return accountView(row, config);
  }

  /** Names tell accounts apart in the list, the test results and the delivery log, so they must be unique. */
  // ponytail: check-then-write, so two saves in the same instant could still both pass; add a unique index if that ever matters.
  private async assertNameFree(ctx: TenantContext, organizationId: string | null, name: string, exceptId?: string) {
    const clash = await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.channelAccount.findFirst({ where: { organizationId, channel: 'sms', name: { equals: name.trim(), mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } }),
    );
    if (clash) throw new ConflictException(`An SMS account named "${name.trim()}" already exists. Choose another name.`);
  }

  private async load(ctx: TenantContext, id: string) {
    const scope = this.scope(ctx);
    const row = await this.tenantPrisma.forTenant(ctx, (tx) => tx.channelAccount.findFirst({ where: { id, organizationId: scope, channel: 'sms' } }));
    if (!row) throw new NotFoundException('SMS account not found');
    return row;
  }

  async update(ctx: TenantContext, actorUserId: string, id: string, dto: UpdateSmsAccountDto) {
    const row = await this.load(ctx, id);
    if (dto.name !== undefined) await this.assertNameFree(ctx, row.organizationId, dto.name, row.id);
    const dltEntityId = dto.dltEntityId !== undefined ? dto.dltEntityId : row.dltEntityId;
    const config = await this.buildConfig(row.provider, this.safeConfig(row.configEncrypted), dto);
    const updated = await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.channelAccount.update({
        where: { id: row.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.sender !== undefined ? { sender: dto.sender } : {}),
          ...(dto.dltEntityId !== undefined ? { dltEntityId: dto.dltEntityId } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          configEncrypted: this.crypto.encrypt(JSON.stringify(config)),
          templates: this.templatesWith(row.templates, dto.otpTemplate, dltEntityId),
        },
      }),
    );
    const changed = Object.keys(dto).filter((key) => key !== 'secrets');
    await this.record(ctx, actorUserId, 'notification.sms_account_updated', row.id, { name: updated.name, changed, secretsChanged: Object.keys(dto.secrets ?? {}) });
    return accountView(updated, config);
  }

  async remove(ctx: TenantContext, actorUserId: string, id: string) {
    const row = await this.load(ctx, id);
    await this.tenantPrisma.forTenant(ctx, (tx) => tx.channelAccount.delete({ where: { id: row.id } }));
    await this.record(ctx, actorUserId, 'notification.sms_account_deleted', row.id, { name: row.name, provider: row.provider });
  }

  /** A test message to the admin's own verified mobile number, through this account only. */
  async test(ctx: TenantContext, actorUserId: string, id: string) {
    const row = await this.load(ctx, id);
    const me = await this.tenantPrisma.forTenant(ctx, (tx) => tx.user.findUnique({ where: { id: actorUserId }, select: { mobileNumber: true, mobileVerifiedAt: true } }));
    if (!me?.mobileNumber || !me.mobileVerifiedAt) throw new BadRequestException('Verify your own mobile number in My security first: test messages go only there');
    const outcome = await this.channel.sendOtp({
      organizationId: row.organizationId,
      to: me.mobileNumber,
      code: randomInt(0, 1_000_000).toString().padStart(6, '0'),
      purpose: 'test message',
      minutes: 5,
      idempotencyKey: `test:${randomUUID()}`,
      recipientUserId: actorUserId,
      requestedOnChannel: true,
      kind: 'test',
      onlyAccountId: row.id,
    });
    await this.record(ctx, actorUserId, 'notification.sms_account_tested', row.id, { name: row.name, outcome: outcome.status });
    const delivery =
      'deliveryId' in outcome
        ? await this.tenantPrisma.forTenant(ctx, (tx) => tx.notificationDelivery.findUnique({ where: { id: outcome.deliveryId }, select: { status: true, error: true, addressMasked: true } }))
        : null;
    return { status: outcome.status, to: delivery?.addressMasked ?? null, error: delivery?.error ?? null };
  }

  async deliveries(ctx: TenantContext, before?: string) {
    const scope = this.scope(ctx);
    const PAGE = 50;
    const where: Prisma.NotificationDeliveryWhereInput = scope ? { organizationId: scope } : { OR: [{ organizationId: null }, { channelAccount: { is: { organizationId: null } } }] };
    const rows = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const cursor = before ? await tx.notificationDelivery.findFirst({ where: { ...where, id: before }, select: { createdAt: true, id: true } }) : null;
      return tx.notificationDelivery.findMany({
        where: cursor ? { AND: [where, { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }] } : where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PAGE + 1,
        include: { channelAccount: { select: { name: true, organizationId: true } } },
      });
    });
    const data = rows.slice(0, PAGE).map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      kind: r.kind,
      channel: r.channel,
      to: r.addressMasked,
      status: r.status,
      // A company never sees the shared account itself (RLS hides it): it is "YukthiX shared".
      account: r.channelAccount && (r.channelAccount.organizationId || !scope) ? r.channelAccount.name : r.channelAccountId || r.provider === 'dev' ? 'YukthiX shared' : null,
      provider: scope && !r.channelAccount?.organizationId ? null : r.provider,
      attempts: r.attempts,
      error: r.error,
      costUnits: r.costUnits,
      sentAt: r.sentAt,
      deliveredAt: r.deliveredAt,
    }));
    return { data, nextCursor: rows.length > PAGE ? data[PAGE - 1].id : null, month: smsMonth() };
  }

  private record(ctx: TenantContext, actorUserId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
    return this.audit.record(ctx, { actorUserId, action, entityType: 'channel_account', entityId, metadata });
  }
}

