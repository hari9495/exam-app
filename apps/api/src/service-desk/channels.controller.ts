import { Body, Controller, Delete, Get, Headers, HttpCode, INestApplication, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { raw } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CredentialThrottle } from '../auth/credential-throttler.guard';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard, assertStepUp } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { INBOUND_MAIL_THROTTLE, PUBLIC_API_THROTTLE, STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { CustomersService } from './customers.service';
import { DeskAccessService, assertOwnSession } from './desk-access';
import {
  AccountDto,
  AccountScopeDto,
  BannerDto,
  ContactDto,
  CustomerSearchDto,
  EmailRuleDto,
  EndEntitlementDto,
  EntitlementDto,
  InboundQueryDto,
  MailboxDto,
  OpenRequestDto,
  PortalDto,
  PortalEmailDto,
  PortalRaiseDto,
  PortalReplyDto,
  PortalVerifyDto,
  ProductDto,
  SendingDomainDto,
  TokenDto,
  UpdateAccountDto,
  UpdateContactDto,
  UpdateMailboxDto,
} from './dto-channels';
import { MailInService } from './mail-in.service';
import { MailOutService } from './mail-out.service';
import { PortalService } from './portal.service';

// M14 §12.1, batch 3: mailboxes, sending domains, email rules, held mail and the bounce list (desk.mailbox.manage),
// portals (desk.portal.manage), banners (agents of the desk), customers (desk.customer.manage; agents on Customer
// support desks may look them up). Every staff route declares its key (YX-SEC-01) and the service checks the seat.
// Two public surfaces, both without a session: the inbound mail webhook (signed per mailbox) and the outside portal
// (Turnstile, one-time codes, rate limits, then a portal session in the X-Portal-Session header).

export const INBOUND_MAIL_PATH = '/api/v1/desk/inbound/email';
/** Raw MIME bytes for the webhook (the signature covers them exactly). Mounted before the JSON parser. */
export function mountInboundMailBody(app: INestApplication): void {
  app.use(INBOUND_MAIL_PATH, raw({ type: () => true, limit: '30mb' }));
}

@Controller('desk')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeskChannelsController {
  constructor(
    private readonly access: DeskAccessService,
    private readonly mailIn: MailInService,
    private readonly mailOut: MailOutService,
    private readonly portals: PortalService,
    private readonly customers: CustomersService,
  ) {}

  private actor(req: Request, t: TenantContext) {
    return this.access.actor(req, t);
  }

  // ---------------------------------------------------------------- mailboxes (SD-1.19, SD-1.20)

  @Get('desks/:id/mailboxes')
  @RequirePermissions('desk.mailbox.manage')
  async mailboxes(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.mailIn.mailboxes(await this.actor(req, t), id);
  }

  /** Saving a mailbox's own credentials (IMAP password, Microsoft / Google app secret) needs a fresh second factor. */
  @Post('desks/:id/mailboxes')
  @RequirePermissions('desk.mailbox.manage')
  async addMailbox(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MailboxDto) {
    assertOwnSession(req);
    if (dto.config) assertStepUp(req.user as never);
    return this.mailIn.createMailbox(await this.actor(req, t), id, dto);
  }

  @Patch('desks/:id/mailboxes/:mailboxId')
  @RequirePermissions('desk.mailbox.manage')
  async editMailbox(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('mailboxId', ParseUUIDPipe) mailboxId: string, @Body() dto: UpdateMailboxDto) {
    assertOwnSession(req);
    if (dto.config) assertStepUp(req.user as never);
    return this.mailIn.updateMailbox(await this.actor(req, t), id, mailboxId, dto);
  }

  /** A new webhook address and signing secret, shown once. */
  @Post('desks/:id/mailboxes/:mailboxId/rotate')
  @RequirePermissions('desk.mailbox.manage')
  @RequireStepUp()
  @HttpCode(200)
  async rotate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('mailboxId', ParseUUIDPipe) mailboxId: string) {
    assertOwnSession(req);
    return this.mailIn.rotateMailbox(await this.actor(req, t), id, mailboxId);
  }

  @Get('desks/:id/mailboxes/:mailboxId/rules')
  @RequirePermissions('desk.mailbox.manage')
  async rules(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('mailboxId', ParseUUIDPipe) mailboxId: string) {
    return this.mailIn.rules(await this.actor(req, t), id, mailboxId);
  }

  @Post('desks/:id/mailboxes/:mailboxId/rules')
  @RequirePermissions('desk.mailbox.manage')
  async addRule(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('mailboxId', ParseUUIDPipe) mailboxId: string, @Body() dto: EmailRuleDto) {
    assertOwnSession(req);
    return this.mailIn.saveRule(await this.actor(req, t), id, mailboxId, null, dto);
  }

  @Patch('desks/:id/mailboxes/:mailboxId/rules/:ruleId')
  @RequirePermissions('desk.mailbox.manage')
  async editRule(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('mailboxId', ParseUUIDPipe) mailboxId: string, @Param('ruleId', ParseUUIDPipe) ruleId: string, @Body() dto: EmailRuleDto) {
    assertOwnSession(req);
    return this.mailIn.saveRule(await this.actor(req, t), id, mailboxId, ruleId, dto);
  }

  @Delete('desks/:id/mailboxes/:mailboxId/rules/:ruleId')
  @RequirePermissions('desk.mailbox.manage')
  async deleteRule(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('mailboxId', ParseUUIDPipe) mailboxId: string, @Param('ruleId', ParseUUIDPipe) ruleId: string) {
    assertOwnSession(req);
    return this.mailIn.deleteRule(await this.actor(req, t), id, mailboxId, ruleId);
  }

  @Get('desks/:id/inbound-emails')
  @RequirePermissions('desk.mailbox.manage')
  async inbound(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: InboundQueryDto) {
    return this.mailIn.inbound(await this.actor(req, t), id, q.verdict ?? 'held');
  }

  @Get('desks/:id/inbound-emails/:inboundId')
  @RequirePermissions('desk.mailbox.manage')
  async inboundOne(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('inboundId', ParseUUIDPipe) inboundId: string) {
    return this.mailIn.inboundOne(await this.actor(req, t), id, inboundId);
  }

  @Post('desks/:id/inbound-emails/:inboundId/release')
  @RequirePermissions('desk.mailbox.manage')
  @HttpCode(200)
  async release(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('inboundId', ParseUUIDPipe) inboundId: string) {
    assertOwnSession(req);
    return this.mailIn.release(await this.actor(req, t), id, inboundId);
  }

  // ---------------------------------------------------------------- sending domains and bounces (SD-1.18)

  @Get('sending-domains')
  @RequirePermissions('desk.mailbox.manage')
  async domains(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.mailOut.domains(await this.actor(req, t));
  }

  @Post('sending-domains')
  @RequirePermissions('desk.mailbox.manage')
  async addDomain(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: SendingDomainDto) {
    assertOwnSession(req);
    return this.mailOut.addDomain(await this.actor(req, t), dto.domain);
  }

  @Post('sending-domains/:id/verify-dns')
  @RequirePermissions('desk.mailbox.manage')
  @Throttle(STRICT_AUTH_THROTTLE)
  @HttpCode(200)
  async verifyDomain(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.mailOut.verifyDomain(await this.actor(req, t), id);
  }

  @Get('bounces')
  @RequirePermissions('desk.mailbox.manage')
  async bounces(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.mailOut.bounces(await this.actor(req, t));
  }

  @Post('bounces/:id/clear')
  @RequirePermissions('desk.mailbox.manage')
  @HttpCode(200)
  async clearBounce(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.mailOut.clearBounce(await this.actor(req, t), id);
  }

  // ---------------------------------------------------------------- portals (SD-1.21, SD-1.22)

  @Get('portals')
  @RequirePermissions('desk.portal.manage')
  async portalList(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.portals.portals(await this.actor(req, t));
  }

  @Post('portals')
  @RequirePermissions('desk.portal.manage')
  async addPortal(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: PortalDto) {
    assertOwnSession(req);
    return this.portals.savePortal(await this.actor(req, t), null, dto);
  }

  @Patch('portals/:id')
  @RequirePermissions('desk.portal.manage')
  async editPortal(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PortalDto) {
    assertOwnSession(req);
    return this.portals.savePortal(await this.actor(req, t), id, dto);
  }

  // ---------------------------------------------------------------- banners (SD-1.23)

  @Get('desks/:id/banners')
  @RequirePermissions('desk.ticket.work')
  async banners(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.portals.banners(await this.actor(req, t), id);
  }

  @Post('desks/:id/banners')
  @RequirePermissions('desk.ticket.work')
  async addBanner(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BannerDto) {
    assertOwnSession(req);
    return this.portals.saveBanner(await this.actor(req, t), id, null, dto);
  }

  @Patch('desks/:id/banners/:bannerId')
  @RequirePermissions('desk.ticket.work')
  async editBanner(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('bannerId', ParseUUIDPipe) bannerId: string, @Body() dto: BannerDto) {
    assertOwnSession(req);
    return this.portals.saveBanner(await this.actor(req, t), id, bannerId, dto);
  }

  @Post('desks/:id/banners/:bannerId/end')
  @RequirePermissions('desk.ticket.work')
  @HttpCode(200)
  async endBanner(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('bannerId', ParseUUIDPipe) bannerId: string) {
    assertOwnSession(req);
    return this.portals.endBanner(await this.actor(req, t), id, bannerId);
  }

  // ---------------------------------------------------------------- customers (SD-1.28)

  @Get('customers/accounts')
  @RequireAnyPermission('desk.customer.manage', 'desk.ticket.view')
  async accounts(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: CustomerSearchDto) {
    return this.customers.accounts(await this.actor(req, t), q.search ?? '');
  }

  @Get('customers/accounts/:id')
  @RequireAnyPermission('desk.customer.manage', 'desk.ticket.view')
  async account(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.account(await this.actor(req, t), id);
  }

  @Post('customers/accounts')
  @RequirePermissions('desk.customer.manage')
  async addAccount(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: AccountDto) {
    assertOwnSession(req);
    return this.customers.createAccount(await this.actor(req, t), dto);
  }

  @Patch('customers/accounts/:id')
  @RequirePermissions('desk.customer.manage')
  async editAccount(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccountDto) {
    assertOwnSession(req);
    return this.customers.updateAccount(await this.actor(req, t), id, dto);
  }

  @Post('customers/accounts/:id/contacts')
  @RequirePermissions('desk.customer.manage')
  async addContact(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ContactDto) {
    assertOwnSession(req);
    return this.customers.addContact(await this.actor(req, t), id, dto);
  }

  @Patch('customers/contacts/:contactId')
  @RequirePermissions('desk.customer.manage')
  async editContact(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('contactId', ParseUUIDPipe) contactId: string, @Body() dto: UpdateContactDto) {
    assertOwnSession(req);
    return this.customers.updateContact(await this.actor(req, t), contactId, dto);
  }

  @Post('customers/accounts/:id/entitlements')
  @RequirePermissions('desk.customer.manage')
  async addEntitlement(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EntitlementDto) {
    assertOwnSession(req);
    return this.customers.addEntitlement(await this.actor(req, t), id, dto);
  }

  @Post('customers/entitlements/:entitlementId/end')
  @RequirePermissions('desk.customer.manage')
  @HttpCode(200)
  async endEntitlement(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('entitlementId', ParseUUIDPipe) entitlementId: string, @Body() dto: EndEntitlementDto) {
    assertOwnSession(req);
    return this.customers.endEntitlement(await this.actor(req, t), entitlementId, dto);
  }

  @Get('customers/products')
  @RequireAnyPermission('desk.customer.manage', 'desk.ticket.view')
  async products(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.customers.products(await this.actor(req, t));
  }

  @Post('customers/products')
  @RequirePermissions('desk.customer.manage')
  async addProduct(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: ProductDto) {
    assertOwnSession(req);
    return this.customers.saveProduct(await this.actor(req, t), null, dto);
  }

  @Patch('customers/products/:productId')
  @RequirePermissions('desk.customer.manage')
  async editProduct(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('productId', ParseUUIDPipe) productId: string, @Body() dto: ProductDto) {
    assertOwnSession(req);
    return this.customers.saveProduct(await this.actor(req, t), productId, dto);
  }

  @Get('customers/agents/:userId/accounts')
  @RequirePermissions('desk.customer.manage')
  async agentScope(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.customers.agentScope(await this.actor(req, t), userId);
  }

  @Put('customers/agents/:userId/accounts')
  @RequirePermissions('desk.customer.manage')
  async setAgentScope(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('userId', ParseUUIDPipe) userId: string, @Body() dto: AccountScopeDto) {
    assertOwnSession(req);
    return this.customers.setAgentScope(await this.actor(req, t), userId, dto);
  }
}

