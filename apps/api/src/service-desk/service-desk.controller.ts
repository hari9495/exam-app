import { Body, Controller, Delete, Get, Header, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE, PUBLIC_API_THROTTLE } from '../rate-limit-tiers';
import { RequireStepUp } from '../auth/step-up.decorator';
import { AttachmentsService } from './attachments.service';
import { DeskAccessService, assertOwnSession, visibleTickets } from './desk-access';
import { DesksService } from './desks.service';
import {
  AddMemberDto,
  AgentCreateTicketDto,
  AgentStatusDto,
  AssignDto,
  BulkDto,
  CalendarDto,
  CalendarHoursDto,
  CannedResponseDto,
  CategoryDto,
  CollaboratorDto,
  ConvertDto,
  CreateDeskDto,
  EditNoteDto,
  GroupDto,
  HolidayDto,
  MatrixDto,
  MessageDto,
  PresenceDto,
  RaiseTicketDto,
  RequesterReplyDto,
  ScenarioDto,
  SearchQueryDto,
  StatusDto,
  TicketListQueryDto,
  TicketTypeDto,
  TimeEntryDto,
  UpdateCalendarDto,
  UpdateDeskDto,
  UpdateStatusDto,
  UpdateTicketDto,
  UpdateTicketTypeDto,
  VersionDto,
  VipDto,
  ViewDto,
  WatcherDto,
  ComplianceTargetsDto,
  EscalateDto,
  LinkDto,
  LinkPersonDto,
  MergeDto,
  MonthQueryDto,
  ParentDto,
  RangeQueryDto,
  ReadsQueryDto,
  ReasonDto,
  ReminderDto,
  ResolutionCodeDto,
  ResolveDto,
  SideConversationDto,
  SideMessageDto,
  SlaPolicyDto,
  SlaVersionDto,
  SnoozeDto,
  SplitDto,
  StandaloneTaskDto,
  TaskDto,
  TemplateDto,
  TrackerDto,
  UpdateSlaPolicyDto,
  UpdateTaskDto,
} from './dto';
import { MeService } from './me.service';
import { SlaService } from './sla.service';
import { WorkService } from './work.service';
import { PresenceService } from './presence.service';
import { RequesterService } from './requester.service';
import { TicketListsService } from './ticket-lists.service';
import { TicketsService } from './tickets.service';
import { PortalService } from './portal.service';

// M14 §12.1, /api/v1/desk. Every staff route declares its permission key (YX-SEC-01) and the service also checks the
// person's seat on the desk (§6). Writes are made by the signed-in person themselves (assertOwnSession). The requester
// routes (/desk/my) have no key: they reach only the person's own records (YX-SD-16). Files are served only through
// a signed short-lived link (/desk/files/:token).

const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
const VIEW = 'desk.ticket.view';
const SETUP_READ = ['desk.ticket.view', 'desk.settings.manage', 'desk.member.manage', 'desk.desk.create'] as const;
// Batch 4: report and survey pages pick a desk from the same list (the service shows only the person's own desks).
const DESK_LIST = [...SETUP_READ, 'desk.report.view', 'desk.survey.manage'] as const;

