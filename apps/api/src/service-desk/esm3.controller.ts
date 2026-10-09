import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, INestApplication, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, raw } from 'express';
import { TenantContext, clientIpOf } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard, assertStepUp } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { INBOUND_MAIL_THROTTLE, MODERATE_UPLOAD_THROTTLE, PUBLIC_API_THROTTLE } from '../rate-limit-tiers';
import { DeskAccessService, assertOwnSession } from './desk-access';
import {
  AgentMailboxDto,
  AgentRoutingDto,
  DayRangeDto,
  DevMessageDto,
  DraftDto,
  ForecastQueryDto,
  MsgChannelDto,
  PhoneKindDto,
  PresenceDto,
  QueueQueryDto,
  SendDraftDto,
  ShiftDto,
  ShiftImportDto,
  UpdateMsgChannelDto,
  UpdateWidgetDto,
  WidgetDto,
  WidgetSessionDto,
} from './dto-esm3';
import { MailboxSyncService } from './mailbox-sync.service';
import { MSG_KINDS, MsgKind, sameSecret } from './messaging';
import { CHAT_MFA_HOURS, INBOUND_MSG_PATH, MessagingService } from './messaging.service';
import { MobileService } from './mobile.service';
import { RequesterService } from './requester.service';
import { TeamService } from './team.service';
import { WidgetService } from './widget.service';

// M14 §12.2, batch 3 (SD-2.20 … SD-2.27). Staff routes declare their key (YX-SEC-01) and the services check the seat on
// the desk; changes to secrets need a fresh second factor; nothing is changed by someone acting for another person.
// Three public surfaces, none with a session: the messaging webhooks (signed, replay window), the widget's config and
// its signed sign-in, and the requester's own channels (signed-in, implicit like their own tickets).

/** Webhook bodies are verified over their exact bytes: mounted before the JSON parser. */
export function mountInboundMsgBody(app: INestApplication): void {
  app.use(INBOUND_MSG_PATH, raw({ type: () => true, limit: '256kb' }));
}

const CLIENT_REF = /^[A-Za-z0-9_-]{8,64}$/;
const ref = (v: string) => {
  if (!CLIENT_REF.test(v)) throw new BadRequestException('A draft reference is 8 to 64 letters, digits, - or _.');
  return v;
};

