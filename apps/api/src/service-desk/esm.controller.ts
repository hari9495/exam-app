import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { MODERATE_UPLOAD_THROTTLE, PUBLIC_API_THROTTLE } from '../rate-limit-tiers';
import { CatalogService } from './catalog.service';
import { DeskAutomation } from './desk-automation';
import { DeskAccessService, assertOwnSession } from './desk-access';
import {
  AdhocApprovalDto,
  AnswersDto,
  CancelDto,
  CatalogItemDto,
  CatalogSettingsDto,
  CheckoutDto,
  DeskQueryDto,
  OrderGuideDto,
  PickQueryDto,
  QuestionnaireDto,
  RecipeInstallDto,
  RuleDto,
  RuleStatusDto,
  UpdateCatalogItemDto,
  UpdateRuleDto,
  VersionOnlyDto,
  WebhookActiveDto,
  WebhookDto,
} from './dto-esm';
import { RequesterService } from './requester.service';

// M14 §12.2 phase 3b-2, batch 1. Staff routes declare their key (YX-SEC-01) and the service also checks the desk admin
// seat; the requester routes (/desk/my/…) have no key and reach only what the person may order and their own requests.

@Controller('desk')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeskCatalogController {
  constructor(
    private readonly access: DeskAccessService,
    private readonly catalog: CatalogService,
  ) {}

  @Get('catalog/admin/items')
  @RequirePermissions('desk.catalog.manage')
  async items(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: DeskQueryDto) {
    return this.catalog.adminItems(await this.access.actor(req, t), q.deskId);
  }

  @Get('catalog/admin/schema')
  @RequirePermissions('desk.catalog.manage')
  async schema(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: DeskQueryDto) {
    return this.catalog.builderSchema(await this.access.actor(req, t), q.deskId);
  }

  @Post('catalog/admin/items')
  @RequirePermissions('desk.catalog.manage')
  async createItem(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: CatalogItemDto) {
    assertOwnSession(req);
    return this.catalog.createItem(await this.access.actor(req, t), dto);
  }

  @Get('catalog/admin/items/:id')
  @RequirePermissions('desk.catalog.manage')
  async item(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.adminItem(await this.access.actor(req, t), id);
  }

  @Patch('catalog/admin/items/:id')
  @RequirePermissions('desk.catalog.manage')
  async updateItem(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCatalogItemDto) {
    assertOwnSession(req);
    return this.catalog.updateItem(await this.access.actor(req, t), id, dto);
  }

  @Post('catalog/admin/items/:id/publish')
  @HttpCode(200)
  @RequirePermissions('desk.catalog.manage')
  async publish(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionOnlyDto) {
    assertOwnSession(req);
    return this.catalog.publish(await this.access.actor(req, t), id, dto.version);
  }

  @Post('catalog/admin/items/:id/retire')
  @HttpCode(200)
  @RequirePermissions('desk.catalog.manage')
  async retire(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionOnlyDto) {
    assertOwnSession(req);
    return this.catalog.retire(await this.access.actor(req, t), id, dto.version);
  }

  @Get('catalog/admin/settings')
  @RequirePermissions('desk.catalog.manage')
  async catalogSettings(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.catalog.catalogSettings(await this.access.actor(req, t));
  }

  @Put('catalog/admin/settings')
  @RequirePermissions('desk.catalog.manage')
  async setCatalogSettings(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: CatalogSettingsDto) {
    assertOwnSession(req);
    return this.catalog.setCatalogSettings(await this.access.actor(req, t), dto);
  }

  @Get('catalog/admin/questionnaires')
  @RequirePermissions('desk.catalog.manage')
  async questionnaires(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.catalog.questionnaires(await this.access.actor(req, t));
  }

  @Post('catalog/admin/questionnaires')
  @RequirePermissions('desk.catalog.manage')
  async addQuestionnaire(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: QuestionnaireDto) {
    assertOwnSession(req);
    return this.catalog.saveQuestionnaire(await this.access.actor(req, t), null, dto);
  }

  @Patch('catalog/admin/questionnaires/:id')
  @RequirePermissions('desk.catalog.manage')
  async saveQuestionnaire(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QuestionnaireDto) {
    assertOwnSession(req);
    return this.catalog.saveQuestionnaire(await this.access.actor(req, t), id, dto);
  }

  @Get('catalog/admin/guides')
  @RequirePermissions('desk.catalog.manage')
  async guides(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.catalog.guides(await this.access.actor(req, t));
  }

  @Post('catalog/admin/guides')
  @RequirePermissions('desk.catalog.manage')
  async addGuide(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: OrderGuideDto) {
    assertOwnSession(req);
    return this.catalog.saveGuide(await this.access.actor(req, t), null, dto);
  }

  @Patch('catalog/admin/guides/:id')
  @RequirePermissions('desk.catalog.manage')
  async saveGuide(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OrderGuideDto) {
    assertOwnSession(req);
    return this.catalog.saveGuide(await this.access.actor(req, t), id, dto);
  }

  /** The ordered items of a request ticket, their approvals and fulfilment tasks; ad-hoc approvals on the ticket. */
  @Get('tickets/:id/request')
  @RequirePermissions('desk.ticket.view')
  async request(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.ticketRequest(await this.access.actor(req, t), id);
  }

  /** US-G-054: ask named colleagues to approve something on this ticket (P03). */
  @Post('tickets/:id/approvals')
  @RequirePermissions('desk.ticket.work')
  async askApproval(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdhocApprovalDto) {
    assertOwnSession(req);
    return this.catalog.askApproval(await this.access.actor(req, t), id, dto);
  }
}

