import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { NETWORK_NOT_ALLOWED_MESSAGE, TenantPrismaService, ipAllowedForSurface, loadTenantSecurityPolicy } from '@exam-platform/shared';

/**
 * P11 YX-API-12 (US-E-226): a route that writes payroll or statutory data names the scope the company API key must
 * carry ('payroll-write'); a key without it is refused. P03 approvals, maker ≠ checker and period locks still apply.
 */
export const API_SCOPE = 'yx:api-scope';
export const RequireApiScope = (scope: 'payroll-write') => SetMetadata(API_SCOPE, scope);

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      // Same message as the no-match case below -- don't let callers distinguish
      // "bad format" from "well-formed but wrong key" (see plan's Error Handling section).
      throw new UnauthorizedException('Invalid API key');
    }
    const apiKey = authHeader.slice('Bearer '.length);
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    // No tenant context exists yet -- resolving which org this key belongs to is
    // exactly what this lookup is for, so it uses the same super-admin-bootstrap
    // pattern established for resolving tenant from an opaque credential elsewhere
    // (e.g. AttemptService.resolveContext() in exam-runtime).
    const organization = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.organization.findFirst({ where: { apiKeyHash } }),
    );
    if (!organization) {
      throw new UnauthorizedException('Invalid API key');
    }
    // The company's API IP allow-list (YX-IAM-09). Checked only after the key matched, so the
    // refusal reveals nothing to a caller without a valid key.
    if (!ipAllowedForSurface(await loadTenantSecurityPolicy(this.tenantPrisma, organization.id), 'api', request.ip)) {
      throw new ForbiddenException(NETWORK_NOT_ALLOWED_MESSAGE);
    }
    const scope: string | undefined = typeof context.getHandler === 'function' ? Reflect.getMetadata(API_SCOPE, context.getHandler()) : undefined;
    if (scope && !(organization.apiKeyScopes ?? []).includes(scope)) {
      throw new ForbiddenException(`This API key may not do this: it needs the ${scope} scope.`);
    }
    request.apiKeyOrg = { organizationId: organization.id };
    return true;
  }
}
