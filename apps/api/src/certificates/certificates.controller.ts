import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { OwnSessionChangesGuard } from '../auth/own-session.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CertificateTemplatesService } from './certificate-templates.service';
import { CertificateService } from './certificate.service';
import { UpsertCertificateTemplateDto } from './dto/upsert-certificate-template.dto';

// Recruiter/admin certificate surface: manage the org's certificate copy, and download a passing
// candidate's certificate. Gated exam:manage (same key as exam config + result release).
@Controller()
// AS-0 (answer 2006): no assessments change while acting for someone else.
@UseGuards(JwtAuthGuard, OwnSessionChangesGuard, PermissionsGuard)
export class CertificatesController {
  constructor(
    private readonly templates: CertificateTemplatesService,
    private readonly certificate: CertificateService,
  ) {}

  @Get('certificate-template')
  @RequireAnyPermission('exam:manage', 'assessments.settings.manage')
  getTemplate(@CurrentTenant() tenant: TenantContext) {
    return this.templates.get(tenant);
  }

  // AS-0 (2003): the company's assessment settings.
  @Put('certificate-template')
  @RequireAnyPermission('exam:manage', 'assessments.settings.manage')
  upsertTemplate(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpsertCertificateTemplateDto) {
    return this.templates.upsert(tenant, userId, dto);
  }

  // Recruiter download: allowed before release (preview), still requires enabled + passed.
  @Get('attempts/:attemptId/certificate')
  @RequirePermissions('exam:manage')
  download(@CurrentTenant() tenant: TenantContext, @Param('attemptId') attemptId: string) {
    return this.certificate.getCertificateUrl(tenant, attemptId, { requireReleased: false });
  }
}