@Controller('desk')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeskEsm3Controller {
  constructor(
    private readonly access: DeskAccessService,
    private readonly messaging: MessagingService,
    private readonly widgets: WidgetService,
    private readonly team: TeamService,
    private readonly mailboxes: MailboxSyncService,
    private readonly mobile: MobileService,
  ) {}

  // ---------------------------------------------------------------- messaging lines (SD-2.21 … SD-2.23)

  @Get('desks/:id/msg-channels')
  @RequirePermissions('desk.channel.manage')
  async channels(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.messaging.channels(await this.access.actor(req, t), id);
  }

  @Post('desks/:id/msg-channels')
  @RequirePermissions('desk.channel.manage')
  async addChannel(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MsgChannelDto) {
    assertOwnSession(req);
    return this.messaging.createChannel(await this.access.actor(req, t), id, dto);
  }

  @Patch('msg-channels/:id')
  @RequirePermissions('desk.channel.manage')
  async editChannel(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMsgChannelDto) {
    assertOwnSession(req);
    return this.messaging.updateChannel(await this.access.actor(req, t), id, dto);
  }

  /** A new webhook address and signing secret, shown once. */
  @Post('msg-channels/:id/rotate')
  @HttpCode(200)
  @RequirePermissions('desk.channel.manage')
  @RequireStepUp()
  async rotateChannel(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.messaging.rotate(await this.access.actor(req, t), id);
  }

  // ---------------------------------------------------------------- help widgets (SD-2.20)

  @Get('widgets')
  @RequirePermissions('desk.channel.manage')
  async widgetList(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.widgets.list(await this.access.actor(req, t));
  }

  @Post('widgets')
  @RequirePermissions('desk.channel.manage')
  async addWidget(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: WidgetDto) {
    assertOwnSession(req);
    return this.widgets.create(await this.access.actor(req, t), dto);
  }

  @Patch('widgets/:id')
  @RequirePermissions('desk.channel.manage')
  async editWidget(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWidgetDto) {
    assertOwnSession(req);
    return this.widgets.update(await this.access.actor(req, t), id, dto);
  }

  /** A new signing secret for the company's server, shown once. */
  @Post('widgets/:id/rotate')
  @HttpCode(200)
  @RequirePermissions('desk.channel.manage')
  @RequireStepUp()
  async rotateWidget(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.widgets.rotate(await this.access.actor(req, t), id);
  }

  // ---------------------------------------------------------------- presence, capacity, team (SD-2.25)

  @Put('me/presence')
  @RequireAnyPermission('desk.ticket.work', 'desk.chat.work')
  async presence(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: PresenceDto) {
    assertOwnSession(req);
    return this.team.setPresence(await this.access.actor(req, t), dto);
  }

  @Get('desks/:id/team')
  @RequireAnyPermission('desk.ticket.assign', 'desk.report.view')
  async teamView(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.team.team(await this.access.actor(req, t), id);
  }

  @Put('desks/:id/agents/:userId/routing')
  @RequirePermissions('desk.ticket.assign')
  async routing(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string, @Body() dto: AgentRoutingDto) {
    assertOwnSession(req);
    return this.team.setRouting(await this.access.actor(req, t), id, userId, dto);
  }

  // ---------------------------------------------------------------- shifts, forecast, reports (SD-2.26)

  @Get('desks/:id/shifts')
  @RequirePermissions('desk.ticket.view')
  async shifts(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: DayRangeDto) {
    return this.team.shifts(await this.access.actor(req, t), id, q.from, q.to);
  }

  @Post('desks/:id/shifts')
  @RequirePermissions('desk.ticket.assign')
  async addShift(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ShiftDto) {
    assertOwnSession(req);
    return this.team.addShift(await this.access.actor(req, t), id, dto);
  }

  @Post('desks/:id/shifts/import')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.assign')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  async importShifts(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ShiftImportDto) {
    assertOwnSession(req);
    return this.team.importShifts(await this.access.actor(req, t), id, dto);
  }

  @Delete('shifts/:id')
  @RequirePermissions('desk.ticket.assign')
  async removeShift(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.team.removeShift(await this.access.actor(req, t), id);
  }

  @Get('desks/:id/forecast')
  @RequirePermissions('desk.report.view')
  async forecast(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: ForecastQueryDto) {
    return this.team.forecast(await this.access.actor(req, t), id, q.days ?? 14, q.perAgent ?? 20);
  }

  @Get('desks/:id/availability')
  @RequirePermissions('desk.report.view')
  async availability(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: DayRangeDto) {
    return this.team.availability(await this.access.actor(req, t), id, q.from, q.to);
  }

  // ---------------------------------------------------------------- agent mailbox (SD-2.24)

  @Get('me/mailbox')
  @RequirePermissions('desk.ticket.work')
  async myMailbox(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.mailboxes.mine(await this.access.actor(req, t));
  }

  /** Linking a mailbox with its own credentials needs a fresh second factor. */
  @Post('me/mailbox')
  @RequirePermissions('desk.ticket.work')
  async linkMailbox(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: AgentMailboxDto) {
    assertOwnSession(req);
    if (dto.kind !== 'dev') assertStepUp(req.user as never);
    return this.mailboxes.link(await this.access.actor(req, t), dto);
  }

  @Delete('me/mailbox')
  @RequirePermissions('desk.ticket.work')
  async unlinkMailbox(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    assertOwnSession(req);
    return this.mailboxes.unlink(await this.access.actor(req, t));
  }

  /**
   * Founder decision 9 Oct 2026: claim, reply and note from Teams / Slack need a YukthiX second factor in the last 12
   * hours. The bot's "confirm it is you" link lands here: the step-up (logged by the guard as step_up.used) is the proof.
   */
  @Post('me/chat-confirm')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  @RequireStepUp()
  chatConfirm(@Req() req: Request) {
    assertOwnSession(req);
    return { confirmed: true, validForHours: CHAT_MFA_HOURS };
  }

  // ---------------------------------------------------------------- agent mobile app (SD-2.27)

  @Get('mobile/home')
  @RequirePermissions('desk.ticket.view')
  async home(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.mobile.home(await this.access.actor(req, t));
  }

  @Get('mobile/queue')
  @RequirePermissions('desk.ticket.view')
  async queue(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: QueueQueryDto) {
    return this.mobile.queue(await this.access.actor(req, t), q.scope ?? 'mine');
  }

  @Get('mobile/drafts')
  @RequirePermissions('desk.ticket.view')
  async drafts(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.mobile.drafts(await this.access.actor(req, t));
  }

  @Put('mobile/drafts/:ref')
  @RequireAnyPermission('desk.ticket.work', 'desk.ticket.note')
  async saveDraft(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('ref') r: string, @Body() dto: DraftDto) {
    assertOwnSession(req);
    return this.mobile.saveDraft(await this.access.actor(req, t), ref(r), dto);
  }

  @Delete('mobile/drafts/:ref')
  @RequireAnyPermission('desk.ticket.work', 'desk.ticket.note')
  async removeDraft(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('ref') r: string) {
    return this.mobile.removeDraft(await this.access.actor(req, t), ref(r));
  }

  @Post('mobile/drafts/:ref/send')
  @HttpCode(200)
  @RequireAnyPermission('desk.ticket.work', 'desk.ticket.note')
  async sendDraft(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('ref') r: string, @Body() dto: SendDraftDto) {
    assertOwnSession(req);
    return this.mobile.sendDraft(await this.access.actor(req, t), ref(r), dto);
  }
}