@Controller('desk')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeskSetupController {
  constructor(
    private readonly access: DeskAccessService,
    private readonly desks: DesksService,
  ) {}

  @Get('desks')
  @RequireAnyPermission(...DESK_LIST)
  async list(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.desks.list(await this.access.actor(req, t));
  }

  @Post('desks')
  @RequirePermissions('desk.desk.create')
  async create(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: CreateDeskDto) {
    assertOwnSession(req);
    return this.desks.create(await this.access.actor(req, t), dto);
  }

  @Get('desks/:id')
  @RequireAnyPermission(...SETUP_READ)
  async get(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.desks.get(await this.access.actor(req, t), id);
  }

  @Patch('desks/:id')
  @RequirePermissions('desk.settings.manage')
  async update(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDeskDto) {
    assertOwnSession(req);
    return this.desks.update(await this.access.actor(req, t), id, dto);
  }

  @Get('users')
  @RequireAnyPermission('desk.member.manage', 'desk.report.manage', 'desk.kb.publish')
  async users(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: SearchQueryDto) {
    return this.desks.users(await this.access.actor(req, t), q.search);
  }

  /** §6.3: the cost of a seat, shown before it is given. */
  @Get('desks/:id/members/cost')
  @RequirePermissions('desk.member.manage')
  async cost(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query('userId', ParseUUIDPipe) userId: string, @Query('role') role: string) {
    return this.desks.previewSeat(await this.access.actor(req, t), id, userId, String(role ?? ''));
  }

  @Post('desks/:id/members')
  @RequirePermissions('desk.member.manage')
  async addMember(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMemberDto) {
    assertOwnSession(req);
    return this.desks.addMember(await this.access.actor(req, t), id, dto);
  }

  @Delete('desks/:id/members/:memberId')
  @RequirePermissions('desk.member.manage')
  async endMember(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('memberId', ParseUUIDPipe) memberId: string) {
    assertOwnSession(req);
    return this.desks.endMember(await this.access.actor(req, t), id, memberId);
  }

  @Post('desks/:id/groups')
  @RequirePermissions('desk.settings.manage')
  async addGroup(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GroupDto) {
    assertOwnSession(req);
    return this.desks.saveGroup(await this.access.actor(req, t), id, null, dto);
  }

  @Patch('desks/:id/groups/:groupId')
  @RequirePermissions('desk.settings.manage')
  async editGroup(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('groupId', ParseUUIDPipe) groupId: string, @Body() dto: GroupDto) {
    assertOwnSession(req);
    return this.desks.saveGroup(await this.access.actor(req, t), id, groupId, dto);
  }

  @Post('desks/:id/categories')
  @RequirePermissions('desk.settings.manage')
  async addCategory(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CategoryDto) {
    assertOwnSession(req);
    return this.desks.saveCategory(await this.access.actor(req, t), id, null, dto);
  }

  @Patch('desks/:id/categories/:categoryId')
  @RequirePermissions('desk.settings.manage')
  async editCategory(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('categoryId', ParseUUIDPipe) categoryId: string, @Body() dto: CategoryDto) {
    assertOwnSession(req);
    return this.desks.saveCategory(await this.access.actor(req, t), id, categoryId, dto);
  }

  @Post('desks/:id/ticket-types')
  @RequirePermissions('desk.settings.manage')
  async addType(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TicketTypeDto) {
    assertOwnSession(req);
    return this.desks.saveType(await this.access.actor(req, t), id, null, dto);
  }

  @Patch('desks/:id/ticket-types/:typeId')
  @RequirePermissions('desk.settings.manage')
  async editType(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('typeId', ParseUUIDPipe) typeId: string, @Body() dto: UpdateTicketTypeDto) {
    assertOwnSession(req);
    return this.desks.saveType(await this.access.actor(req, t), id, typeId, dto);
  }

  @Post('desks/:id/statuses')
  @RequirePermissions('desk.settings.manage')
  async addStatus(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto) {
    assertOwnSession(req);
    return this.desks.saveStatus(await this.access.actor(req, t), id, null, dto);
  }

  @Patch('desks/:id/statuses/:statusId')
  @RequirePermissions('desk.settings.manage')
  async editStatus(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('statusId', ParseUUIDPipe) statusId: string, @Body() dto: UpdateStatusDto) {
    assertOwnSession(req);
    return this.desks.saveStatus(await this.access.actor(req, t), id, statusId, dto);
  }

  @Put('desks/:id/priority-matrix')
  @RequirePermissions('desk.settings.manage')
  async matrix(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MatrixDto) {
    assertOwnSession(req);
    return this.desks.saveMatrix(await this.access.actor(req, t), id, dto);
  }

  @Get('desks/:id/canned-responses')
  @RequirePermissions(VIEW)
  async canned(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.desks.cannedList(await this.access.actor(req, t), id);
  }

  @Post('desks/:id/canned-responses')
  @RequirePermissions('desk.settings.manage')
  async addCanned(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CannedResponseDto) {
    assertOwnSession(req);
    return this.desks.saveCanned(await this.access.actor(req, t), id, null, dto, false);
  }

  @Patch('desks/:id/canned-responses/:cannedId')
  @RequirePermissions('desk.settings.manage')
  async editCanned(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('cannedId', ParseUUIDPipe) cannedId: string, @Body() dto: CannedResponseDto) {
    assertOwnSession(req);
    return this.desks.saveCanned(await this.access.actor(req, t), id, cannedId, dto, false);
  }

  /** An agent's own saved replies. */
  @Post('desks/:id/my-canned-responses')
  @RequirePermissions('desk.ticket.work')
  async addMyCanned(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CannedResponseDto) {
    assertOwnSession(req);
    return this.desks.saveCanned(await this.access.actor(req, t), id, null, dto, true);
  }

  @Patch('desks/:id/my-canned-responses/:cannedId')
  @RequirePermissions('desk.ticket.work')
  async editMyCanned(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('cannedId', ParseUUIDPipe) cannedId: string, @Body() dto: CannedResponseDto) {
    assertOwnSession(req);
    return this.desks.saveCanned(await this.access.actor(req, t), id, cannedId, dto, true);
  }

  @Post('desks/:id/scenarios')
  @RequirePermissions('desk.settings.manage')
  async addScenario(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ScenarioDto) {
    assertOwnSession(req);
    return this.desks.saveScenario(await this.access.actor(req, t), id, null, dto);
  }

  @Patch('desks/:id/scenarios/:scenarioId')
  @RequirePermissions('desk.settings.manage')
  async editScenario(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('scenarioId', ParseUUIDPipe) scenarioId: string, @Body() dto: ScenarioDto) {
    assertOwnSession(req);
    return this.desks.saveScenario(await this.access.actor(req, t), id, scenarioId, dto);
  }

  // ---- calendars (SD-1.02) ----

  @Get('calendars')
  @RequireAnyPermission('desk.sla.manage', VIEW)
  async calendars(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.desks.calendars(await this.access.actor(req, t));
  }

  @Post('calendars')
  @RequirePermissions('desk.sla.manage')
  async createCalendar(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: CalendarDto) {
    assertOwnSession(req);
    return this.desks.createCalendar(await this.access.actor(req, t), dto);
  }

  @Patch('calendars/:id')
  @RequirePermissions('desk.sla.manage')
  async updateCalendar(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCalendarDto) {
    assertOwnSession(req);
    return this.desks.updateCalendar(await this.access.actor(req, t), id, dto);
  }

  @Put('calendars/:id/hours')
  @RequirePermissions('desk.sla.manage')
  async hours(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CalendarHoursDto) {
    assertOwnSession(req);
    return this.desks.setHours(await this.access.actor(req, t), id, dto);
  }

  @Post('calendars/:id/holidays')
  @RequirePermissions('desk.sla.manage')
  async addHoliday(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HolidayDto) {
    assertOwnSession(req);
    return this.desks.addHoliday(await this.access.actor(req, t), id, dto);
  }

  @Delete('calendars/:id/holidays/:holidayId')
  @RequirePermissions('desk.sla.manage')
  async removeHoliday(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('holidayId', ParseUUIDPipe) holidayId: string) {
    assertOwnSession(req);
    return this.desks.removeHoliday(await this.access.actor(req, t), id, holidayId);
  }

  // ---- requesters and agents ----

  @Put('requesters/:personId/vip')
  @RequirePermissions('desk.desk.create')
  async vip(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('personId', ParseUUIDPipe) personId: string, @Body() dto: VipDto) {
    assertOwnSession(req);
    return this.desks.setVip(await this.access.actor(req, t), personId, dto);
  }

  @Get('me/status')
  @RequirePermissions('desk.ticket.work')
  async myStatus(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.desks.myStatus(await this.access.actor(req, t));
  }

  @Put('me/status')
  @RequirePermissions('desk.ticket.work')
  async setMyStatus(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: AgentStatusDto) {
    assertOwnSession(req);
    return this.desks.setMyStatus(await this.access.actor(req, t), dto);
  }
}

