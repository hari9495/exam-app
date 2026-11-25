import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { SetupHubService } from './setup-hub.service';
import { openContainment } from '../platform/containment';
import { inCompany } from '../org-structure/org-structure.service';
import { mintNotFoundRef, NOT_FOUND_CODE } from './not-found-ref';

export class NotFoundPageDto {
  /** The app page that does not exist (the web's own Not found page). */
  @IsString() @Matches(/^\/[^\s]{0,299}$/, { message: 'path is an app path' })
  path!: string;
}

// Answer 947: the web's Not found page asks for a reference for its address (API 404s carry one already); support
// (the company's helpdesk agents and System Admins, and YukthiX staff in a support session) look one up in their company.
@Controller('help/not-found')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HelpController {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  @Post()
  async page(@CurrentTenant() ctx: TenantContext, @Body() dto: NotFoundPageDto) {
    return { reference: await mintNotFoundRef(this.tenantPrisma, ctx, dto.path) };
  }

  @Get(':code')
  @RequireAnyPermission('desk.ticket.view', 'access.role.manage')
  lookUp(@CurrentTenant() ctx: TenantContext, @Param('code') raw: string) {
    const code = raw.trim().toUpperCase();
    if (!NOT_FOUND_CODE.test(code)) throw new BadRequestException('Type the reference as shown, like NF-7KQ2MP.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await tx.notFoundRef.findFirst({ where: { organizationId: c.organizationId, code } });
      if (!row) throw new NotFoundException('No such reference in your company.');
      const user = row.userId ? await tx.user.findFirst({ where: { organizationId: c.organizationId, id: row.userId }, select: { name: true, email: true } }) : null;
      return { code: row.code, at: row.createdAt.toISOString(), who: user ? user.name?.trim() || user.email : null, path: row.path };
    });
  }
}

// Answer 952: the set-up hub, for whoever sets up the company (Company rules: org.settings.manage).
@Controller('help/setup-hub')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SetupHubController {
  constructor(private readonly hub: SetupHubService) {}

  @Get()
  @RequirePermissions('org.settings.manage')
  get(@CurrentTenant() ctx: TenantContext) {
    return this.hub.hub(ctx);
  }
}

// Answer 1050: the company's banner while YukthiX has it contained (every signed-in person of the company may ask).
@Controller('help/containment')
@UseGuards(JwtAuthGuard)
export class ContainmentBannerController {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  @Get()
  banner(@CurrentTenant() ctx: TenantContext) {
    if (!ctx.organizationId) return { contained: false };
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const open = await openContainment(tx, ctx.organizationId!);
      return open ? { contained: true, since: open.containedAt.toISOString() } : { contained: false };
    });
  }
}
