import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Tx } from '../org-structure/org-structure.service';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { PlatformStaffGuard } from '../platform/platform-staff.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PUBLIC_API_THROTTLE, STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { assertOwnSession, companyOf } from './desk-access';
import { DirectoryService } from './directory.service';
import { KbArticleQueryDto, KbClickDto, KbFeedbackDto, KbSearchDto } from './dto-kb';
import { ConsoleLinkDto, ConsoleMessageDto, ConsoleQueueDto, ConsoleResolveDto, LinkAnswerDto, LinkCommentDto, PrivacyRequestDto, RatingDto, SignUpDto, SupportAccessDto, SupportRaiseDto, SupportReplyDto } from './dto-ops';
import { KbService } from './kb.service';
import { PortalService } from './portal.service';
import { PrivacyService } from './privacy.service';
import { ReportsService } from './reports.service';
import { RequesterService } from './requester.service';
import { SupportBridgeService } from './support-bridge.service';
import { SurveysService } from './surveys.service';

// M14 §12.1 batch 4 routes that are not desk staff routes:
//   - the requester's own (implicit, YX-SD-16): help articles, rating their ticket, their privacy requests;
//   - the outside portal's knowledge, rating and privacy requests (its own session, or public articles only);
//   - public, no session: the help centre /yx/help/<company>/<space> (read-only, 60 a minute per IP), the one-click
//     rating link, the wall screen link, Service Desk sign-up (Turnstile, 5 a minute per IP), SCIM (bearer per source);
//   - YukthiX support: the customer company's System Admin (org.yukthix_support.raise) through the two bridge functions,
//     and YukthiX staff in the console (platform.support_desk.work, security key session only).

const slug = (v: string) => {
  const s = String(v ?? '').toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(s) ? s : '-';
};

/** The requester's own help articles, ratings and privacy requests (no key: their own records only). */
@Controller('desk/my')
@UseGuards(JwtAuthGuard)
export class MyHelpController {
  constructor(
    private readonly requesters: RequesterService,
    private readonly kb: KbService,
    private readonly surveys: SurveysService,
    private readonly privacy: PrivacyService,
  ) {}

  @Get('kb')
  kbHome(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.kb.employeeHome(this.requesters.who(req, t));
  }

  /** US-B-105: articles while the person types (the help centre and the in-app drawer). */
  @Get('kb/suggest')
  @Throttle(PUBLIC_API_THROTTLE)
  suggest(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: KbSearchDto, @Query('from') from?: string) {
    return this.kb.employeeSuggest(this.requesters.who(req, t), q.q, from === 'drawer' ? 'drawer' : 'help');
  }

  @Get('kb/articles/:number')
  kbArticle(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('number', ParseIntPipe) n: number, @Query() q: KbArticleQueryDto) {
    return this.kb.employeeArticle(this.requesters.who(req, t), n, q.lang);
  }

  @Post('kb/articles/:id/feedback')
  @HttpCode(200)
  async kbFeedback(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: KbFeedbackDto) {
    const r = this.requesters.who(req, t);
    return this.kb.employeeFeedback(r, id, dto, await this.requesters.personIdOf(r));
  }

  @Post('kb/click')
  @HttpCode(200)
  kbClick(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: KbClickDto) {
    return this.kb.employeeClick(this.requesters.who(req, t), dto.q, dto.articleId);
  }

  /** US-B-108: the requester rates their own solved ticket. */
  @Post('tickets/:id/rating')
  @HttpCode(200)
  rate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RatingDto) {
    return this.surveys.rateMine(this.requesters.who(req, t), id, dto.score, dto.comment);
  }

  @Get('privacy-requests')
  privacyRequests(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.privacy.mine(this.requesters.who(req, t));
  }

  @Post('privacy-requests')
  @Throttle(STRICT_AUTH_THROTTLE)
  askPrivacy(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: PrivacyRequestDto) {
    return this.privacy.askMine(this.requesters.who(req, t), dto);
  }

  @Get('privacy-requests/:id/export')
  privacyExport(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.privacy.myExport(this.requesters.who(req, t), id);
  }
}