@Controller('desk')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeskTicketsController {
  constructor(
    private readonly access: DeskAccessService,
    private readonly tickets: TicketsService,
    private readonly lists: TicketListsService,
    private readonly files: AttachmentsService,
    private readonly presence: PresenceService,
  ) {}

  /** Requesters to raise for, and watchers to add: names and emails only (P02 Public). */
  @Get('people')
  @RequirePermissions('desk.ticket.work')
  async people(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: SearchQueryDto) {
    const a = await this.access.actor(req, t);
    if (![...a.roles.values()].some((r) => r === 'agent' || r === 'lead')) return [];
    return this.tickets.searchPeople(a, q.search ?? '');
  }

  @Get('tickets')
  @RequirePermissions(VIEW)
  async list(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: TicketListQueryDto) {
    return this.lists.list(await this.access.actor(req, t), q);
  }

  @Get('tickets/export')
  @RequirePermissions('desk.ticket.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="tickets.csv"')
  @Header('Cache-Control', 'private, no-store')
  async export(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: TicketListQueryDto) {
    return this.lists.exportCsv(await this.access.actor(req, t), q);
  }

  @Post('tickets')
  @RequirePermissions('desk.ticket.work')
  async create(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: AgentCreateTicketDto) {
    assertOwnSession(req);
    return this.tickets.createByAgent(await this.access.actor(req, t), dto);
  }

  @Post('tickets/bulk')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.bulk')
  async bulk(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: BulkDto) {
    assertOwnSession(req);
    return this.tickets.bulk(await this.access.actor(req, t), dto.ticketIds, dto.action);
  }

  @Get('tickets/:id')
  @RequirePermissions(VIEW)
  async get(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tickets.get(await this.access.actor(req, t), id, req.ip);
  }

  @Patch('tickets/:id')
  @RequirePermissions('desk.ticket.work')
  async update(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTicketDto) {
    assertOwnSession(req);
    return this.tickets.update(await this.access.actor(req, t), id, dto);
  }

  @Post('tickets/:id/assign')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async assign(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto) {
    assertOwnSession(req);
    return this.tickets.assign(await this.access.actor(req, t), id, dto);
  }

  @Post('tickets/:id/convert')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async convert(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConvertDto) {
    assertOwnSession(req);
    return this.tickets.convert(await this.access.actor(req, t), id, dto);
  }

  @Post('tickets/:id/scenarios/:scenarioId')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async scenario(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('scenarioId', ParseUUIDPipe) scenarioId: string, @Body() dto: VersionDto) {
    assertOwnSession(req);
    return this.tickets.runScenario(await this.access.actor(req, t), id, scenarioId, dto.version);
  }

  @Post('tickets/:id/messages')
  @RequireAnyPermission('desk.ticket.work', 'desk.ticket.note')
  async post(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MessageDto) {
    assertOwnSession(req);
    return this.tickets.post(await this.access.actor(req, t), id, dto);
  }

  @Patch('tickets/:id/messages/:messageId')
  @RequirePermissions('desk.ticket.note')
  async editNote(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('messageId', ParseUUIDPipe) messageId: string, @Body() dto: EditNoteDto) {
    assertOwnSession(req);
    return this.tickets.editNote(await this.access.actor(req, t), id, messageId, dto);
  }

  @Post('tickets/:id/attachments')
  @RequireAnyPermission('desk.ticket.work', 'desk.ticket.note')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  async upload(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    assertOwnSession(req);
    return this.files.uploadByAgent(await this.access.actor(req, t), id, file);
  }

  @Post('tickets/:id/attachments/:attachmentId/link')
  @HttpCode(200)
  @RequirePermissions(VIEW)
  async link(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('attachmentId', ParseUUIDPipe) attachmentId: string) {
    return this.files.linkForAgent(await this.access.actor(req, t), id, attachmentId);
  }

  @Post('tickets/:id/watchers')
  @RequirePermissions('desk.ticket.work')
  async addWatcher(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WatcherDto) {
    assertOwnSession(req);
    return this.tickets.addWatcher(await this.access.actor(req, t), id, dto);
  }

  @Delete('tickets/:id/watchers/:watcherId')
  @RequirePermissions('desk.ticket.work')
  async removeWatcher(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('watcherId', ParseUUIDPipe) watcherId: string) {
    assertOwnSession(req);
    return this.tickets.removeWatcher(await this.access.actor(req, t), id, watcherId);
  }

  @Post('tickets/:id/collaborators')
  @RequirePermissions('desk.ticket.work')
  async addCollaborator(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CollaboratorDto) {
    assertOwnSession(req);
    return this.tickets.addCollaborator(await this.access.actor(req, t), id, dto);
  }

  @Delete('tickets/:id/collaborators/:userId')
  @RequirePermissions('desk.ticket.work')
  async removeCollaborator(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    assertOwnSession(req);
    return this.tickets.removeCollaborator(await this.access.actor(req, t), id, userId);
  }

  @Post('tickets/:id/time-entries')
  @RequirePermissions('desk.ticket.work')
  async addTime(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TimeEntryDto) {
    assertOwnSession(req);
    return this.tickets.addTime(await this.access.actor(req, t), id, dto);
  }

  @Patch('tickets/:id/time-entries/:entryId')
  @RequirePermissions('desk.ticket.work')
  async editTime(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('entryId', ParseUUIDPipe) entryId: string, @Body() dto: TimeEntryDto) {
    assertOwnSession(req);
    return this.tickets.updateTime(await this.access.actor(req, t), id, entryId, dto);
  }

  @Get('tickets/:id/timeline')
  @RequirePermissions(VIEW)
  async timeline(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tickets.timeline(await this.access.actor(req, t), id);
  }

  @Get('tickets/:id/context')
  @RequirePermissions(VIEW)
  async context(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    const a = await this.access.actor(req, t);
    const visible = await this.tickets.tx(a, (tx) => visibleTickets(tx, a));
    return this.tickets.context(a, id, visible);
  }

  /** YX-SD-07 collision warning: who else has this ticket open, and whether they are typing. */
  @Post('tickets/:id/presence')
  @HttpCode(200)
  @RequirePermissions(VIEW)
  async beat(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PresenceDto) {
    const a = await this.access.actor(req, t);
    const name = await this.tickets.tx(a, async (tx) => {
      await this.tickets.load(tx, a, id);
      return (await this.tickets.userNames(tx, a.ctx.organizationId, [a.userId])).get(a.userId) ?? 'Someone';
    });
    return this.presence.beat(a.ctx.organizationId, id, { id: a.userId, name }, dto.typing);
  }

  // ---- saved views ----

  @Get('views')
  @RequirePermissions(VIEW)
  async views(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.lists.views(await this.access.actor(req, t));
  }

  @Post('views')
  @RequirePermissions(VIEW)
  async addView(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: ViewDto) {
    assertOwnSession(req);
    return this.lists.saveView(await this.access.actor(req, t), null, dto);
  }

  @Patch('views/:id')
  @RequirePermissions(VIEW)
  async editView(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ViewDto) {
    assertOwnSession(req);
    return this.lists.saveView(await this.access.actor(req, t), id, dto);
  }

  @Delete('views/:id')
  @RequirePermissions(VIEW)
  async deleteView(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.lists.deleteView(await this.access.actor(req, t), id);
  }
}