/** The person's own messaging channels (implicit, like their own tickets): link a phone, stop it, the demo phone. */
@Controller('desk/my/messaging')
@UseGuards(JwtAuthGuard)
export class MyMessagingController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly requesters: RequesterService,
  ) {}

  @Get()
  mine(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.messaging.mine(this.requesters.who(req, t));
  }

  /** A code to send from the phone ("JOIN <code>"): sending it is the opt-in. */
  @Post('join')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  join(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: PhoneKindDto) {
    return this.messaging.joinCode(this.requesters.who(req, t), dto.kind);
  }

  @Delete(':kind')
  unlink(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param() p: PhoneKindDto) {
    return this.messaging.unlink(this.requesters.who(req, t), p.kind);
  }

  /** The local demo only (dev transport): what was sent to my own phone and chat apps. */
  @Get('dev-outbox')
  devOutbox(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.messaging.devOutbox(this.requesters.who(req, t));
  }

  /** The local demo only (dev transport): send from my own linked phone or chat app through the signed webhook path. */
  @Post('dev-send')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  devSend(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: DevMessageDto) {
    return this.messaging.devSend(this.requesters.who(req, t), dto);
  }
}

/**
 * Provider webhooks (no session). A company line: /desk/inbound/msg/:org/:token, signed with the line's own secret
 * (or the company's Meta app secret). YukthiX's shared number and apps: /desk/inbound/msg/shared/:kind, signed with
 * YukthiX's secrets. Every refusal is the same bare 401.
 */
@Controller('desk/inbound/msg')
export class InboundMsgController {
  constructor(private readonly messaging: MessagingService) {}

  private kind(k: string): MsgKind {
    if (!(MSG_KINDS as readonly string[]).includes(k)) throw new NotFoundException('No such channel.');
    return k as MsgKind;
  }

  /** Meta's subscription check for the shared number: echo the challenge only for our own verify token. */
  @Get('shared/whatsapp')
  @Throttle(PUBLIC_API_THROTTLE)
  verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string) {
    const want = process.env.YX_WHATSAPP_VERIFY_TOKEN;
    if (mode !== 'subscribe' || !want || typeof token !== 'string' || !sameSecret(token, want) || !/^[A-Za-z0-9_-]{1,100}$/.test(String(challenge))) throw new NotFoundException('No such channel.');
    return challenge;
  }

  @Post('shared/:kind')
  @HttpCode(200)
  @Throttle(INBOUND_MAIL_THROTTLE)
  shared(@Param('kind') kind: string, @Headers() headers: Record<string, string>, @Body() body: unknown) {
    return this.messaging.webhook({ shared: this.kind(kind) }, Buffer.isBuffer(body) ? body : Buffer.alloc(0), headers);
  }

  @Post(':org/:token')
  @HttpCode(200)
  @Throttle(INBOUND_MAIL_THROTTLE)
  company(@Param('org', ParseUUIDPipe) org: string, @Param('token') token: string, @Headers() headers: Record<string, string>, @Body() body: unknown) {
    return this.messaging.webhook({ org, token: String(token) }, Buffer.isBuffer(body) ? body : Buffer.alloc(0), headers);
  }
}

/** SD-2.20: the widget's public config and its signed sign-in (browsers through our iframe, and the mobile SDKs). */
@Controller('desk/widget')
export class WidgetPublicController {
  constructor(private readonly widgets: WidgetService) {}

  @Get(':key')
  @Throttle(PUBLIC_API_THROTTLE)
  config(@Param('key') key: string) {
    return this.widgets.config(key);
  }

  @Post(':key/session')
  @HttpCode(200)
  @Throttle(PUBLIC_API_THROTTLE)
  session(@Param('key') key: string, @Body() dto: WidgetSessionDto, @Req() req: Request) {
    // A sandboxed page sends "null": that is a browser, never a mobile SDK, so it is refused like any other site.
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
    return this.widgets.session(key, dto, origin, clientIpOf(req));
  }
}

/**
 * Founder decision 9 Oct 2026: an SMS says only "You have a reply on <number>" with this link. No session: the random
 * key in the link is the only key, it works once and expires (DESK_REPLY_LINK_HOURS). Opening the page (GET) uses
 * nothing up (phones preview links); the person presses "Read the reply" (POST).
 */
@Controller('desk/reply-link')
export class ReplyLinkController {
  constructor(private readonly messaging: MessagingService) {}

  @Get(':token')
  @Throttle(PUBLIC_API_THROTTLE)
  info(@Param('token') token: string) {
    return this.messaging.readLinkInfo(token);
  }

  @Post(':token')
  @HttpCode(200)
  @Throttle(PUBLIC_API_THROTTLE)
  open(@Param('token') token: string) {
    return this.messaging.readLinkOpen(token);
  }
}