/** §9.1 hosted / forwarded mail: the provider posts raw MIME here. No session; signed per mailbox (MailInService). */
@Controller('desk/inbound/email')
export class InboundMailController {
  constructor(private readonly mailIn: MailInService) {}

  @Post(':org/:token')
  @HttpCode(202)
  @Throttle(INBOUND_MAIL_THROTTLE)
  receive(@Param('org', ParseUUIDPipe) org: string, @Param('token') token: string, @Req() req: Request, @Body() body: unknown) {
    return this.mailIn.webhook(org, String(token), req.headers, Buffer.isBuffer(body) ? body : Buffer.alloc(0), req.ip ?? null);
  }
}

/**
 * §9.3 / US-G-021 the outside portal at /yx/portal/<company>/<portal>. Public steps are Turnstile-checked and limited
 * (one-time codes as P12; open requests 5 per email and 20 per IP an hour); signed-in steps carry X-Portal-Session.
 */
@Controller('desk/portal')
export class PortalController {
  constructor(private readonly portals: PortalService) {}

  private session(org: string, portal: string, token: string | undefined) {
    return this.portals.session(org, portal, token);
  }

  @Get(':org/:portal')
  @Throttle(PUBLIC_API_THROTTLE)
  info(@Param('org') org: string, @Param('portal') portal: string) {
    return this.portals.info(slug(org), slug(portal));
  }