/** The outside portal's batch-4 routes. Knowledge works signed in (requester articles too) or not (public only). */
@Controller('desk/portal')
export class PortalHelpController {
  constructor(
    private readonly portals: PortalService,
    private readonly kb: KbService,
    private readonly surveys: SurveysService,
    private readonly privacy: PrivacyService,
  ) {}

  private async reader(org: string, portal: string, token?: string) {
    const p = await this.portals.portalOf(slug(org), slug(portal));
    const s = token ? await this.portals.session(slug(org), slug(portal), token) : null;
    const run = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => (s ? this.portals.asPortal(s, fn) : this.portals.asVisitor(p.org.id, fn));
    return { orgId: p.org.id, deskIds: p.deskIds, s, run };
  }

  @Get(':org/:portal/kb/suggest')
  @Throttle(PUBLIC_API_THROTTLE)
  async suggest(@Param('org') org: string, @Param('portal') portal: string, @Query() q: KbSearchDto, @Headers('x-portal-session') token?: string) {
    const r = await this.reader(org, portal, token);
    return this.kb.portalSuggest(r.orgId, r.deskIds, r.s, q.q, r.run);
  }

  @Get(':org/:portal/kb/articles/:number')
  @Throttle(PUBLIC_API_THROTTLE)
  async article(@Param('org') org: string, @Param('portal') portal: string, @Param('number', ParseIntPipe) n: number, @Query() q: KbArticleQueryDto, @Headers('x-portal-session') token?: string) {
    const r = await this.reader(org, portal, token);
    return this.kb.portalArticle(r.orgId, r.deskIds, r.s, n, q.lang, r.run);
  }

  @Post(':org/:portal/kb/articles/:id/feedback')
  @HttpCode(200)
  @Throttle(PUBLIC_API_THROTTLE)
  async feedback(@Param('org') org: string, @Param('portal') portal: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: KbFeedbackDto, @Headers('x-portal-session') token?: string) {
    const r = await this.reader(org, portal, token);
    // Strangers leave thumbs and "solved" only; a signed-in customer may add a comment.
    return this.kb.portalFeedback(r.orgId, r.deskIds, r.s, id, r.s ? dto : { helpful: dto.helpful, solved: dto.solved }, r.run);
  }

  @Post(':org/:portal/tickets/:id/rating')
  @HttpCode(200)
  @Throttle(PUBLIC_API_THROTTLE)
  async rate(@Param('org') org: string, @Param('portal') portal: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RatingDto, @Headers('x-portal-session') token?: string) {
    const s = await this.portals.session(slug(org), slug(portal), token);
    return this.surveys.ratePortal(s, id, dto.score, dto.comment, (fn) => this.portals.asPortal(s, fn));
  }

  @Get(':org/:portal/privacy-requests')
  @Throttle(PUBLIC_API_THROTTLE)
  async privacyList(@Param('org') org: string, @Param('portal') portal: string, @Headers('x-portal-session') token?: string) {
    return this.privacy.minePortal(await this.portals.session(slug(org), slug(portal), token));
  }

  @Post(':org/:portal/privacy-requests')
  @Throttle(STRICT_AUTH_THROTTLE)
  async privacyAsk(@Param('org') org: string, @Param('portal') portal: string, @Body() dto: PrivacyRequestDto, @Headers('x-portal-session') token?: string) {
    return this.privacy.askPortal(await this.portals.session(slug(org), slug(portal), token), dto);
  }

  @Get(':org/:portal/privacy-requests/:id/export')
  @Throttle(PUBLIC_API_THROTTLE)
  async privacyExport(@Param('org') org: string, @Param('portal') portal: string, @Param('id', ParseUUIDPipe) id: string, @Headers('x-portal-session') token?: string) {
    return this.privacy.portalExport(await this.portals.session(slug(org), slug(portal), token), id);
  }
}

/** US-B-107 / US-G-215: the public help centre (no session, public articles only, read-only). */
@Controller('desk/help-centre')
export class PublicHelpController {
  constructor(private readonly kb: KbService) {}

