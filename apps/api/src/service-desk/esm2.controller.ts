import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { memoryStorage } from 'multer';
import { TenantContext, TenantPrismaService, clientIpOf } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE, PUBLIC_API_THROTTLE } from '../rate-limit-tiers';
import { ChatService } from './chat.service';
import { DeskAccessService, RequestUser, assertOwnSession, requireSetUp } from './desk-access';
import { DeskOrgService } from './desk-org.service';
import { installPack } from './desks.service';
import { DocumentsService } from './documents.service';
import {
  BranchDto,
  ChatQueueDto,
  CloneDeskDto,
  DeskIdQueryDto,
  DocTemplateDto,
  EndChatDto,
  ForwardToDto,
  InteractionDto,
  JourneyDto,
  LifecycleDto,
  MakeDocumentDto,
  MoveTicketDto,
  PromoteDto,
  PromptQueryDto,
  RateChatDto,
  RecurringDto,
  SequenceDto,
  ShareTicketDto,
  SignDocumentDto,
  StartChatDto,
  StartJourneyDto,
  StartSequenceDto,
  TransferChatDto,
  UpdateBranchDto,
  UpdateChatQueueDto,
  UpdateDocTemplateDto,
  UpdateInteractionDto,
  UpdateJourneyDto,
  UpdateLifecycleDto,
  UpdateRecurringDto,
  UpdateSequenceDto,
  VersionDto,
} from './dto-esm2';
import { JourneysService } from './journeys.service';
import { LifecyclesService } from './lifecycles.service';
import { RecurringService } from './recurring.service';
import { RequesterService } from './requester.service';

// M14 §12.2 phase 3b-2, batch 2. Staff routes declare their key (YX-SEC-01); the services also check the seat or the
// desk admin role on that desk. The requester routes (/desk/my/…) have no key and reach only the person's own chats and
// documents. Writes are made by the person themselves, never while acting for someone else.

const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

