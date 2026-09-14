import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { CertificatesController } from './certificates.controller';
import { PublicCertificatesController } from './public-certificates.controller';
import { CertificateTemplatesService } from './certificate-templates.service';
import { CertificateService } from './certificate.service';

// Pass certificates: per-org editable copy + get-or-generate PDF (recruiter download here; the
// candidate download lives in exam-runtime). StorageModule for BlobStorageService; TenantPrisma/Audit
// are global. The PDF builder is shared (@exam-platform/shared) so exam-runtime renders it identically.
@Module({
  imports: [StorageModule],
  controllers: [CertificatesController, PublicCertificatesController],
  providers: [CertificateTemplatesService, CertificateService],
  exports: [CertificateTemplatesService, CertificateService],
})
export class CertificatesModule {}