  @Get(':org/:space')
  @Throttle(PUBLIC_API_THROTTLE)
  home(@Param('org') org: string, @Param('space') space: string) {
    return this.kb.publicHome(slug(org), slug(space));
  }

  @Get(':org/:space/search')
  @Throttle(PUBLIC_API_THROTTLE)
  search(@Param('org') org: string, @Param('space') space: string, @Query() q: KbSearchDto) {
    return this.kb.publicSearch(slug(org), slug(space), q.q);
  }

  @Get(':org/:space/sitemap.xml')
  @Throttle(PUBLIC_API_THROTTLE)
  @Header('Content-Type', 'application/xml; charset=utf-8')
  sitemap(@Param('org') org: string, @Param('space') space: string) {
    return this.kb.sitemap(slug(org), slug(space));
  }

  @Get(':org/:space/articles/:key')
  @Throttle(PUBLIC_API_THROTTLE)
  article(@Param('org') org: string, @Param('space') space: string, @Param('key') key: string, @Query() q: KbArticleQueryDto) {
    return this.kb.publicArticle(slug(org), slug(space), /^[a-z0-9-]{1,80}$/.test(key) ? key : '-', q.lang);
  }

  @Post(':org/:space/articles/:id/feedback')
  @HttpCode(200)
  @Throttle(PUBLIC_API_THROTTLE)
  feedback(@Param('org') org: string, @Param('space') space: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: KbFeedbackDto) {
    return this.kb.publicFeedback(slug(org), slug(space), id, dto);
  }
}

/** SD-1.26: the one-click rating link (no session; the single-use secret in the link is the key). */
@Controller('desk/rate')
export class RateLinkController {
  constructor(private readonly surveys: SurveysService) {}

  @Get(':org/:token')
  @Throttle(PUBLIC_API_THROTTLE)
  info(@Param('org', ParseUUIDPipe) org: string, @Param('token') token: string) {
    return this.surveys.linkInfo(org, token);
  }

  @Post(':org/:token')
  @HttpCode(200)
  @Throttle(PUBLIC_API_THROTTLE)
  answer(@Param('org', ParseUUIDPipe) org: string, @Param('token') token: string, @Body() dto: LinkAnswerDto) {
    return this.surveys.answerLink(org, token, dto.score);
  }

  @Post(':org/:token/comment')
  @HttpCode(200)
  @Throttle(PUBLIC_API_THROTTLE)
  comment(@Param('org', ParseUUIDPipe) org: string, @Param('token') token: string, @Body() dto: LinkCommentDto) {
    return this.surveys.commentLink(org, token, dto.comment);
  }
}

/** US-G-028: the wall screen (no session; the secret in the link is the key; counts only). */
@Controller('desk/wall')
export class WallController {
  constructor(private readonly reports: ReportsService) {}

  @Get(':org/:token')
  @Throttle(PUBLIC_API_THROTTLE)
  wall(@Param('org', ParseUUIDPipe) org: string, @Param('token') token: string) {
    return this.reports.wall(org, token);
  }
}

/** US-B-121: a company that uses only the Service Desk signs up (30-day trial, no card). */
@Controller('desk/signup')
export class SignUpController {
  constructor(private readonly directory: DirectoryService) {}

  @Post()
  @Throttle(STRICT_AUTH_THROTTLE)
  signUp(@Body() dto: SignUpDto, @Req() req: Request) {
    return this.directory.signUp(dto, req.ip ?? null);
  }
}

/** US-G-032 SCIM 2.0 for one directory source: the bearer token works only here (sha256 in the database). */
@Controller('desk/scim/:org/:source/v2')
export class ScimController {
  constructor(private readonly directory: DirectoryService) {}

  private base(org: string, source: string) {
    return `${(process.env.API_ORIGIN ?? 'http://localhost:3001').replace(/\/$/, '')}/api/v1/desk/scim/${org}/${source}/v2`;
  }

  private async src(org: string, source: string, auth?: string) {
    return this.directory.scimSource(org, source, auth);
  }