@Controller('desk')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeskRulesController {
  constructor(
    private readonly access: DeskAccessService,
    private readonly rules: DeskAutomation,
  ) {}

  @Get('rules')
  @RequirePermissions('desk.rule.manage')
  async list(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: DeskQueryDto) {
    return this.rules.list(await this.access.actor(req, t), q.deskId);
  }

  @Get('rules/schema')
  @RequirePermissions('desk.rule.manage')
  async schema(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: DeskQueryDto) {
    return this.rules.schema(await this.access.actor(req, t), q.deskId);
  }

  @Post('rules')
  @RequirePermissions('desk.rule.manage')
  async create(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: RuleDto) {
    assertOwnSession(req);
    return this.rules.create(await this.access.actor(req, t), dto);
  }

  @Patch('rules/:id')
  @RequirePermissions('desk.rule.manage')
  async update(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRuleDto) {
    assertOwnSession(req);
    return this.rules.update(await this.access.actor(req, t), id, dto);
  }

  @Post('rules/:id/status')
  @HttpCode(200)
  @RequirePermissions('desk.rule.manage')
  async status(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RuleStatusDto) {
    assertOwnSession(req);
    return this.rules.setStatus(await this.access.actor(req, t), id, dto.version, dto.status);
  }

  @Get('rules/:id/runs')
  @RequirePermissions('desk.rule.manage')
  async runs(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.rules.runs(await this.access.actor(req, t), id);
  }

  @Post('rules/:id/dry-run')
  @HttpCode(200)
  @RequirePermissions('desk.rule.manage')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  async dryRun(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.rules.dryRun(await this.access.actor(req, t), id);
  }

  @Post('recipes/:key/install')
  @RequirePermissions('desk.rule.manage')
  async install(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('key') key: string, @Body() dto: RecipeInstallDto) {
    assertOwnSession(req);
    if (!/^[a-z_]{1,40}$/.test(key)) throw new BadRequestException('No such recipe.');
    return this.rules.install(await this.access.actor(req, t), key, dto.deskId);
  }

  @Get('automation-webhooks')
  @RequirePermissions('desk.integration.manage')
  async webhooks(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.rules.webhooks(await this.access.actor(req, t));
  }

  /** The signing secret is shown once; making one needs a fresh second factor (§6.2). */
  @Post('automation-webhooks')
  @RequirePermissions('desk.integration.manage')
  @RequireStepUp()
  async addWebhook(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: WebhookDto) {
    assertOwnSession(req);
    return this.rules.createWebhook(await this.access.actor(req, t), dto.name, dto.url);
  }

  @Post('automation-webhooks/:id/active')
  @HttpCode(200)
  @RequirePermissions('desk.integration.manage')
  @RequireStepUp()
  async webhookActive(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WebhookActiveDto) {
    assertOwnSession(req);
    return this.rules.setWebhookActive(await this.access.actor(req, t), id, dto.active);
  }
}

/** The requester's catalogue, cart and requests (implicit role, YX-SD-16). */
@Controller('desk/my')
@UseGuards(JwtAuthGuard)
export class MyCatalogController {
  constructor(
    private readonly requesters: RequesterService,
    private readonly catalog: CatalogService,
  ) {}

  @Get('catalog')
  catalogue(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.catalog.catalogue(this.requesters.who(req, t));
  }

  @Get('catalog/items/:id')
  itemPage(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.itemPage(this.requesters.who(req, t), id);
  }

  @Get('catalog/guides/:id')
  guide(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.guide(this.requesters.who(req, t), id);
  }

  @Post('catalog/guides/:id/resolve')
  @HttpCode(200)
  resolveGuide(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnswersDto) {
    return this.catalog.resolveGuide(this.requesters.who(req, t), id, dto.answers ?? {});
  }

  @Post('catalog/checkout')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  checkout(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: CheckoutDto) {
    return this.catalog.checkout(this.requesters.who(req, t), dto);
  }

  @Get('requests/:id')
  request(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.myRequest(this.requesters.who(req, t), id);
  }

  @Post('requests/:id/cancel')
  @HttpCode(200)
  cancel(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDto) {
    return this.catalog.cancel(this.requesters.who(req, t), id, null, dto.reason);
  }

  @Post('requests/:id/items/:itemId/cancel')
  @HttpCode(200)
  cancelItem(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: CancelDto) {
    return this.catalog.cancel(this.requesters.who(req, t), id, itemId, dto.reason);
  }

  /** SD-2.02 live-data pickers. My devices and CMDB pickers switch on in 3b-3. */
  @Get('pick/:kind')
  @Throttle(PUBLIC_API_THROTTLE)
  pick(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('kind') kind: string, @Query() q: PickQueryDto) {
    if (kind === 'assets') return [];
    if (kind !== 'people' && kind !== 'locations' && kind !== 'cost-centres') throw new BadRequestException('Pick people, locations or cost centres.');
    return this.catalog.pick(this.requesters.who(req, t), kind, q.q ?? '');
  }
}
