import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';

export const CurrentApiKeyOrg = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const request = ctx.switchToHttp().getRequest();
  const apiKeyOrg = request.apiKeyOrg as { organizationId: string } | undefined;
  return { organizationId: apiKeyOrg?.organizationId ?? null, isSuperAdmin: false };
});