  @Post(':org/:portal/sign-in')
  @HttpCode(200)
  @CredentialThrottle()
  signIn(@Param('org') org: string, @Param('portal') portal: string, @Body() dto: PortalEmailDto, @Req() req: Request) {
    return this.portals.startSignIn(slug(org), slug(portal), dto, req.ip ?? null);
  }

  @Post(':org/:portal/verify')
  @HttpCode(200)
  @CredentialThrottle()
  verify(@Param('org') org: string, @Param('portal') portal: string, @Body() dto: PortalVerifyDto, @Req() req: Request) {
    return this.portals.verifySignIn(slug(org), slug(portal), dto, req.ip ?? null);
  }

  @Post(':org/:portal/requests')
  @HttpCode(202)
  @Throttle(STRICT_AUTH_THROTTLE)
  request(@Param('org') org: string, @Param('portal') portal: string, @Body() dto: OpenRequestDto, @Req() req: Request) {
    return this.portals.openRequest(slug(org), slug(portal), dto, req.ip ?? null);
  }

  @Post(':org/:portal/requests/confirm')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  confirm(@Param('org') org: string, @Param('portal') portal: string, @Body() dto: TokenDto, @Req() req: Request) {
    return this.portals.confirm(slug(org), slug(portal), dto.token, req.ip ?? null);
  }

