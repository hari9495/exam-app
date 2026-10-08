import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard, assertStepUp } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { DeskAccessService, assertOwnSession } from './desk-access';
import { DirectoryService } from './directory.service';
import {
  ArticleDto,
  ArticleMetaDto,
  BlockDto,
  CategoryDto,
  DraftDto,
  FlagDto,
  FollowDto,
  FromTicketDto,
  GapTaskDto,
  IdListDto,
  KbLinkDto,
  KbListQueryDto,
  KbSearchDto,
  KbSpaceDto,
  PeriodDto,
  ReviewDto,
  TemplateDto,
  VersionDto,
} from './dto-kb';
import { CustomReportDto, DecideDto, DirectorySourceDto, KpiQueryDto, KpiTargetDto, MonthDto, PeopleImportDto, PersonDto, PrivacySettingsDto, ReportRunDto, ScheduleDto, SearchDto, StatusQueryDto, SurveyDto, WallboardDto } from './dto-ops';
import { KbService } from './kb.service';
import { PrivacyService } from './privacy.service';
import { LIBRARY, ReportsService, toCsv } from './reports.service';
import { SurveysService } from './surveys.service';

// M14 §12.1 batch 4 staff routes: knowledge (desk.kb.*), reports and wallboards (desk.report.*), NPS surveys
// (desk.survey.manage), the people list and directory sync (desk.directory.manage), privacy requests, retention and the
// recycle bin (Service Desk admin), the set-up checklist. Every route declares its key (YX-SEC-01); the services also
// check the desk seat. Writes are the signed-in person's own (never while acting for someone else).

const KB_READ = ['desk.kb.view_internal', 'desk.kb.author', 'desk.kb.publish'] as const;

