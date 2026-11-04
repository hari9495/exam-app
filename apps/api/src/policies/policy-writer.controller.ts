import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { STRICT_AI_GENERATE_THROTTLE } from '../rate-limit-tiers';
import { assertOwnSession } from '../service-desk/desk-access';
import type { ScopeUser } from '../access/scope';
import { PoliciesService } from './policies.service';
import { ApproveDraftDto, GenerateDto, SaveDraftDto } from './policy-writer.dto';
import { PolicyWriterService } from './policy-writer.service';

// HLP-14 Write policies with AI (map section 4i). Every route needs policy.manage for the whole company (a legal-entity
// grant confers nothing, as in HLP-11); writes are refused while acting for someone else. Publishing stays in HLP-11
// (POST desk/policies/:id/publish, policy.publish), where the approver of a draft is refused.
@Controller('desk/policy-writer')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PolicyWriterController {
  constructor(
    private readonly writer: PolicyWriterService,
    private readonly policies: PoliciesService,
  ) {}

  private gate(req: Request) {
    return this.policies.companyWide(req.user as ScopeUser, ['policy.manage']);
  }

  @Get()
  @RequirePermissions('policy.manage')
  async home(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    await this.gate(req);
    return this.writer.home(ctx);
  }

  @Post('drafts')
  @RequirePermissions('policy.manage')
  @Throttle(STRICT_AI_GENERATE_THROTTLE)
  async generate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: GenerateDto) {
    assertOwnSession(req);
    await this.gate(req);
    return this.writer.generate(ctx, dto);
  }

  @Get('drafts/:id')
  @RequirePermissions('policy.manage')
  async detail(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.gate(req);
    return this.writer.detail(ctx, id);
  }

  @Put('drafts/:id')
  @RequirePermissions('policy.manage')
  async save(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveDraftDto) {
    assertOwnSession(req);
    await this.gate(req);
    return this.writer.save(ctx, id, dto);
  }

  @Post('drafts/:id/approve')
  @RequirePermissions('policy.manage')
  async approve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveDraftDto) {
    assertOwnSession(req);
    await this.gate(req);
    return this.writer.approve(ctx, id, dto.version);
  }
}
