import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CertificateTemplatesService } from './certificate-templates.service';
import { CertificateService } from './certificate.service';
import { UpsertCertificateTemplateDto } from './dto/upsert-certificate-template.dto';

// Recruiter/admin certificate surface: manage the org's certificate copy, and download a passing
// candidate's certificate. Gated exam:manage (same key as exam config + result release).
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CertificatesController {
  constructor(
    private readonly templates: CertificateTemplatesService,
    private readonly certificate: CertificateService,
  ) {}

  @Get('certificate-template')
  @RequirePermissions('exam:manage')
  getTemplate(@CurrentTenant() tenant: TenantContext) {
    return this.templates.get(tenant);
  }

  @Put('certificate-template')
  @RequirePermissions('exam:manage')
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