@Controller('desk')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeskOrgController {
  constructor(
    private readonly access: DeskAccessService,
    private readonly org: DeskOrgService,
    private readonly lifecycles: LifecyclesService,
    private readonly documents: DocumentsService,
    private readonly journeys: JourneysService,
    private readonly recurring: RecurringService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  // ---- SD-2.10 HR summary, move, share, forwarding, clone, branches; SD-2.09 starter pack

  @Get('tickets/:id/hr-summary')
  @RequirePermissions('desk.hr_summary.view')
  async hrSummary(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.org.hrSummary(await this.access.actor(req, t), id);
  }

  @Post('tickets/:id/move')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.move')
  async move(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveTicketDto) {
    assertOwnSession(req);
    return this.org.move(await this.access.actor(req, t), id, dto);
  }

  @Get('tickets/:id/shares')
  @RequirePermissions('desk.ticket.view')
  async shares(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.org.shares(await this.access.actor(req, t), id);
  }

  @Post('tickets/:id/share')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.move')
  async share(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ShareTicketDto) {
    assertOwnSession(req);
    return this.org.share(await this.access.actor(req, t), id, dto);
  }

  @Delete('tickets/:id/share/:deskId')
  @RequirePermissions('desk.ticket.move')
  async unshare(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('deskId', ParseUUIDPipe) deskId: string) {
    assertOwnSession(req);
    return this.org.unshare(await this.access.actor(req, t), id, deskId);
  }

  @Put('desks/:id/forward-to')
  @RequirePermissions('desk.settings.manage')
  async forwardTo(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ForwardToDto) {
    assertOwnSession(req);
    return this.org.setForwardTo(await this.access.actor(req, t), id, dto.deskIds);
  }

  @Post('desks/:id/clone')
  @RequirePermissions('desk.desk.create')
  async clone(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CloneDeskDto) {
    assertOwnSession(req);
    return this.org.clone(await this.access.actor(req, t), id, dto);
  }

  @Post('desks/:id/starter-pack')
  @HttpCode(200)
  @RequirePermissions('desk.catalog.manage')
  async starterPack(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    const a = await this.access.actor(req, t);
    requireSetUp(a, id, 'desk.catalog.manage');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const desk = await tx.sdDesk.findFirstOrThrow({ where: { organizationId: a.ctx.organizationId, id } });
      return (await installPack(tx, a, desk)) ?? { items: 0, sla: false };
    });
  }

  @Get('desks/:id/branches')
  @RequirePermissions('desk.ticket.view')
  async branches(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.org.branches(await this.access.actor(req, t), id);
  }

  @Post('desks/:id/branches')
  @RequirePermissions('desk.settings.manage')
  async addBranch(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BranchDto) {
    assertOwnSession(req);
    return this.org.addBranch(await this.access.actor(req, t), id, dto);
  }

  @Patch('branches/:id')
  @RequirePermissions('desk.settings.manage')
  async updateBranch(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBranchDto) {
    assertOwnSession(req);
    return this.org.updateBranch(await this.access.actor(req, t), id, dto);
  }

  // ---- SD-2.11 lifecycles

  @Get('lifecycles')
  @RequirePermissions('desk.lifecycle.manage')
  async lifecycleList(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: DeskIdQueryDto) {
    return this.lifecycles.list(await this.access.actor(req, t), q.deskId);
  }

  @Post('lifecycles')
  @RequirePermissions('desk.lifecycle.manage')
  async lifecycleCreate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: LifecycleDto) {
    assertOwnSession(req);
    return this.lifecycles.create(await this.access.actor(req, t), dto);
  }

  @Patch('lifecycles/:id')
  @RequirePermissions('desk.lifecycle.manage')
  async lifecycleSave(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLifecycleDto) {
    assertOwnSession(req);
    return this.lifecycles.update(await this.access.actor(req, t), id, dto);
  }

  @Post('lifecycles/:id/check')
  @HttpCode(200)
  @RequirePermissions('desk.lifecycle.manage')
  async lifecycleCheck(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.lifecycles.check(await this.access.actor(req, t), id);
  }

  @Post('lifecycles/:id/publish')
  @HttpCode(200)
  @RequirePermissions('desk.lifecycle.manage')
  async lifecyclePublish(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    assertOwnSession(req);
    return this.lifecycles.publish(await this.access.actor(req, t), id, dto.version);
  }

  @Post('lifecycles/:id/retire')
  @HttpCode(200)
  @RequirePermissions('desk.lifecycle.manage')
  async lifecycleRetire(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    assertOwnSession(req);
    return this.lifecycles.retire(await this.access.actor(req, t), id, dto.version);
  }

  // ---- SD-2.07 documents

  @Get('doc-templates')
  @RequirePermissions('desk.catalog.manage')
  async docTemplates(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: DeskIdQueryDto) {
    return this.documents.templates(await this.access.actor(req, t), q.deskId);
  }

  @Post('doc-templates')
  @RequirePermissions('desk.catalog.manage')
  async addDocTemplate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: DocTemplateDto) {
    assertOwnSession(req);
    return this.documents.saveTemplate(await this.access.actor(req, t), null, dto);
  }

  @Patch('doc-templates/:id')
  @RequirePermissions('desk.catalog.manage')
  async saveDocTemplate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDocTemplateDto) {
    assertOwnSession(req);
    return this.documents.saveTemplate(await this.access.actor(req, t), id, dto);
  }

  @Get('tickets/:id/documents')
  @RequirePermissions('desk.ticket.view')
  async documentList(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.list(await this.access.actor(req, t), id);
  }

  @Post('tickets/:id/documents')
  @RequirePermissions('desk.ticket.work')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  async makeDocument(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MakeDocumentDto) {
    assertOwnSession(req);
    return this.documents.make(await this.access.actor(req, t), id, dto);
  }

  @Post('tickets/:id/documents/:docId/withdraw')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async withdrawDocument(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string) {
    assertOwnSession(req);
    return this.documents.withdraw(await this.access.actor(req, t), id, docId);
  }

  // ---- SD-2.08 journeys

  @Get('journeys')
  @RequirePermissions('desk.catalog.manage')
  async journeyList(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.journeys.list(await this.access.actor(req, t));
  }

  @Post('journeys')
  @RequirePermissions('desk.catalog.manage')
  async journeyCreate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: JourneyDto) {
    assertOwnSession(req);
    return this.journeys.save(await this.access.actor(req, t), null, dto);
  }

  @Patch('journeys/:id')
  @RequirePermissions('desk.catalog.manage')
  async journeySave(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJourneyDto) {
    assertOwnSession(req);
    return this.journeys.save(await this.access.actor(req, t), id, dto);
  }

  /** HR starts a journey for one person (raise-on-behalf over them, P02). */
  @Post('journeys/:id/start')
  @RequirePermissions('request.raise_on_behalf')
  async journeyStart(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StartJourneyDto) {
    assertOwnSession(req);
    return this.journeys.startByHand(await this.access.actor(req, t), id, dto);
  }

  // ---- SD-2.13 recurring records and sequences

  @Get('recurring')
  @RequirePermissions('desk.rule.manage')
  async recurringList(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: DeskIdQueryDto) {
    return this.recurring.list(await this.access.actor(req, t), q.deskId);
  }

  @Post('recurring')
  @RequirePermissions('desk.rule.manage')
  async recurringCreate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: RecurringDto) {
    assertOwnSession(req);
    return this.recurring.create(await this.access.actor(req, t), dto);
  }

  @Patch('recurring/:id')
  @RequirePermissions('desk.rule.manage')
  async recurringUpdate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRecurringDto) {
    assertOwnSession(req);
    return this.recurring.update(await this.access.actor(req, t), id, dto);
  }

  @Get('sequences')
  @RequirePermissions('desk.ticket.view')
  async sequenceList(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: DeskIdQueryDto) {
    return this.recurring.sequences(await this.access.actor(req, t), q.deskId);
  }

  @Post('sequences')
  @RequirePermissions('desk.rule.manage')
  async sequenceCreate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: SequenceDto) {
    assertOwnSession(req);
    return this.recurring.saveSequence(await this.access.actor(req, t), null, dto);
  }

  @Patch('sequences/:id')
  @RequirePermissions('desk.rule.manage')
  async sequenceSave(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSequenceDto) {
    assertOwnSession(req);
    return this.recurring.saveSequence(await this.access.actor(req, t), id, dto);
  }

  @Get('tickets/:id/sequences')
  @RequirePermissions('desk.ticket.view')
  async ticketSequences(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.recurring.runsOn(await this.access.actor(req, t), id);
  }

  @Post('tickets/:id/sequences')
  @RequirePermissions('desk.ticket.work')
  async startSequence(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StartSequenceDto) {
    assertOwnSession(req);
    return this.recurring.startOn(await this.access.actor(req, t), id, dto.sequenceId);
  }

  @Post('tickets/:id/sequences/:runId/stop')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async stopSequence(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('runId', ParseUUIDPipe) runId: string) {
    assertOwnSession(req);
    return this.recurring.stop(await this.access.actor(req, t), id, runId);
  }
}

