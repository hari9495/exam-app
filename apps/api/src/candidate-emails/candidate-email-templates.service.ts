import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { DEFAULT_TEMPLATES } from './default-templates';
import { UpsertTemplateDto } from './dto/upsert-template.dto';

export interface TemplateView {
  id: string | null;
  name: string;
  triggerStageId: string | null;
  triggerMode: string;
  subject: string;
  body: string;
  enabled: boolean;
  isDefault: boolean;
}

export interface ResolvedTemplate {
  id: string | null;
  subject: string;
  body: string;
  triggerMode: string;
}

@Injectable()
export class CandidateEmailTemplatesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async listWithDefaults(context: TenantContext): Promise<TemplateView[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const saved = await tx.candidateEmailTemplate.findMany({
        where: { organizationId: context.organizationId as string },
        orderBy: { updatedAt: 'desc' },
      });
      const savedStageIds = new Set(saved.map((s: any) => s.triggerStageId));
      const savedViews: TemplateView[] = saved.map((s: any) => ({
        id: s.id,
        name: s.name,
        triggerStageId: s.triggerStageId,
        triggerMode: s.triggerMode,
        subject: s.subject,
        body: s.body,
        enabled: s.enabled,
        isDefault: false,
      }));

      // DEFAULT_TEMPLATES are code constants keyed by stage NAME (there's no per-org stage id to
      // hardcode). Resolve each name against this org's default pipeline to line defaults up with
      // saved rows (which key on triggerStageId) for dedupe; a name with no matching stage on the
      // default pipeline (renamed/removed seed stage) has nothing to attach to and is dropped.
      const defaultPipeline = await tx.pipeline.findFirst({
        where: { organizationId: context.organizationId as string, isDefault: true },
        include: { stages: { select: { id: true, name: true } } },
      });
      const stageIdByName = new Map((defaultPipeline?.stages ?? []).map((s: { id: string; name: string }) => [s.name, s.id]));

      const defaultViews: TemplateView[] = DEFAULT_TEMPLATES.flatMap((d) => {
        const stageId = d.triggerEvent ? (stageIdByName.get(d.triggerEvent) ?? null) : null;
        if (d.triggerEvent && (!stageId || savedStageIds.has(stageId))) return [];
        return [{
          id: null,
          name: d.name,
          triggerStageId: stageId,
          triggerMode: d.triggerMode,
          subject: d.subject,
          body: d.body,
          enabled: true,
          isDefault: true,
        }];
      });
      return [...savedViews, ...defaultViews];
    });
  }

  // Opens its own forTenant read -- callers (e.g. the pipeline stage-move hook) invoke this
  // after their own transaction has already committed, so this must not depend on a
  // caller-supplied tx.
  async resolveForStage(context: TenantContext, stageId: string): Promise<ResolvedTemplate | null> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const saved = await tx.candidateEmailTemplate.findFirst({
        where: { organizationId: context.organizationId as string, triggerStageId: stageId, enabled: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (saved) return { id: saved.id, subject: saved.subject, body: saved.body, triggerMode: saved.triggerMode };

      // No saved override -- fall back to the code default for this stage's NAME (defaults are
      // keyed by name, not id, since they're not stored per-org).
      const stage = await tx.pipelineStage.findFirst({
        where: { id: stageId, organizationId: context.organizationId as string },
        select: { name: true },
      });
      const def = stage ? DEFAULT_TEMPLATES.find((d) => d.triggerEvent === stage.name) : undefined;
      if (def) return { id: null, subject: def.subject, body: def.body, triggerMode: def.triggerMode };

      return null;
    });
  }

  async upsert(context: TenantContext, actorUserId: string, dto: UpsertTemplateDto) {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const triggerStageId = dto.triggerStageId ?? null;
      const baseData = {
        organizationId: context.organizationId as string,
        name: dto.name,
        triggerStageId,
        triggerMode: dto.triggerMode,
        subject: dto.subject,
        body: dto.body,
      };

      let row;
      if (dto.id) {
        const existing = await tx.candidateEmailTemplate.findFirst({ where: { id: dto.id, organizationId: context.organizationId as string } });
        if (!existing) throw new NotFoundException(`Template ${dto.id} not found`);
        // Content-only edits (e.g. subject/body from an edit form) omit `enabled` -- preserve
        // the row's current enabled state instead of silently re-enabling a disabled template.
        const data = { ...baseData, enabled: dto.enabled !== undefined ? dto.enabled : existing.enabled };
        row = await tx.candidateEmailTemplate.update({ where: { id: dto.id }, data });
      } else {
        // Upsert-by-stage: at most one saved row per (org, triggerStageId) so a double-submit
        // doesn't create a duplicate. Manual-only templates (triggerStageId: null) are exempt --
        // a recruiter may have several of those.
        const existingForStage = triggerStageId
          ? await tx.candidateEmailTemplate.findFirst({ where: { organizationId: context.organizationId as string, triggerStageId } })
          : null;
        const data = { ...baseData, enabled: dto.enabled ?? true };
        row = existingForStage
          ? await tx.candidateEmailTemplate.update({ where: { id: existingForStage.id }, data })
          : await tx.candidateEmailTemplate.create({ data });
      }

      await this.audit.record(context, {
        actorUserId,
        action: 'candidate_email_template.saved',
        entityType: 'candidate_email_template',
        entityId: row.id,
        metadata: { name: dto.name, triggerStageId: dto.triggerStageId ?? null },
      });
      return row;
    });
  }

  async setEnabled(context: TenantContext, actorUserId: string, id: string, enabled: boolean) {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.candidateEmailTemplate.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) throw new NotFoundException(`Template ${id} not found`);

      const row = await tx.candidateEmailTemplate.update({ where: { id }, data: { enabled } });
      await this.audit.record(context, {
        actorUserId,
        action: enabled ? 'candidate_email_template.enabled' : 'candidate_email_template.disabled',
        entityType: 'candidate_email_template',
        entityId: id,
      });
      return row;
    });
  }

  async remove(context: TenantContext, actorUserId: string, id: string): Promise<{ success: true }> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.candidateEmailTemplate.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) throw new NotFoundException(`Template ${id} not found`);

      await tx.candidateEmailTemplate.delete({ where: { id } });
      await this.audit.record(context, {
        actorUserId,
        action: 'candidate_email_template.removed',
        entityType: 'candidate_email_template',
        entityId: id,
      });
    });
    return { success: true };
  }
}