  @Get('ServiceProviderConfig')
  config() {
    return { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'], patch: { supported: true }, bulk: { supported: false }, filter: { supported: true, maxResults: 200 }, changePassword: { supported: false }, sort: { supported: false }, etag: { supported: false }, authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Bearer token', description: 'The token shown once when the source was made' }] };
  }

  @Get('Users')
  @Throttle(PUBLIC_API_THROTTLE)
  async users(@Param('org', ParseUUIDPipe) org: string, @Param('source', ParseUUIDPipe) source: string, @Headers('authorization') auth?: string, @Query('filter') filter?: string, @Query('startIndex') start?: string, @Query('count') count?: string) {
    const s = await this.src(org, source, auth);
    return this.directory.scimList(org, s, this.base(org, source), filter, Math.max(1, Number(start) || 1), Number(count) || 100);
  }

  @Get('Users/:id')
  @Throttle(PUBLIC_API_THROTTLE)
  async user(@Param('org', ParseUUIDPipe) org: string, @Param('source', ParseUUIDPipe) source: string, @Param('id', ParseUUIDPipe) id: string, @Headers('authorization') auth?: string) {
    return this.directory.scimGet(org, await this.src(org, source, auth), this.base(org, source), id);
  }

  @Post('Users')
  @Throttle(PUBLIC_API_THROTTLE)
  async create(@Param('org', ParseUUIDPipe) org: string, @Param('source', ParseUUIDPipe) source: string, @Body() body: Record<string, unknown>, @Headers('authorization') auth?: string) {
    return this.directory.scimCreate(org, await this.src(org, source, auth), this.base(org, source), body);
  }

  @Put('Users/:id')
  @Throttle(PUBLIC_API_THROTTLE)
  async replace(@Param('org', ParseUUIDPipe) org: string, @Param('source', ParseUUIDPipe) source: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>, @Headers('authorization') auth?: string) {
    return this.directory.scimReplace(org, await this.src(org, source, auth), this.base(org, source), id, body);
  }

  @Patch('Users/:id')
  @Throttle(PUBLIC_API_THROTTLE)
  async patch(@Param('org', ParseUUIDPipe) org: string, @Param('source', ParseUUIDPipe) source: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>, @Headers('authorization') auth?: string) {
    return this.directory.scimPatch(org, await this.src(org, source, auth), this.base(org, source), id, body as never);
  }

  @Delete('Users/:id')
  @HttpCode(204)
  @Throttle(PUBLIC_API_THROTTLE)
  async remove(@Param('org', ParseUUIDPipe) org: string, @Param('source', ParseUUIDPipe) source: string, @Param('id', ParseUUIDPipe) id: string, @Headers('authorization') auth?: string) {
    await this.directory.scimDelete(org, await this.src(org, source, auth), id);
  }

  @Get('Groups')
  @Throttle(PUBLIC_API_THROTTLE)
  async groups(@Param('org', ParseUUIDPipe) org: string, @Param('source', ParseUUIDPipe) source: string, @Headers('authorization') auth?: string, @Query('filter') filter?: string) {
    return this.directory.scimGroups(org, await this.src(org, source, auth), this.base(org, source), filter);
  }

  @Post('Groups')
  @Throttle(PUBLIC_API_THROTTLE)
  async addGroup(@Param('org', ParseUUIDPipe) org: string, @Param('source', ParseUUIDPipe) source: string, @Body() body: Record<string, unknown>, @Headers('authorization') auth?: string) {
    return this.directory.scimGroupWrite(org, await this.src(org, source, auth), this.base(org, source), null, body, 'post');
  }

  @Put('Groups/:id')
  @Throttle(PUBLIC_API_THROTTLE)
  async putGroup(@Param('org', ParseUUIDPipe) org: string, @Param('source', ParseUUIDPipe) source: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>, @Headers('authorization') auth?: string) {
    return this.directory.scimGroupWrite(org, await this.src(org, source, auth), this.base(org, source), id, body, 'put');
  }

  @Patch('Groups/:id')
  @Throttle(PUBLIC_API_THROTTLE)
  async patchGroup(@Param('org', ParseUUIDPipe) org: string, @Param('source', ParseUUIDPipe) source: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>, @Headers('authorization') auth?: string) {
    return this.directory.scimGroupWrite(org, await this.src(org, source, auth), this.base(org, source), id, body, 'patch');
  }

  @Delete('Groups/:id')
  @HttpCode(204)
  @Throttle(PUBLIC_API_THROTTLE)
  async deleteGroup(@Param('org', ParseUUIDPipe) org: string, @Param('source', ParseUUIDPipe) source: string, @Param('id', ParseUUIDPipe) id: string, @Headers('authorization') auth?: string) {
    await this.directory.scimGroupDelete(org, await this.src(org, source, auth), id);
  }
}

