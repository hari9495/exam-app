import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BlobStorageService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { audit, inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { validatePdfUpload } from '../public-applications/pdf-validation';
import { HiringSettingsService } from './hiring-settings.service';
import { auditState, resultsProblem, validUntil, type AuditResults } from './bias-audit';
import type { RecordBiasAuditDto } from './hiring-dto';

const iso = (d: Date) => d.toISOString().slice(0, 10);

// HIR-23 Bias audits (Hiring › Reports & compliance). Recruiting and the hiring settings holders read it; recording an
// audit needs the hiring settings key for the whole company (as 6.1) and is never done while acting for someone else.
// Every audit is kept (append-only); the latest one counts for a year (rule set HIR.BIAS_AUDIT).
@Injectable()
export class BiasAuditService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blobs: BlobStorageService,
    private readonly settings: HiringSettingsService,
  ) {}

  async view(ctx: TenantContext, user: ScopeUser) {
    const canEdit = await this.settings.canEdit(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await auditState(tx, c);
      const history = await tx.biasAudit.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ auditedOn: 'desc' }, { createdAt: 'desc' }], take: 20 });
      const by = await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: history.map((h) => h.createdBy) } }, select: { id: true, name: true, email: true } });
      // The automated tools this audit covers, and whether each is on for the company.
      const tools = {
        rediscoveryAi: (await settingFor(tx, c, 'hiring.rediscovery.ai', { legalEntityId: '' })) === 'on',
        aiDraft: (await settingFor(tx, c, 'hiring.notetaker.ai_draft', { legalEntityId: '' })) === 'on',
      };
      return {
        canEdit,
        nycOn: s.nycOn,
        today: s.today,
        law: s.law ? { name: s.law.name, source: s.law.source, verify: s.law.verify, validMonths: s.law.validMonths, categories: s.law.categories } : null,
        valid: s.valid,
        validUntil: s.validUntil,
        tools,
        audits: history.map((h) => ({
          id: h.id,
          auditedOn: iso(h.auditedOn),
          validUntil: s.law ? validUntil(iso(h.auditedOn), s.law.validMonths) : null,
          auditor: h.auditor,
          summaryUrl: h.summaryUrl,
          results: h.results as unknown as AuditResults,
          reportName: h.reportName,
          note: h.note,
          recordedBy: by.find((u) => u.id === h.createdBy)?.name || by.find((u) => u.id === h.createdBy)?.email || 'Someone',
          recordedAt: h.createdAt,
        })),
      };
    });
  }

  async record(ctx: TenantContext, user: ScopeUser, dto: RecordBiasAuditDto) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else');
    if (!(await this.settings.canEdit(user))) throw new ForbiddenException('Only people with the hiring settings key for the whole company record bias audits.');
    const file = Buffer.from(dto.reportBase64, 'base64');
    const checked = validatePdfUpload(file);
    if (!checked.ok) throw new BadRequestException(checked.reason === 'too_large' ? 'The audit report is larger than 5 MB. Add a smaller PDF.' : 'The audit report must be a PDF file.');
    const pre = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await auditState(tx, c);
      if (!s.law) throw new BadRequestException('No bias audit law is set up yet.');
      if (dto.auditedOn > s.today) throw new BadRequestException('The audit date cannot be in the future.');
      if (validUntil(dto.auditedOn, s.law.validMonths) < s.today) throw new BadRequestException(`An audit from ${dto.auditedOn} no longer counts (more than a year ago). Record the latest audit.`);
      const problem = resultsProblem(s.law, dto.results);
      if (problem) throw new BadRequestException(problem);
      return c.organizationId;
    });
    const path = await this.blobs.upload(`bias-audits/${pre}/${randomUUID()}.pdf`, file, 'application/pdf');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await tx.biasAudit.create({
        data: { organizationId: c.organizationId, auditedOn: new Date(`${dto.auditedOn}T00:00:00Z`), auditor: dto.auditor.trim(), summaryUrl: dto.summaryUrl.trim(), results: dto.results as unknown as object, reportPath: path, reportName: dto.reportName.trim().slice(0, 200), note: dto.note?.trim() || null, createdBy: user.userId! },
      });
      await audit(tx, c, 'ats.bias_audit.recorded', 'bias_audit', row.id, { auditedOn: dto.auditedOn, auditor: row.auditor });
      return { id: row.id };
    });
  }

  /** A short-lived link to an audit's report file. Another company's audit is 404. */
  async report(ctx: TenantContext, id: string) {
    const path = await inCompany(this.tenantPrisma, ctx, async (tx, c) => (await tx.biasAudit.findFirst({ where: { organizationId: c.organizationId, id }, select: { reportPath: true } }))?.reportPath ?? null);
    if (!path) throw new NotFoundException('No such bias audit.');
    return { url: (await this.blobs.signIfOurs(path)) as string };
  }
}
