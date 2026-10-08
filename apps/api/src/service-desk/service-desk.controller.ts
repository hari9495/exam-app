import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
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
} from './dto';
import { PresenceService } from './presence.service';
import { RequesterService } from './requester.service';
import { TicketListsService } from './ticket-lists.service';
import { TicketsService } from './tickets.service';

// M14 §12.1, /api/v1/desk. Every staff route declares its permission key (YX-SEC-01) and the service also checks the
// person's seat on the desk (§6). Writes are made by the signed-in person themselves (assertOwnSession). The requester
// routes (/desk/my) have no key: they reach only the person's own records (YX-SD-16). Files are served only through
// a signed short-lived link (/desk/files/:token).

const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
const VIEW = 'desk.ticket.view';
const SETUP_READ = ['desk.ticket.view', 'desk.settings.manage', 'desk.member.manage', 'desk.desk.create'] as const;

@Controller('desk')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeskSetupController {
  constructor(
    private readonly access: DeskAccessService,
    private readonly desks: DesksService,
  ) {}

  @Get('desks')
  @RequireAnyPermission(...SETUP_READ)
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
  @RequirePermissions('desk.member.manage')
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
    const search = q.search ?? '';
    return this.tickets.tx(a, async (tx) => {
      const rows = await tx.person.findMany({
        where: { organizationId: a.ctx.organizationId, status: 'active', ...(search ? { OR: [{ givenName: { contains: search, mode: 'insensitive' } }, { familyName: { contains: search, mode: 'insensitive' } }, { primaryEmail: { contains: search, mode: 'insensitive' } }] } : {}) },
        select: { id: true, givenName: true, familyName: true, preferredName: true, primaryEmail: true },
        orderBy: { givenName: 'asc' },
        take: 20,
      });
      return rows.map((p) => ({ id: p.id, name: [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' '), email: p.primaryEmail }));
    });
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
    return this.tickets.get(await this.access.actor(req, t), id);
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
  ) {}

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
