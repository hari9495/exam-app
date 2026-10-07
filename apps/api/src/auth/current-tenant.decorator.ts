import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';

export const CurrentTenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const request = ctx.switchToHttp().getRequest();
  const user = request.user as
    | { userId?: string; organizationId: string | null; role: string; permissionProfileId?: string | null; actingSuperAdmin?: boolean; supportSessionId?: string | null }
    | undefined;
  // Staff inside a company (a support session) are held to that company by RLS, like its own people (P01 §4 row 2).
  return {
    organizationId: user?.organizationId ?? null,
    isSuperAdmin: user?.role === 'super_admin' && !user.actingSuperAdmin,
    supportSessionId: user?.supportSessionId ?? null,
    userId: user?.userId ?? null,
    role: user?.role ?? null,
    permissionProfileId: user?.permissionProfileId ?? null,
  };
});
