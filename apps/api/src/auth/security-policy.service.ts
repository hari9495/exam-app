import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AuditService,
  DEFAULT_SECURITY_POLICY,
  SecurityPolicySettings,
  TENANT_SECURITY_FLOOR,
  TenantContext,
  TenantPrismaService,
  invalidateTenantSecurityPolicy,
  ipAllowedForSurface,
  isValidIpRange,
  sessionLimitsFor,
  toSecurityPolicySettings,
} from '@exam-platform/shared';
import { UpdateSecurityPolicyDto } from './dto/update-security-policy.dto';
import { hasActiveIdentityProvider } from './identity-providers';

type SettingKey = keyof SecurityPolicySettings;
const IP_LISTS = ['ipAllowlistDesk', 'ipAllowlistAdmin', 'ipAllowlistApi'] as const;

// Settings › People & Access › Security (P12 §7): the company's security policy, bounded by the
// YukthiX floor (Q8). Reads return the floor alongside so the UI can show "minimum allowed".
@Injectable()
export class SecurityPolicyService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  private orgOf(context: TenantContext): string {
    if (!context.organizationId) {
      throw new BadRequestException('Switch into an organisation to manage its security policy');
    }
    return context.organizationId;
  }

  async get(context: TenantContext) {
    const organizationId = this.orgOf(context);
    const row = await this.tenantPrisma.forTenant(context, (tx) => tx.tenantSecurityPolicy.findUnique({ where: { organizationId } }));
    return {
      policy: row ? toSecurityPolicySettings(row) : DEFAULT_SECURITY_POLICY,
      floor: TENANT_SECURITY_FLOOR,
      updatedAt: row?.updatedAt ?? null,
      updatedByUserId: row?.updatedByUserId ?? null,
    };
  }

  // `callerIp` / `exemptFromIpLists`: an admin may not save desk or admin allow-lists that would
  // shut out the very request saving them (platform staff are not bound by tenant lists).
  async update(
    context: TenantContext,
    actorUserId: string,
    dto: UpdateSecurityPolicyDto,
    caller: { ip: string | null; exemptFromIpLists: boolean },
  ) {
    const organizationId = this.orgOf(context);
    const { policy: current } = await this.get(context);

    const next: SecurityPolicySettings = { ...current };
    for (const [key, value] of Object.entries(dto) as [SettingKey, never][]) {
      if (value !== undefined) next[key] = value;
    }
    for (const list of IP_LISTS) {
      next[list] = [...new Set(next[list].map((range) => range.trim()))];
      const invalid = next[list].filter((range) => !isValidIpRange(range));
      if (invalid.length) {
        throw new BadRequestException(`${list}: not an IP address or CIDR range: ${invalid.join(', ')}`);
      }
    }
    await this.assertWithinFloor(organizationId, context, next, caller);

    const changes = Object.fromEntries(
      (Object.keys(next) as SettingKey[])
        .filter((key) => JSON.stringify(next[key]) !== JSON.stringify(current[key]))
        .map((key) => [key, { from: current[key], to: next[key] }]),
    );

    const { idleSeconds, absoluteSeconds } = sessionLimitsFor(next);
    await this.tenantPrisma.forTenant(context, async (tx) => {
      await tx.tenantSecurityPolicy.upsert({
        where: { organizationId },
        create: { organizationId, ...next, updatedByUserId: actorUserId },
        update: { ...next, updatedByUserId: actorUserId },
      });
      // Stricter session limits apply to sessions already open, not only to new ones.
      if ('sessionIdleMinutes' in changes || 'sessionAbsoluteMinutes' in changes) {
        await tx.$executeRaw`
          UPDATE sessions SET
            idle_timeout_seconds = LEAST(idle_timeout_seconds, ${idleSeconds}),
            absolute_expires_at = LEAST(absolute_expires_at, created_at + make_interval(secs => ${absoluteSeconds})),
            idle_expires_at = LEAST(idle_expires_at, last_seen_at + make_interval(secs => ${idleSeconds}),
                                    created_at + make_interval(secs => ${absoluteSeconds}))
          WHERE organization_id = ${organizationId}::uuid AND revoked_at IS NULL AND absolute_expires_at > now()`;
      }
    });
    invalidateTenantSecurityPolicy(organizationId);

    // YX-IAM-10: every security-policy change is logged, with what changed.
    if (Object.keys(changes).length) {
      await this.audit.record(context, {
        actorUserId,
        action: 'security_policy.updated',
        entityType: 'organization',
        entityId: organizationId,
        metadata: { changes },
      });
    }
    return this.get(context);
  }

  // Cross-field floor rules the DTO cannot express. The single-field bounds are in the DTO and,
  // again, in the table's CHECK constraints.
  private async assertWithinFloor(
    organizationId: string,
    context: TenantContext,
    next: SecurityPolicySettings,
    caller: { ip: string | null; exemptFromIpLists: boolean },
  ): Promise<void> {
    if (!next.allowedFactors.some((f) => (TENANT_SECURITY_FLOOR.primaryFactors as readonly string[]).includes(f))) {
      throw new BadRequestException('Allowed factors must include a passkey or an authenticator app; one-time codes are a fallback only');
    }
    if (next.sessionIdleMinutes != null && next.sessionAbsoluteMinutes != null && next.sessionIdleMinutes > next.sessionAbsoluteMinutes) {
      throw new BadRequestException('The idle timeout cannot be longer than the absolute session limit');
    }
    if (!caller.exemptFromIpLists) {
      for (const surface of ['desk', 'admin'] as const) {
        if (!ipAllowedForSurface(next, surface, caller.ip)) {
          throw new BadRequestException(`This ${surface} IP allow-list does not include your current address (${caller.ip ?? 'unknown'}); saving it would lock you out`);
        }
      }
    }

    const { minWhenSsoOnly } = TENANT_SECURITY_FLOOR.breakGlassAccounts;
    if (next.ssoOnly && next.breakGlassUserIds.length < minWhenSsoOnly) {
      throw new BadRequestException(`SSO-only needs at least ${minWhenSsoOnly} break-glass admin accounts`);
    }
    if (next.ssoOnly || next.breakGlassUserIds.length) {
      const { ssoConfigured, admins } = await this.tenantPrisma.forTenant(context, async (tx) => ({
        ssoConfigured: await hasActiveIdentityProvider(tx, organizationId),
        admins: await tx.user.count({
          where: { id: { in: next.breakGlassUserIds }, organizationId, role: 'org_admin', status: 'active' },
        }),
      }));
      if (next.ssoOnly && !ssoConfigured) {
        throw new BadRequestException('Set up single sign-on before turning on SSO-only');
      }
      if (admins !== next.breakGlassUserIds.length) {
        throw new BadRequestException('Break-glass accounts must be active administrators of this organisation');
      }
    }
  }
}