/** The requester's own records (implicit: YX-SD-16). */
@Controller('desk/my')
@UseGuards(JwtAuthGuard)
export class MyTicketsController {
  constructor(
    private readonly requesters: RequesterService,
    private readonly files: AttachmentsService,
    private readonly portals: PortalService,
  ) {}

  /** US-G-020: known-issue banners for employees (their location too). */
  @Get('banners')
  banners(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.portals.myBanners(this.requesters.who(req, t));
  }

  /** "Me too": follow the linked incident instead of raising a new ticket. */
  @Post('banners/:id/me-too')
  @HttpCode(200)
  meToo(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.portals.myMeToo(this.requesters.who(req, t), id);
  }

  @Get('desks')
  desks(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.requesters.desks(this.requesters.who(req, t));
  }

  @Get('tickets')
  list(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.requesters.list(this.requesters.who(req, t));
  }

  @Post('tickets')
  raise(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: RaiseTicketDto) {
    return this.requesters.raise(this.requesters.who(req, t), dto);
  }

  @Get('tickets/:id')
  get(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.requesters.get(this.requesters.who(req, t), id);
  }

  @Post('tickets/:id/messages')
  reply(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RequesterReplyDto) {
    return this.requesters.reply(this.requesters.who(req, t), id, dto);
  }