@Controller('desk')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeskInsightsController {
  constructor(
    private readonly access: DeskAccessService,
    private readonly kb: KbService,
    private readonly reports: ReportsService,
    private readonly surveys: SurveysService,
    private readonly directory: DirectoryService,
    private readonly privacy: PrivacyService,
  ) {}

  private actor(req: Request, t: TenantContext) {
    return this.access.actor(req, t);
  }

  // ---------------------------------------------------------------- knowledge (SD-1.24, SD-1.25)

  @Get('kb/spaces')
  @RequireAnyPermission(...KB_READ, 'desk.settings.manage', 'desk.desk.create')
  async spaces(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.kb.spaces(await this.actor(req, t));
  }

  @Post('kb/spaces')
  @RequireAnyPermission('desk.settings.manage', 'desk.desk.create')
  async addSpace(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: KbSpaceDto) {
    assertOwnSession(req);
    return this.kb.saveSpace(await this.actor(req, t), null, dto);
  }

  @Patch('kb/spaces/:id')
  @RequireAnyPermission('desk.settings.manage', 'desk.desk.create')
  async editSpace(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: KbSpaceDto) {
    assertOwnSession(req);
    return this.kb.saveSpace(await this.actor(req, t), id, dto);
  }

  @Post('kb/spaces/:id/categories')
  @RequireAnyPermission('desk.kb.publish', 'desk.settings.manage', 'desk.desk.create')
  async addCategory(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CategoryDto) {
    assertOwnSession(req);
    return this.kb.saveCategory(await this.actor(req, t), id, null, dto);
  }

  @Patch('kb/spaces/:id/categories/:categoryId')
  @RequireAnyPermission('desk.kb.publish', 'desk.settings.manage', 'desk.desk.create')
  async editCategory(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('categoryId', ParseUUIDPipe) categoryId: string, @Body() dto: CategoryDto) {
    assertOwnSession(req);
    return this.kb.saveCategory(await this.actor(req, t), id, categoryId, dto);
  }

  @Put('kb/spaces/:id/categories/order')
  @RequireAnyPermission('desk.kb.publish', 'desk.settings.manage', 'desk.desk.create')
  async reorder(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IdListDto) {
    assertOwnSession(req);
    return this.kb.reorderCategories(await this.actor(req, t), id, dto.ids);
  }

  @Delete('kb/spaces/:id/categories/:categoryId')
  @RequireAnyPermission('desk.kb.publish', 'desk.settings.manage', 'desk.desk.create')
  async deleteCategory(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('categoryId', ParseUUIDPipe) categoryId: string) {
    assertOwnSession(req);
    return this.kb.deleteCategory(await this.actor(req, t), id, categoryId);
  }

  @Get('kb/articles')
  @RequireAnyPermission(...KB_READ)
  async articles(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: KbListQueryDto) {
    return this.kb.list(await this.actor(req, t), q);
  }

  @Post('kb/articles')
  @RequirePermissions('desk.kb.author')
  async addArticle(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: ArticleDto) {
    assertOwnSession(req);
    return this.kb.create(await this.actor(req, t), dto);
  }

  @Get('kb/articles/:id')
  @RequireAnyPermission(...KB_READ)
  async article(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.kb.get(await this.actor(req, t), id);
  }

  @Post('kb/articles/:id/versions')
  @RequirePermissions('desk.kb.author')
  async saveDraft(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DraftDto) {
    assertOwnSession(req);
    return this.kb.saveDraft(await this.actor(req, t), id, dto);
  }

  @Patch('kb/articles/:id')
  @RequirePermissions('desk.kb.author')
  async editArticle(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ArticleMetaDto) {
    assertOwnSession(req);
    return this.kb.updateMeta(await this.actor(req, t), id, dto);
  }

  @Post('kb/articles/:id/submit')
  @HttpCode(200)
  @RequirePermissions('desk.kb.author')
  async submit(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    assertOwnSession(req);
    return this.kb.submit(await this.actor(req, t), id, dto.version);
  }

  @Post('kb/articles/:id/review')
  @HttpCode(200)
  @RequirePermissions('desk.kb.publish')
  async review(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto) {
    assertOwnSession(req);
    return this.kb.review(await this.actor(req, t), id, dto);
  }

  @Post('kb/articles/:id/retire')
  @HttpCode(200)
  @RequirePermissions('desk.kb.publish')
  async retire(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.kb.retire(await this.actor(req, t), id);
  }

  @Post('kb/articles/:id/republish')
  @HttpCode(200)
  @RequirePermissions('desk.kb.publish')
  async republish(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.kb.republish(await this.actor(req, t), id);
  }

  @Delete('kb/articles/:id')
  @RequirePermissions('desk.kb.publish')
  async deleteArticle(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.kb.remove(await this.actor(req, t), id);
  }

  @Post('kb/articles/:id/flag')
  @HttpCode(200)
  @RequireAnyPermission('desk.ticket.work', 'desk.kb.author')
  async flag(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FlagDto) {
    assertOwnSession(req);
    return this.kb.flagOutdated(await this.actor(req, t), id, dto.reason);
  }

  @Post('kb/articles/:id/follow')
  @HttpCode(200)
  @RequireAnyPermission(...KB_READ)
  async follow(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FollowDto) {
    assertOwnSession(req);
    return this.kb.follow(await this.actor(req, t), id, dto.follow);
  }

  @Get('kb/blocks')
  @RequireAnyPermission('desk.kb.author', 'desk.kb.publish')
  async blocks(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.kb.listBlocks(await this.actor(req, t));
  }

  @Post('kb/blocks')
  @RequirePermissions('desk.kb.publish')
  async addBlock(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: BlockDto) {
    assertOwnSession(req);
    return this.kb.saveBlock(await this.actor(req, t), null, dto);
  }

  @Patch('kb/blocks/:id')
  @RequirePermissions('desk.kb.publish')
  async editBlock(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BlockDto) {
    assertOwnSession(req);
    return this.kb.saveBlock(await this.actor(req, t), id, dto);
  }

  @Get('kb/templates')
  @RequireAnyPermission('desk.kb.author', 'desk.kb.publish')
  async templates(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.kb.listTemplates(await this.actor(req, t));
  }

  @Post('kb/templates')
  @RequirePermissions('desk.kb.publish')
  async addTemplate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: TemplateDto) {
    assertOwnSession(req);
    return this.kb.saveTemplate(await this.actor(req, t), null, dto);
  }

  @Patch('kb/templates/:id')
  @RequirePermissions('desk.kb.publish')
  async editTemplate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TemplateDto) {
    assertOwnSession(req);
    return this.kb.saveTemplate(await this.actor(req, t), id, dto);
  }

  @Get('kb/gaps')
  @RequireAnyPermission('desk.report.view', 'desk.kb.publish')
  async gaps(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: PeriodDto) {
    return this.kb.contentGaps(await this.actor(req, t), q.from, q.to);
  }

  @Post('kb/gaps/task')
  @RequirePermissions('desk.task.work')
  async gapTask(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: GapTaskDto) {
    assertOwnSession(req);
    return this.kb.gapTask(await this.actor(req, t), dto.deskId, dto.query, dto.assigneeUserId);
  }

  // Knowledge at work on a ticket (US-B-106, US-G-023).

  @Get('tickets/:id/kb')
  @RequirePermissions('desk.ticket.view')
  async ticketKb(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: KbSearchDto) {
    return this.kb.forReply(await this.actor(req, t), id, q.q);
  }

  @Get('tickets/:id/kb-links')
  @RequirePermissions('desk.ticket.view')
  async ticketKbLinks(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.kb.ticketArticles(await this.actor(req, t), id);
  }

  @Post('tickets/:id/kb-links')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async linkKb(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: KbLinkDto) {
    assertOwnSession(req);
    return this.kb.link(await this.actor(req, t), id, dto.articleId, dto.kind);
  }

  @Post('tickets/:id/kb-article')
  @RequirePermissions('desk.kb.author')
  async articleFromTicket(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FromTicketDto) {
    assertOwnSession(req);
    return this.kb.fromTicket(await this.actor(req, t), id, dto.spaceId);
  }

  // ---------------------------------------------------------------- reports (SD-1.27)

  @Get('reports/dashboard')
  @RequirePermissions('desk.report.view')
  async dashboard(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: ReportRunDto) {
    return this.reports.dashboard(await this.actor(req, t), q);
  }

  @Get('reports/library')
  @RequirePermissions('desk.report.view')
  library() {
    return LIBRARY;
  }

  /** A ready report as rows, or as a formula-safe CSV (?format=csv). */
  @Get('reports/library/:key')
  @RequirePermissions('desk.report.view')
  async runReport(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('key') key: string, @Query() q: ReportRunDto, @Res({ passthrough: true }) res: Response) {
    const out = await this.reports.run(await this.actor(req, t), key as never, q);
    if (q.format !== 'csv') return out;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${key}.csv"`);
    return toCsv(out.columns, out.rows);
  }

  @Get('reports/funnel')
  @RequirePermissions('desk.report.view')
  async funnel(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: ReportRunDto) {
    return this.reports.funnel(await this.actor(req, t), q);
  }

  @Get('reports/kpis/:deskId')
  @RequirePermissions('desk.report.view')
  async kpis(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('deskId', ParseUUIDPipe) deskId: string, @Query() q: KpiQueryDto) {
    return this.reports.kpis(await this.actor(req, t), deskId, q.days);
  }

  @Put('reports/kpis/:deskId/target')
  @RequirePermissions('desk.report.manage')
  async kpiTarget(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('deskId', ParseUUIDPipe) deskId: string, @Body() dto: KpiTargetDto) {
    assertOwnSession(req);
    return this.reports.setTarget(await this.actor(req, t), deskId, dto);
  }

  @Get('reports/custom')
  @RequirePermissions('desk.report.view')
  async custom(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.reports.customReports(await this.actor(req, t));
  }

  @Post('reports/custom')
  @RequirePermissions('desk.report.manage')
  async addCustom(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: CustomReportDto) {
    assertOwnSession(req);
    return this.reports.saveCustom(await this.actor(req, t), null, dto);
  }

  @Patch('reports/custom/:id')
  @RequirePermissions('desk.report.manage')
  async editCustom(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CustomReportDto) {
    assertOwnSession(req);
    return this.reports.saveCustom(await this.actor(req, t), id, dto);
  }

  @Delete('reports/custom/:id')
  @RequirePermissions('desk.report.manage')
  async deleteCustom(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.reports.deleteCustom(await this.actor(req, t), id);
  }

  @Get('reports/custom/:id/run')
  @RequirePermissions('desk.report.view')
  async runCustom(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: ReportRunDto, @Res({ passthrough: true }) res: Response) {
    const out = await this.reports.runCustom(await this.actor(req, t), id);
    if (q.format !== 'csv') return out;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
    return toCsv(out.columns, out.rows);
  }

  @Post('reports/custom/:id/schedules')
  @RequirePermissions('desk.report.manage')
  async schedule(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ScheduleDto) {
    assertOwnSession(req);
    return this.reports.saveSchedule(await this.actor(req, t), id, dto);
  }

  @Post('reports/schedules/:id/end')
  @HttpCode(200)
  @RequirePermissions('desk.report.manage')
  async endSchedule(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.reports.endSchedule(await this.actor(req, t), id);
  }

  @Get('reports/wallboards')
  @RequirePermissions('desk.report.view')
  async wallboards(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.reports.wallboards(await this.actor(req, t));
  }

  @Post('reports/wallboards')
  @RequirePermissions('desk.report.manage')
  async addWallboard(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: WallboardDto) {
    assertOwnSession(req);
    return this.reports.createWallboard(await this.actor(req, t), dto);
  }

  @Post('reports/wallboards/:id/revoke')
  @HttpCode(200)
  @RequirePermissions('desk.report.manage')
  async revokeWallboard(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.reports.revokeWallboard(await this.actor(req, t), id);
  }

  @Get('reports/customers/:accountId')
  @RequirePermissions('desk.report.view')
  async customerSla(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('accountId', ParseUUIDPipe) accountId: string, @Query() q: MonthDto) {
    return this.reports.customerSla(await this.actor(req, t), accountId, q.month);
  }

  // ---------------------------------------------------------------- NPS (SD-1.26)

  @Get('surveys')
  @RequirePermissions('desk.survey.manage')
  async surveyList(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.surveys.surveys(await this.actor(req, t));
  }

  @Post('surveys')
  @RequirePermissions('desk.survey.manage')
  async addSurvey(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: SurveyDto) {
    assertOwnSession(req);
    return this.surveys.saveSurvey(await this.actor(req, t), null, dto);
  }

  @Patch('surveys/:id')
  @RequirePermissions('desk.survey.manage')
  async editSurvey(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SurveyDto) {
    assertOwnSession(req);
    return this.surveys.saveSurvey(await this.actor(req, t), id, dto);
  }

  @Get('surveys/:id/answers')
  @RequirePermissions('desk.survey.manage')
  async answers(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.surveys.answers(await this.actor(req, t), id);
  }

  // ---------------------------------------------------------------- people list and directory sync (SD-1.29)

  @Get('people-list')
  @RequirePermissions('desk.directory.manage')
  async peopleList(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: SearchDto) {
    return this.directory.people(await this.actor(req, t), q.search);
  }

  @Post('people-list')
  @RequirePermissions('desk.directory.manage')
  async addPerson(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: PersonDto) {
    assertOwnSession(req);
    return this.directory.savePerson(await this.actor(req, t), null, dto);
  }

  @Patch('people-list/:id')
  @RequirePermissions('desk.directory.manage')
  async editPerson(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PersonDto) {
    assertOwnSession(req);
    return this.directory.savePerson(await this.actor(req, t), id, dto);
  }

  @Post('people-list/import')
  @HttpCode(200)
  @RequirePermissions('desk.directory.manage')
  async importPeople(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: PeopleImportDto) {
    assertOwnSession(req);
    return this.directory.importPeople(await this.actor(req, t), dto);
  }

  @Get('people-list/:id/groups')
  @RequireAnyPermission('desk.directory.manage', 'desk.ticket.work')
  async groupsOf(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.directory.groupsOf(await this.actor(req, t), id);
  }

  @Get('directory-sources')
  @RequirePermissions('desk.directory.manage')
  async sources(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.directory.sources(await this.actor(req, t));
  }

  /** Directory credentials (an LDAP bind password, a new SCIM token) need a fresh second factor. */
  @Post('directory-sources')
  @RequirePermissions('desk.directory.manage')
  @RequireStepUp()
  async addSource(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: DirectorySourceDto) {
    assertOwnSession(req);
    return this.directory.saveSource(await this.actor(req, t), null, dto);
  }

  @Patch('directory-sources/:id')
  @RequirePermissions('desk.directory.manage')
  async editSource(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DirectorySourceDto) {
    assertOwnSession(req);
    if (dto.ldap?.bindPassword) assertStepUp(req.user as never);
    return this.directory.saveSource(await this.actor(req, t), id, dto);
  }

  @Post('directory-sources/:id/rotate')
  @HttpCode(200)
  @RequirePermissions('desk.directory.manage')
  @RequireStepUp()
  async rotateScim(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.directory.rotateScim(await this.actor(req, t), id);
  }

  @Post('directory-sources/:id/sync')
  @HttpCode(200)
  @RequirePermissions('desk.directory.manage')
  async syncNow(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.directory.syncNow(await this.actor(req, t), id);
  }

  @Get('setup/checklist')
  @RequireAnyPermission('desk.desk.create', 'desk.settings.manage')
  async checklist(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.directory.checklist(await this.actor(req, t));
  }

  // ---------------------------------------------------------------- privacy, retention, recycle bin (SD-1.30)

  @Get('privacy/requests')
  @RequirePermissions('desk.desk.create')
  async privacyRequests(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: StatusQueryDto) {
    return this.privacy.list(await this.actor(req, t), q.status);
  }

  /** Carrying out an erasure removes words and files for good: a fresh second factor. */
  @Post('privacy/requests/:id/decide')
  @HttpCode(200)
  @RequirePermissions('desk.desk.create')
  @RequireStepUp()
  async decide(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDto) {
    assertOwnSession(req);
    return this.privacy.decide(await this.actor(req, t), id, dto);
  }

  @Get('privacy/settings')
  @RequirePermissions('desk.desk.create')
  async privacySettings(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.privacy.settings(await this.actor(req, t));
  }

  @Put('privacy/settings')
  @RequirePermissions('desk.desk.create')
  @RequireStepUp()
  async savePrivacySettings(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: PrivacySettingsDto) {
    assertOwnSession(req);
    return this.privacy.saveSettings(await this.actor(req, t), dto);
  }

  @Get('recycle-bin')
  @RequireAnyPermission('desk.desk.create', 'desk.settings.manage', 'desk.kb.publish', 'desk.ticket.view')
  async bin(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    return this.privacy.bin(await this.actor(req, t));
  }

  @Post('recycle-bin/:id/restore')
  @HttpCode(200)
  @RequireAnyPermission('desk.desk.create', 'desk.settings.manage', 'desk.kb.publish', 'desk.ticket.view')
  async restore(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.privacy.restore(await this.actor(req, t), id);
  }
}