  @Get(':org/:portal/me')
  @Throttle(PUBLIC_API_THROTTLE)
  async me(@Param('org') org: string, @Param('portal') portal: string, @Headers('x-portal-session') token?: string) {
    return this.portals.me(await this.session(slug(org), slug(portal), token));
  }

  @Get(':org/:portal/tickets')
  @Throttle(PUBLIC_API_THROTTLE)
  async list(@Param('org') org: string, @Param('portal') portal: string, @Headers('x-portal-session') token?: string) {
    return this.portals.list(await this.session(slug(org), slug(portal), token));
  }

  @Post(':org/:portal/tickets')
  @Throttle(STRICT_AUTH_THROTTLE)
  async raise(@Param('org') org: string, @Param('portal') portal: string, @Body() dto: PortalRaiseDto, @Headers('x-portal-session') token?: string) {
    return this.portals.raise(await this.session(slug(org), slug(portal), token), dto);
  }

  @Get(':org/:portal/tickets/:id')
  @Throttle(PUBLIC_API_THROTTLE)
  async get(@Param('org') org: string, @Param('portal') portal: string, @Param('id', ParseUUIDPipe) id: string, @Headers('x-portal-session') token?: string) {
    return this.portals.get(await this.session(slug(org), slug(portal), token), id);
  }

  @Post(':org/:portal/tickets/:id/messages')
  @Throttle(PUBLIC_API_THROTTLE)
  async reply(@Param('org') org: string, @Param('portal') portal: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PortalReplyDto, @Headers('x-portal-session') token?: string) {
    return this.portals.reply(await this.session(slug(org), slug(portal), token), id, dto.text);
  }

  @Post(':org/:portal/banners/:bannerId/me-too')
  @HttpCode(200)
  @Throttle(PUBLIC_API_THROTTLE)
  async meToo(@Param('org') org: string, @Param('portal') portal: string, @Param('bannerId', ParseUUIDPipe) bannerId: string, @Headers('x-portal-session') token?: string) {
    return this.portals.meToo(await this.session(slug(org), slug(portal), token), bannerId);
  }

  @Post(':org/:portal/sign-out')
  @HttpCode(200)
  async signOut(@Param('org') org: string, @Param('portal') portal: string, @Headers('x-portal-session') token?: string) {
    return this.portals.signOut(await this.session(slug(org), slug(portal), token));
  }
}

/** Slugs in the path, checked before any lookup. */
function slug(v: string): string {
  const s = String(v ?? '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(s)) return '-';
  return s;
}
