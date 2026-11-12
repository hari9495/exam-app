import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PlatformStaffGuard } from '../platform/platform-staff.guard';
import { HelpArticleDto, HelpReviewDto, HelpSaveDto, HelpSettingsDto, HelpSubmitDto, HelpRetireDto } from './help-centre.dto';
import { HelpCentreService } from './help-centre.service';

// YukthiX console C-8, YX-11 (answer 1057): the help-centre editor. Staff only, on their own platform session with their
// security key, every route behind the help-centre key (staff role: Support agent, answer 1058).
@Controller('platform/help-centre')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class HelpCentreController {
  constructor(private readonly help: HelpCentreService) {}

  @Get()
  @RequirePermissions('platform.helpcentre.write')
  overview(@CurrentUserId() actor: string) {
    return this.help.overview(actor);
  }

  @Get('articles/:id')
  @RequirePermissions('platform.helpcentre.write')
  get(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.help.get(actor, id);
  }

  @Post('articles')
  @RequirePermissions('platform.helpcentre.write')
  create(@CurrentUserId() actor: string, @Body() dto: HelpArticleDto) {
    return this.help.create(actor, dto);
  }

  @Patch('articles/:id')
  @RequirePermissions('platform.helpcentre.write')
  save(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HelpSaveDto) {
    return this.help.save(actor, id, dto);
  }

  @Post('articles/:id/submit')
  @HttpCode(200)
  @RequirePermissions('platform.helpcentre.write')
  submit(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HelpSubmitDto) {
    return this.help.submit(actor, id, dto.version);
  }

  @Post('articles/:id/review')
  @HttpCode(200)
  @RequirePermissions('platform.helpcentre.write')
  review(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HelpReviewDto) {
    return this.help.review(actor, id, dto);
  }

  /** Answer 1203: retire a published article; another staff member approves (four eyes, as for publishing). */
  @Post('articles/:id/retire')
  @HttpCode(200)
  @RequirePermissions('platform.helpcentre.write')
  requestRetire(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HelpRetireDto) {
    return this.help.requestRetire(actor, id, dto.reason);
  }

  @Post('articles/:id/retire/approve')
  @HttpCode(200)
  @RequirePermissions('platform.helpcentre.write')
  approveRetire(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.help.approveRetire(actor, id);
  }

  @Put('settings')
  @RequirePermissions('platform.helpcentre.write')
  saveSettings(@CurrentUserId() actor: string, @Body() dto: HelpSettingsDto) {
    return this.help.saveSettings(actor, dto);
  }
}
