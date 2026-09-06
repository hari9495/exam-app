import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';

export const CurrentTenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const request = ctx.switchToHttp().getRequest();
  const user = request.user as { userId?: string; organizationId: string | null; role: string } | undefined;
  return {
    organizationId: user?.organizationId ?? null,
    isSuperAdmin: user?.role === 'super_admin',
    userId: user?.userId ?? null,
    role: user?.role ?? null,
  };
});
