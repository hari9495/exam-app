import { Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext, AuditService, CERTIFICATE_DEFAULT, CertificateTemplateCopy } from '@exam-platform/shared';
import { UpsertCertificateTemplateDto } from './dto/upsert-certificate-template.dto';

export interface CertificateTemplateView {
  title: string;
  bodyText: string;
  signatoryName: string | null;
  enabled: boolean;
  // True when the returned copy is the built-in default (the org has never saved one).
  isDefault: boolean;
}

@Injectable()
export class CertificateTemplatesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  // For the editor: the org's saved row, or the built-in default surfaced as an editable starting point.
  async get(context: TenantContext): Promise<CertificateTemplateView> {
    const orgId = context.organizationId as string;
    const row = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.certificateTemplate.findUnique({ where: { organizationId: orgId } }),
    );
    if (!row) {
      return { ...CERTIFICATE_DEFAULT, signatoryName: CERTIFICATE_DEFAULT.signatoryName ?? null, enabled: true, isDefault: true };
    }
    return { title: row.title, bodyText: row.bodyText, signatoryName: row.signatoryName, enabled: row.enabled, isDefault: false };
  }

  async upsert(context: TenantContext, actorUserId: string, dto: UpsertCertificateTemplateDto): Promise<CertificateTemplateView> {
    const orgId = context.organizationId as string;
    const row = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.certificateTemplate.upsert({
        where: { organizationId: orgId },
        create: { organizationId: orgId, title: dto.title, bodyText: dto.bodyText, signatoryName: dto.signatoryName ?? null, enabled: dto.enabled ?? true },
        update: { title: dto.title, bodyText: dto.bodyText, signatoryName: dto.signatoryName ?? null, ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}) },
      }),
    );
    await this.audit.record(context, { actorUserId, action: 'certificate_template.saved', entityType: 'certificate_template', entityId: row.id });
    return { title: row.title, bodyText: row.bodyText, signatoryName: row.signatoryName, enabled: row.enabled, isDefault: false };
  }

  // For rendering: the org's ENABLED row, else the built-in default. A disabled row falls back so the
  // certificate copy is never blank.
  async resolveCopy(context: TenantContext): Promise<CertificateTemplateCopy> {
    const orgId = context.organizationId as string;
    const row = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.certificateTemplate.findUnique({ where: { organizationId: orgId } }),
    );
    if (!row || !row.enabled) return CERTIFICATE_DEFAULT;
    return { title: row.title, bodyText: row.bodyText, signatoryName: row.signatoryName };
  }
}