  @Post('tickets/:id/watchers')
  watch(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WatcherDto) {
    return this.requesters.addWatcher(this.requesters.who(req, t), id, dto);
  }

  @Post('tickets/:id/attachments')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  upload(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    return this.files.uploadByRequester(this.requesters.who(req, t), id, file);
  }

  @Post('tickets/:id/attachments/:attachmentId/link')
  @HttpCode(200)
  link(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('attachmentId', ParseUUIDPipe) attachmentId: string) {
    return this.files.linkForRequester(this.requesters.who(req, t), id, attachmentId);
  }
}

/** §14.2 serve: clean files only, through a signed 60-second link; always as a download except safe images. */
@Controller('desk/files')
export class DeskFilesController {
  constructor(private readonly files: AttachmentsService) {}

  @Get(':token')
  async download(@Param('token') token: string, @Res() res: Response) {
    const f = await this.files.download(String(token).slice(0, 2000));
    res.setHeader('Content-Type', f.contentType);
    res.setHeader('Content-Length', String(f.data.length));
    res.setHeader('Content-Disposition', `${f.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.fileName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(f.data);
  }
}

/**
 * Batch 2 (SD-1.09 … SD-1.17): merge, links, family, split, side threads, tasks, templates, resolve, escalate, PII,
 * read log, reminders and calendar, SLA set-up and timelines, the agent bill and HR's possible-duplicate list.
 */
@Controller('desk')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeskWorkController {
  constructor(
    private readonly access: DeskAccessService,
    private readonly tickets: TicketsService,
    private readonly work: WorkService,
    private readonly sla: SlaService,
    private readonly me: MeService,
  ) {}

  private actor(req: Request, t: TenantContext) {
    return this.access.actor(req, t);
  }

  @Get('tickets/:id/work')
  @RequirePermissions(VIEW)
  async overview(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.work.overview(await this.actor(req, t), id);
  }

  @Get('tickets/:id/sla')
  @RequirePermissions(VIEW)
  async slaTimeline(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    const a = await this.actor(req, t);
    return this.tickets.tx(a, async (tx) => this.sla.ticketView(tx, a, (await this.tickets.load(tx, a, id)).t));
  }

  @Post('tickets/:id/links')
  @RequirePermissions('desk.ticket.work')
  async link(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkDto) {
    assertOwnSession(req);
    return this.work.link(await this.actor(req, t), id, dto);
  }

  @Delete('tickets/:id/links/:linkId')
  @RequirePermissions('desk.ticket.work')
  async unlink(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('linkId', ParseUUIDPipe) linkId: string) {
    assertOwnSession(req);
    return this.work.unlink(await this.actor(req, t), id, linkId);
  }

  @Put('tickets/:id/parent')
  @RequirePermissions('desk.ticket.work')
  async parent(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ParentDto) {
    assertOwnSession(req);
    return this.work.setParent(await this.actor(req, t), id, dto.parentId);
  }

  @Put('tickets/:id/tracker')
  @RequirePermissions('desk.ticket.work')
  async tracker(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TrackerDto) {
    assertOwnSession(req);
    return this.work.setTracker(await this.actor(req, t), id, dto.tracker);
  }

  @Post('tickets/:id/merge')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.merge')
  async merge(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MergeDto) {
    assertOwnSession(req);
    return this.work.merge(await this.actor(req, t), id, dto);
  }

  @Post('tickets/:id/split')
  @RequirePermissions('desk.ticket.work')
  async split(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SplitDto) {
    assertOwnSession(req);
    return this.work.split(await this.actor(req, t), id, dto);
  }

  @Post('tickets/:id/side-conversations')
  @RequirePermissions('desk.ticket.work')
  async side(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SideConversationDto) {
    assertOwnSession(req);
    return this.work.startSide(await this.actor(req, t), id, dto);
  }

  @Post('tickets/:id/side-conversations/:sideId/messages')
  @RequireAnyPermission('desk.ticket.work', 'desk.ticket.note')
  async sideMessage(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('sideId', ParseUUIDPipe) sideId: string, @Body() dto: SideMessageDto) {
    assertOwnSession(req);
    return this.work.sideMessage(await this.actor(req, t), id, sideId, dto.bodyHtml);
  }

  @Post('tickets/:id/side-conversations/:sideId/close')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async closeSide(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('sideId', ParseUUIDPipe) sideId: string) {
    assertOwnSession(req);
    return this.work.closeSide(await this.actor(req, t), id, sideId);
  }

  @Post('tickets/:id/tasks')
  @RequirePermissions('desk.task.work')
  async addTask(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TaskDto) {
    assertOwnSession(req);
    return this.work.addTask(await this.actor(req, t), id, dto);
  }

  @Get('tasks')
  @RequirePermissions('desk.task.work')
  async tasks(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.work.taskList(await this.actor(req, t));
  }

  @Post('tasks')
  @RequirePermissions('desk.task.work')
  async addStandalone(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: StandaloneTaskDto) {
    assertOwnSession(req);
    return this.work.addStandalone(await this.actor(req, t), dto);
  }

  @Patch('tasks/:taskId')
  @RequirePermissions('desk.task.work')
  async updateTask(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('taskId', ParseUUIDPipe) taskId: string, @Body() dto: UpdateTaskDto) {
    assertOwnSession(req);
    return this.work.updateTask(await this.actor(req, t), taskId, dto);
  }

  @Get('desks/:id/templates')
  @RequireAnyPermission(...SETUP_READ)
  async templates(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.work.templates(await this.actor(req, t), id);
  }

  @Post('desks/:id/templates')
  @RequirePermissions('desk.settings.manage')
  async addTemplate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TemplateDto) {
    assertOwnSession(req);
    return this.work.saveTemplate(await this.actor(req, t), id, null, dto);
  }

  @Patch('desks/:id/templates/:templateId')
  @RequirePermissions('desk.settings.manage')
  async editTemplate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('templateId', ParseUUIDPipe) templateId: string, @Body() dto: TemplateDto) {
    assertOwnSession(req);
    return this.work.saveTemplate(await this.actor(req, t), id, templateId, dto);
  }

  @Post('desks/:id/resolution-codes')
  @RequirePermissions('desk.settings.manage')
  async addCode(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolutionCodeDto) {
    assertOwnSession(req);
    return this.work.saveResolutionCode(await this.actor(req, t), id, null, dto);
  }

  @Patch('desks/:id/resolution-codes/:codeId')
  @RequirePermissions('desk.settings.manage')
  async editCode(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('codeId', ParseUUIDPipe) codeId: string, @Body() dto: ResolutionCodeDto) {
    assertOwnSession(req);
    return this.work.saveResolutionCode(await this.actor(req, t), id, codeId, dto);
  }

  @Post('tickets/:id/templates/:templateId')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async applyTemplate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('templateId', ParseUUIDPipe) templateId: string, @Body() dto: VersionDto) {
    assertOwnSession(req);
    return this.work.applyTemplate(await this.actor(req, t), id, templateId, dto.version);
  }

  @Post('tickets/:id/resolve')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async resolve(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveDto) {
    assertOwnSession(req);
    return this.work.resolve(await this.actor(req, t), id, dto);
  }

  @Post('tickets/:id/escalate')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async escalate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EscalateDto) {
    assertOwnSession(req);
    return this.work.escalate(await this.actor(req, t), id, dto);
  }

  /** YX-SD-15: step-up (AAL2 in the last minutes) plus desk.pii.unmask; every view audited. */
  @Post('tickets/:id/unmask/:valueId')
  @HttpCode(200)
  @RequirePermissions('desk.pii.unmask')
  @RequireStepUp()
  async unmask(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('valueId', ParseUUIDPipe) valueId: string) {
    assertOwnSession(req);
    return this.work.unmask(await this.actor(req, t), id, valueId);
  }

  @Get('audit/reads')
  @RequirePermissions('desk.audit.view')
  async reads(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: ReadsQueryDto) {
    return this.work.reads(await this.actor(req, t), q.ticketId);
  }

  @Post('tickets/:id/sla/:timerId/breach-reason')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async breachReason(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('timerId', ParseUUIDPipe) timerId: string, @Body() dto: ReasonDto) {
    assertOwnSession(req);
    const a = await this.actor(req, t);
    return this.tickets.tx(a, async (tx) => {
      const { t: ticket, access } = await this.tickets.load(tx, a, id);
      if (access !== 'agent') throw new NotFoundException('No such ticket.');
      return this.sla.breachReason(tx, a, ticket, timerId, dto.reason);
    });
  }

  @Post('tickets/:id/sla/:timerId/exclusion')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async exclusion(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('timerId', ParseUUIDPipe) timerId: string, @Body() dto: ReasonDto) {
    assertOwnSession(req);
    const a = await this.actor(req, t);
    return this.tickets.tx(a, async (tx) => {
      const { t: ticket, access } = await this.tickets.load(tx, a, id);
      if (access !== 'agent') throw new NotFoundException('No such ticket.');
      return this.sla.exclude(tx, a, ticket, timerId, dto.reason);
    });
  }

  // ---- SLA set-up (SD-1.14, SD-1.16) ----

  @Get('desks/:id/sla-policies')
  @RequirePermissions('desk.sla.manage')
  async policies(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.sla.policies(await this.actor(req, t), id);
  }

  @Post('desks/:id/sla-policies')
  @RequirePermissions('desk.sla.manage')
  async addPolicy(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SlaPolicyDto) {
    assertOwnSession(req);
    return this.sla.createPolicy(await this.actor(req, t), id, dto);
  }

  @Post('sla-policies/:id/versions')
  @RequirePermissions('desk.sla.manage')
  async addVersion(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SlaVersionDto) {
    assertOwnSession(req);
    return this.sla.addVersion(await this.actor(req, t), id, dto);
  }

  @Patch('sla-policies/:id')
  @RequirePermissions('desk.sla.manage')
  async editPolicy(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSlaPolicyDto) {
    assertOwnSession(req);
    return this.sla.updatePolicy(await this.actor(req, t), id, dto);
  }

  @Put('desks/:id/sla-targets')
  @RequirePermissions('desk.sla.manage')
  async targets(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ComplianceTargetsDto) {
    assertOwnSession(req);
    return this.sla.setComplianceTargets(await this.actor(req, t), id, dto);
  }

  @Get('desks/:id/sla-compliance')
  @RequireAnyPermission('desk.report.view', 'desk.sla.manage')
  async compliance(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: MonthQueryDto) {
    return this.sla.compliance(await this.actor(req, t), id, q.month);
  }

  // ---- reminders, snooze, calendar (SD-1.11) ----

  @Get('me/reminders')
  @RequirePermissions(VIEW)
  async reminders(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.me.reminders(await this.actor(req, t));
  }

  @Post('me/reminders')
  @RequirePermissions(VIEW)
  async addReminder(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: ReminderDto) {
    assertOwnSession(req);
    return this.me.addReminder(await this.actor(req, t), dto);
  }

  @Post('me/reminders/:id/done')
  @HttpCode(200)
  @RequirePermissions(VIEW)
  async doneReminder(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.me.doneReminder(await this.actor(req, t), id);
  }

  @Post('tickets/:id/snooze')
  @HttpCode(200)
  @RequirePermissions(VIEW)
  async snooze(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SnoozeDto) {
    assertOwnSession(req);
    return this.me.snooze(await this.actor(req, t), id, dto.until);
  }

  @Delete('tickets/:id/snooze')
  @RequirePermissions(VIEW)
  async unsnooze(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.me.unsnooze(await this.actor(req, t), id);
  }

  @Get('me/calendar')
  @RequirePermissions(VIEW)
  async calendar(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: RangeQueryDto) {
    return this.me.calendar(await this.actor(req, t), q.from, q.to);
  }

  /** A new secret iCal link; the old one stops working. */
  @Post('me/calendar-feed')
  @RequirePermissions(VIEW)
  async newFeed(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    assertOwnSession(req);
    return this.me.newFeed(await this.actor(req, t));
  }

  @Delete('me/calendar-feed')
  @RequirePermissions(VIEW)
  async revokeFeed(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    assertOwnSession(req);
    return this.me.revokeFeed(await this.actor(req, t));
  }

  // ---- the agent bill (SD-1.13) and HR's possible duplicates (founder decision 8 Oct 2026) ----

  @Get('billing/agents')
  @RequirePermissions('desk.desk.create')
  async billing(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: MonthQueryDto) {
    return this.me.billingAgents(await this.actor(req, t), q.month);
  }

  @Get('people/possible-duplicates')
  @RequirePermissions('employee.change.manage')
  async duplicates(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.me.duplicates(await this.actor(req, t));
  }

  @Post('people/possible-duplicates/:personId/link')
  @HttpCode(200)
  @RequirePermissions('employee.change.manage')
  async linkDuplicate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('personId', ParseUUIDPipe) personId: string, @Body() dto: LinkPersonDto) {
    assertOwnSession(req);
    return this.me.linkDuplicate(await this.actor(req, t), personId, dto.intoPersonId);
  }
}

/** The personal iCal feed (US-G-009): no session (calendar apps cannot sign in); the secret in the link is the key. */
@Controller('desk/calendar-feed')
export class CalendarFeedController {
  constructor(private readonly me: MeService) {}

  @Get(':org/:user/:file')
  @Throttle(PUBLIC_API_THROTTLE)
  async feed(@Param('org', ParseUUIDPipe) org: string, @Param('user', ParseUUIDPipe) user: string, @Param('file') file: string, @Res() res: Response) {
    const token = String(file).replace(/\.ics$/, '');
    const body = await this.me.feed(org, user, token);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.end(body);
  }
}