/** SD-2.17 … SD-2.19 for agents and desk admins: interactions, chat queues and chats. */
@Controller('desk')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeskChatController {
  constructor(
    private readonly access: DeskAccessService,
    private readonly chat: ChatService,
  ) {}

  private async who(req: Request, t: TenantContext) {
    const a = await this.access.actor(req, t);
    return { ctx: a.ctx, userId: a.userId, actor: a };
  }

  @Get('interactions')
  @RequirePermissions('desk.ticket.work')
  async interactions(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: DeskIdQueryDto) {
    return this.chat.interactions(await this.access.actor(req, t), q.deskId);
  }

  @Post('interactions')
  @RequirePermissions('desk.ticket.work')
  async logInteraction(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: InteractionDto) {
    assertOwnSession(req);
    return this.chat.logInteraction(await this.access.actor(req, t), dto);
  }

  @Patch('interactions/:id')
  @RequirePermissions('desk.ticket.work')
  async updateInteraction(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInteractionDto) {
    assertOwnSession(req);
    return this.chat.updateInteraction(await this.access.actor(req, t), id, dto);
  }

  @Post('interactions/:id/promote')
  @RequirePermissions('desk.ticket.work')
  async promote(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PromoteDto) {
    assertOwnSession(req);
    return this.chat.promote(await this.access.actor(req, t), id, dto);
  }

  @Get('chat/queues')
  @RequireAnyPermission('desk.chat.work', 'desk.channel.manage')
  async queues(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: DeskIdQueryDto) {
    return this.chat.queues(await this.access.actor(req, t), q.deskId);
  }

  @Post('chat/queues')
  @RequirePermissions('desk.channel.manage')
  async addQueue(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: ChatQueueDto) {
    assertOwnSession(req);
    return this.chat.saveQueue(await this.access.actor(req, t), null, dto);
  }

  @Patch('chat/queues/:id')
  @RequirePermissions('desk.channel.manage')
  async saveQueue(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChatQueueDto) {
    assertOwnSession(req);
    return this.chat.saveQueue(await this.access.actor(req, t), id, dto);
  }

  @Get('chat/sessions')
  @RequirePermissions('desk.chat.work')
  async sessions(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: DeskIdQueryDto) {
    return this.chat.desk(await this.access.actor(req, t), q.deskId);
  }

  @Get('chat/sessions/:id')
  @RequirePermissions('desk.chat.work')
  async session(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.agentOne(await this.access.actor(req, t), id);
  }

  @Post('chat/sessions/:id/accept')
  @HttpCode(200)
  @RequirePermissions('desk.chat.work')
  async accept(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.chat.accept(await this.access.actor(req, t), id);
  }

  @Post('chat/sessions/:id/transfer')
  @HttpCode(200)
  @RequirePermissions('desk.chat.work')
  async transfer(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferChatDto) {
    assertOwnSession(req);
    return this.chat.transfer(await this.access.actor(req, t), id, dto);
  }

  @Post('chat/sessions/:id/end')
  @HttpCode(200)
  @RequirePermissions('desk.chat.work')
  async end(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EndChatDto) {
    assertOwnSession(req);
    return this.chat.end(await this.access.actor(req, t), id, dto.resolved);
  }

  @Post('chat/sessions/:id/convert')
  @HttpCode(200)
  @RequirePermissions('desk.chat.work')
  async convert(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.chat.convert(await this.access.actor(req, t), id, 'agent', null);
  }

  @Post('chat/sessions/:id/files')
  @RequirePermissions('desk.chat.work')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  async agentFile(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    assertOwnSession(req);
    return this.chat.upload(await this.who(req, t), id, file);
  }

  @Post('chat/sessions/:id/files/:fileId/link')
  @HttpCode(200)
  @RequirePermissions('desk.chat.work')
  async agentFileLink(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string) {
    return this.chat.fileLink(await this.who(req, t), id, fileId);
  }
}

