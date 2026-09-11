import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AgencyPortalService } from './agency-portal.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { PublicApplicationsThrottlerGuard } from '../public-applications/public-applications.throttler.guard';

// Deliberately NOT behind JwtAuthGuard/PermissionsGuard -- an external agency's recruiter has no
// account, only their agency's portal token. Reuses PublicApplicationsThrottlerGuard, which keys
// its budget off req.params.token, matching this controller's :token route param.
@Controller('public/agency-portal')
@UseGuards(PublicApplicationsThrottlerGuard)
export class AgencyPortalController {
  constructor(private readonly service: AgencyPortalService) {}

  @Get(':token')
  getPortal(@Param('token') token: string) {
    return this.service.getPortal(token);
  }

  @Post(':token/submissions')
  submit(@Param('token') token: string, @Body() dto: CreateSubmissionDto) {
    return this.service.submit(token, dto);
  }
}
