import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { TenantPrismaService } from '@exam-platform/shared';

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
    request.apiKeyOrg = { organizationId: organization.id };
    return true;
  }
}
