import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AuditService,
  MFA_REQUIRED_CODE,
  MFA_SENSITIVE_PERMISSIONS,
  NETWORK_NOT_ALLOWED_MESSAGE,
  PrismaService,
  STEP_UP_REQUIRED_CODE,
  SessionAssurance,
  TenantPrismaService,
  ipAllowedForSurface,
  loadTenantSecurityPolicy,
  mfaSatisfied,
  resolvePermissionGrants,
  stepUpSatisfied,
} from '@exam-platform/shared';
import { PERMISSIONS_KEY, PERMISSIONS_ANY_KEY } from './permissions.decorator';
import { SENSITIVE_ROLE_ACTION, STEP_UP_REQUIRED } from '../auth/step-up.decorator';

// Endpoints gated by these permissions are the "admin console" for the company's admin IP
// allow-list (YX-IAM-09): every sensitive-role permission (users, settings / security, billing,
// approval chains, data-subject rights), the audit trail and login activity, and any future
// org:manage_* permission. An explicit list, not a name pattern, so nothing admin-grade slips out.
export const ADMIN_CONSOLE_PERMISSIONS: readonly string[] = [...MFA_SENSITIVE_PERMISSIONS, 'audit:view'];
const isAdminConsolePermission = (key: string) => ADMIN_CONSOLE_PERMISSIONS.includes(key) || key.startsWith('org:manage_');

interface RequestUser {
  userId?: string;
  role: string;
  organizationId?: string | null;
  permissionProfileId?: string | null;
  actingSuperAdmin?: boolean;
  impersonatorUserId?: string;
  // The session's assurance state (JwtStrategy).
  session?: SessionAssurance;
}

export class MfaRequiredException extends ForbiddenException {
  constructor() {
    super({ statusCode: 403, code: MFA_REQUIRED_CODE, message: 'Set up two-step verification to continue.' });
  }
}

export class StepUpRequiredException extends ForbiddenException {
  constructor() {
    super({ statusCode: 403, code: STEP_UP_REQUIRED_CODE, message: 'Confirm it is you with your second factor to continue.' });
  }
}

// For handlers whose step-up need depends on the request body (e.g. a user edit that changes a
// role): the same check PermissionsGuard applies to @RequireStepUp handlers.
export function assertStepUp(user: { session?: SessionAssurance } | undefined): void {
  if (!user?.session || !stepUpSatisfied(user.session)) {
    throw new StepUpRequiredException();
  }
}

// Permissions, then the MFA floor (YX-IAM-01), then step-up (YX-IAM-02), for every staff handler.
@Injectable()
export class PermissionsGuard implements CanActivate {
  // AuditService needs only TenantPrismaService; built here so the guard's injection stays the
  // same in every module that uses it.
  private readonly audit: AuditService;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {
    this.audit = new AuditService(tenantPrisma);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const requiredAll = this.reflector.get<string[]>(PERMISSIONS_KEY, handler);
    const requiredAny = this.reflector.get<string[]>(PERMISSIONS_ANY_KEY, handler);
    const stepUp = this.reflector.get<boolean>(STEP_UP_REQUIRED, handler) === true;
    const sensitiveAction = this.reflector.get<boolean>(SENSITIVE_ROLE_ACTION, handler) === true;
    const hasAllRequirement = Boolean(requiredAll && requiredAll.length > 0);
    const hasAnyRequirement = Boolean(requiredAny && requiredAny.length > 0);
    if (!hasAllRequirement && !hasAnyRequirement && !stepUp && !sensitiveAction) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    const allKeys = [...(requiredAll ?? []), ...(requiredAny ?? [])];
    if (allKeys.length > 0 && !user.actingSuperAdmin) {
      await this.checkPermissions(user, request.ip, requiredAll, requiredAny, allKeys);
    }
    await this.checkMfa(user, allKeys, sensitiveAction);
    if (stepUp) {
      assertStepUp(user);
      await this.audit.record(
        { organizationId: user.organizationId ?? null, isSuperAdmin: user.role === 'super_admin' },
        {
          actorUserId: user.impersonatorUserId ?? user.userId ?? null,
          action: 'step_up.used',
          entityType: 'session',
          metadata: {
            route: `${request.method} ${request.route?.path ?? request.path}`,
            verifiedAt: user.session!.mfaVerifiedAt,
            factor: user.session!.mfaMethod,
          },
        },
      );
    }
    return true;
  }

  private async checkPermissions(
    user: RequestUser,
    ip: string | undefined,
    requiredAll: string[] | undefined,
    requiredAny: string[] | undefined,
    allKeys: string[],
  ): Promise<void> {
    // Tenant staff only: platform super admins are bound by staff controls (Q7), not tenant lists.
    if (user.organizationId && user.role !== 'super_admin' && allKeys.some(isAdminConsolePermission)) {
      const policy = await loadTenantSecurityPolicy(this.tenantPrisma, user.organizationId);
      if (!ipAllowedForSurface(policy, 'admin', ip)) {
        throw new ForbiddenException(NETWORK_NOT_ALLOWED_MESSAGE);
      }
    }
    // Profile > per-org role override > global role default; see resolvePermissionGrants.
    const grantedKeys = await resolvePermissionGrants(this.prisma, this.tenantPrisma, {
      role: user.role,
      organizationId: user.organizationId ?? null,
      permissionProfileId: user.permissionProfileId,
    }, allKeys);

    if (requiredAll?.length && !requiredAll.every((key) => grantedKeys.has(key))) {
      throw new ForbiddenException(`Missing required permission(s): ${requiredAll.join(', ')}`);
    }
    if (requiredAny?.length && !requiredAny.some((key) => grantedKeys.has(key))) {
      throw new ForbiddenException(`Missing any of required permission(s): ${requiredAny.join(', ')}`);
    }
  }

  // YX-IAM-01: a sensitive-role permission (or a company requiring MFA for everyone) needs an AAL2
  // session once the enrolment grace has passed. YukthiX staff are a sensitive role whatever the
  // handler. No session state (never issued by JwtStrategy) fails closed.
  private async checkMfa(user: RequestUser, keys: string[], sensitiveAction: boolean): Promise<void> {
    if (user.session && mfaSatisfied(user.session)) {
      return;
    }
    const needed =
      !user.session ||
      sensitiveAction ||
      user.role === 'super_admin' ||
      Boolean(user.actingSuperAdmin) ||
      keys.some((key) => MFA_SENSITIVE_PERMISSIONS.includes(key)) ||
      (Boolean(user.organizationId) && (await loadTenantSecurityPolicy(this.tenantPrisma, user.organizationId!)).mfaScope === 'all');
    if (needed) {
      throw new MfaRequiredException();
    }
  }
}