/** SD-1.31, the customer company's side: "Contact YukthiX" for the System Admin. Only the two bridge functions. */
@Controller('desk/support/yukthix')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class YukthixSupportController {
  constructor(private readonly bridge: SupportBridgeService) {}

  private ctx(req: Request, t: TenantContext): TenantContext {
    assertOwnSession(req);
    return companyOf(t);
  }

  @Get('tickets')
  @RequirePermissions('org.yukthix_support.raise')
  list(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.bridge.list(this.ctx(req, t));
  }

  @Post('tickets')
  @Throttle(STRICT_AUTH_THROTTLE)
  @RequirePermissions('org.yukthix_support.raise')
  raise(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: SupportRaiseDto) {
    return this.bridge.raise(this.ctx(req, t), dto);
  }

  @Get('tickets/:id')
  @RequirePermissions('org.yukthix_support.raise')
  get(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.bridge.get(this.ctx(req, t), id);
  }

  @Post('tickets/:id/messages')
  @Throttle(PUBLIC_API_THROTTLE)
  @RequirePermissions('org.yukthix_support.raise')
  reply(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SupportReplyDto) {
    return this.bridge.reply(this.ctx(req, t), id, dto);
  }
}

/** SD-1.31, YukthiX staff: the YukthiX Support desk in the console (security key session, staff key). */
@Controller('platform/support-desk')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class ConsoleDeskController {
  constructor(private readonly bridge: SupportBridgeService) {}

  @Get('tickets')
  @RequirePermissions('platform.support_desk.work')
  queue(@CurrentUserId() staff: string, @Query() q: ConsoleQueueDto) {
    return this.bridge.queue(staff, q.state ?? 'open');
  }

  @Get('tickets/:id')
  @RequirePermissions('platform.support_desk.work')
  ticket(@CurrentUserId() staff: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.bridge.ticket(staff, id);
  }

  @Post('tickets/:id/messages')
  @RequirePermissions('platform.support_desk.work')
  post(@CurrentUserId() staff: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConsoleMessageDto) {
    return this.bridge.post(staff, id, dto);
  }

  @Post('tickets/:id/assign-me')
  @HttpCode(200)
  @RequirePermissions('platform.support_desk.work')
  assign(@CurrentUserId() staff: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.bridge.assignToMe(staff, id);
  }

  @Post('tickets/:id/resolve')
  @HttpCode(200)
  @RequirePermissions('platform.support_desk.work')
  resolve(@CurrentUserId() staff: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConsoleResolveDto) {
    return this.bridge.resolve(staff, id, dto.version, dto.note);
  }

  @Post('tickets/:id/link')
  @HttpCode(200)
  @RequirePermissions('platform.support_desk.work')
  link(@CurrentUserId() staff: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConsoleLinkDto) {
    return this.bridge.link(staff, id, dto);
  }

  /** US-B-119: asks the company for a P02 support session with the ticket as the reason (the company approves). */
  @Post('tickets/:id/request-access')
  @RequirePermissions('platform.support_desk.work', 'platform.support.request')
  requestAccess(@CurrentUserId() staff: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SupportAccessDto) {
    return this.bridge.requestAccess(staff, id, dto);
  }
}

