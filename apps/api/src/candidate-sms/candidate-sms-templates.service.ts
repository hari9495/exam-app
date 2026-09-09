import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { DEFAULT_SMS_TEMPLATES } from './default-sms-templates';
import { UpsertSmsTemplateDto } from './dto/upsert-sms-template.dto';

export interface SmsTemplateView {
  id: string | null;
  name: string;
  triggerStageId: string | null;
  triggerMode: string;
  body: string;
  enabled: boolean;
  isDefault: boolean;
}

export interface ResolvedSmsTemplate {
  id: string | null;
  body: string;
  triggerMode: string;
}

@Injectable()
export class CandidateSmsTemplatesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async listWithDefaults(context: TenantContext): Promise<SmsTemplateView[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const saved = await tx.candidateSmsTemplate.findMany({
        where: { organizationId: context.organizationId as string },
        orderBy: { updatedAt: 'desc' },
      });
      const savedStageIds = new Set(saved.map((s: any) => s.triggerStageId));
      const savedViews: SmsTemplateView[] = saved.map((s: any) => ({
        id: s.id,
        name: s.name,
        triggerStageId: s.triggerStageId,
        triggerMode: s.triggerMode,
        body: s.body,
        enabled: s.enabled,
        isDefault: false,
      }));

      // DEFAULT_SMS_TEMPLATES are code constants keyed by stage NAME (there's no per-org stage id
      // to hardcode). Resolve each name against this org's default pipeline to line defaults up
      // with saved rows (which key on triggerStageId) for dedupe; a name with no matching stage on
      // the default pipeline (renamed/removed seed stage) has nothing to attach to and is dropped.
      const defaultPipeline = await tx.pipeline.findFirst({
        where: { organizationId: context.organizationId as string, isDefault: true },
        include: { stages: { select: { id: true, name: true } } },
      });
      const stageIdByName = new Map((defaultPipeline?.stages ?? []).map((s: { id: string; name: string }) => [s.name, s.id]));

      const defaultViews: SmsTemplateView[] = DEFAULT_SMS_TEMPLATES.flatMap((d) => {
        const stageId = d.triggerEvent ? (stageIdByName.get(d.triggerEvent) ?? null) : null;
        if (d.triggerEvent && (!stageId || savedStageIds.has(stageId))) return [];
        return [{
          id: null,
          name: d.name,
          triggerStageId: stageId,
          triggerMode: d.triggerMode,
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
  async resolveForStage(context: TenantContext, stageId: string): Promise<ResolvedSmsTemplate | null> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const saved = await tx.candidateSmsTemplate.findFirst({
        where: { organizationId: context.organizationId as string, triggerStageId: stageId, enabled: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (saved) return { id: saved.id, body: saved.body, triggerMode: saved.triggerMode };

      // No saved override -- fall back to the code default for this stage's NAME (defaults are
      // keyed by name, not id, since they're not stored per-org).
      const stage = await tx.pipelineStage.findFirst({
        where: { id: stageId, organizationId: context.organizationId as string },
        select: { name: true },
      });
      const def = stage ? DEFAULT_SMS_TEMPLATES.find((d) => d.triggerEvent === stage.name) : undefined;
      if (def) return { id: null, body: def.body, triggerMode: def.triggerMode };

      return null;
    });
  }

  async upsert(context: TenantContext, actorUserId: string, dto: UpsertSmsTemplateDto) {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const triggerStageId = dto.triggerStageId ?? null;
      const baseData = {
        organizationId: context.organizationId as string,
        name: dto.name,
        triggerStageId,
        triggerMode: dto.triggerMode,
        body: dto.body,
      };

      let row;
      if (dto.id) {
        const existing = await tx.candidateSmsTemplate.findFirst({ where: { id: dto.id, organizationId: context.organizationId as string } });
        if (!existing) throw new NotFoundException(`Template ${dto.id} not found`);
        // Content-only edits (e.g. body from an edit form) omit `enabled` -- preserve the
        // row's current enabled state instead of silently re-enabling a disabled template.
        const data = { ...baseData, enabled: dto.enabled !== undefined ? dto.enabled : existing.enabled };
        row = await tx.candidateSmsTemplate.update({ where: { id: dto.id }, data });
      } else {
        // Upsert-by-stage: at most one saved row per (org, triggerStageId) so a double-submit
        // doesn't create a duplicate. Manual-only templates (triggerStageId: null) are exempt --
        // a recruiter may have several of those.
        const existingForStage = triggerStageId
          ? await tx.candidateSmsTemplate.findFirst({ where: { organizationId: context.organizationId as string, triggerStageId } })
          : null;
        const data = { ...baseData, enabled: dto.enabled ?? true };
        row = existingForStage
          ? await tx.candidateSmsTemplate.update({ where: { id: existingForStage.id }, data })
          : await tx.candidateSmsTemplate.create({ data });
      }

      await this.audit.record(context, {
        actorUserId,
        action: 'candidate_sms_template.saved',
        entityType: 'candidate_sms_template',
        entityId: row.id,
        metadata: { name: dto.name, triggerStageId: dto.triggerStageId ?? null },
      });
      return row;
    });
  }
}
