import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { SessionAssurance } from '@exam-platform/shared';
import { MfaRequiredException } from '../rbac/permissions.guard';

interface RequestUser {
  role?: string;
  organizationId?: string | null;
  actingSuperAdmin?: boolean;
  impersonatorUserId?: string;
  session?: SessionAssurance;
}

/**
 * The platform console is YukthiX staff only (P14 YX-CONSOLE-01, P12 Q7): an individual staff account (no company),
 * signed in with its security key (AAL2, no enrolment grace), on its own platform session, never from inside a
 * company or an impersonation. Runs before PermissionsGuard, which then checks the route's platform.* key.
 */
@Injectable()
export class PlatformStaffGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user as RequestUser | undefined;
    if (!user || user.role !== 'super_admin' || user.organizationId || user.actingSuperAdmin || user.impersonatorUserId) {
      throw new ForbiddenException('YukthiX staff only');
    }
    if (user.session?.assuranceLevel !== 'aal2') throw new MfaRequiredException();
    return true;
  }
}
