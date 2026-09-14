import { Controller, Get, Param } from '@nestjs/common';
import { CertificateService } from './certificate.service';

// Public certificate verification — deliberately NOT behind JwtAuthGuard (anyone holding a
// certificate can confirm it). Read-only + idempotent; the app-wide IP-keyed throttler (APP_GUARD)
// covers abuse. The id is the certificate id printed on the PDF (= result.id, an unguessable UUID).
@Controller('public/certificates')
export class PublicCertificatesController {
  constructor(private readonly certificate: CertificateService) {}

  @Get(':id/verify')
  verify(@Param('id') id: string) {
    return this.certificate.verifyCertificate(id);
  }
}