/** The requester's own chats and documents (implicit role, YX-SD-16). */
@Controller('desk/my')
@UseGuards(JwtAuthGuard)
export class MyChatController {
  constructor(
    private readonly requesters: RequesterService,
    private readonly chat: ChatService,
    private readonly documents: DocumentsService,
  ) {}

  private who(req: Request, t: TenantContext) {
    const r = this.requesters.who(req, t);
    return { ctx: r.ctx, userId: r.userId, actor: null };
  }

  @Get('chat/queues')
  queues(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.chat.myQueues(this.requesters.who(req, t));
  }

  @Get('chat/prompt')
  @Throttle(PUBLIC_API_THROTTLE)
  prompt(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: PromptQueryDto) {
    return this.chat.prompt(this.requesters.who(req, t), q.path);
  }

  @Get('chat')
  list(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.chat.mine(this.requesters.who(req, t));
  }

  @Post('chat')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  start(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: StartChatDto) {
    return this.chat.start(this.requesters.who(req, t), dto);
  }

  @Get('chat/:id')
  one(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.myOne(this.requesters.who(req, t), id);
  }

  @Post('chat/:id/end')
  @HttpCode(200)
  end(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.endByRequester(this.requesters.who(req, t), id);
  }

  @Post('chat/:id/rate')
  @HttpCode(200)
  rate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RateChatDto) {
    return this.chat.rate(this.requesters.who(req, t), id, dto);
  }

  @Post('chat/:id/files')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  file(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    return this.chat.upload(this.who(req, t), id, file);
  }

  @Post('chat/:id/files/:fileId/link')
  @HttpCode(200)
  fileLink(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string) {
    return this.chat.fileLink(this.who(req, t), id, fileId);
  }

  @Get('requests/:id/documents')
  myDocuments(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.mine(this.requesters.who(req, t), id);
  }

  /** Sign or decline in the app; the evidence is this request's time, address, device and sign-in strength. */
  @Post('documents/:id/sign')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  sign(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SignDocumentDto) {
    const user = req.user as RequestUser | undefined;
    return this.documents.sign(this.requesters.who(req, t), id, dto, { ip: clientIpOf(req), userAgent: (req.headers['user-agent'] as string | undefined) ?? null, assurance: user?.session?.assuranceLevel ?? null });
  }
}

