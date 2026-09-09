import { NotFoundException } from '@nestjs/common';
import { CandidateSmsTemplatesService } from './candidate-sms-templates.service';

describe('CandidateSmsTemplatesService', () => {
  let service: CandidateSmsTemplatesService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: {
    candidateSmsTemplate: Record<string, jest.Mock>;
    pipeline: Record<string, jest.Mock>;
    pipelineStage: Record<string, jest.Mock>;
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      candidateSmsTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      // Default pipeline used to line up DEFAULT_SMS_TEMPLATES (keyed by stage NAME) against real
      // per-org stage ids -- no stages by default; individual tests opt in.
      pipeline: { findFirst: jest.fn().mockResolvedValue(null) },
      pipelineStage: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    audit = { record: jest.fn() };
    service = new CandidateSmsTemplatesService(tenantPrisma as any, audit as any);
  });

  describe('listWithDefaults', () => {
    const defaultPipelineStages = [
      { id: 'st-applied', name: 'applied' },
      { id: 'st-interview', name: 'interview' },
      { id: 'st-offer', name: 'offer' },
      { id: 'st-rejected', name: 'rejected' },
    ];

    it('merges saved rows over code defaults: saved wins, uncovered stages fall back to the code default', async () => {
      tx.pipeline.findFirst.mockResolvedValue({ stages: defaultPipelineStages });
      tx.candidateSmsTemplate.findMany.mockResolvedValue([
        { id: 's1', name: 'Custom interview', triggerStageId: 'st-interview', triggerMode: 'prompt', body: 'B', enabled: true },
      ]);

      const list = await service.listWithDefaults(context);

      const interview = list.find((t) => t.triggerStageId === 'st-interview');
      expect(interview).toMatchObject({ id: 's1', body: 'B', isDefault: false });

      const offer = list.find((t) => t.triggerStageId === 'st-offer');
      expect(offer).toMatchObject({ id: null, isDefault: true });

      const applied = list.find((t) => t.triggerStageId === 'st-applied');
      expect(applied).toMatchObject({ id: null, isDefault: true });

      const rejected = list.find((t) => t.triggerStageId === 'st-rejected');
      expect(rejected).toMatchObject({ id: null, isDefault: true });

      // interview appears exactly once (saved row only, default suppressed)
      expect(list.filter((t) => t.triggerStageId === 'st-interview')).toHaveLength(1);
    });

    it('shows a saved DISABLED row for a stage instead of the code default, and does not also emit the default', async () => {
      tx.pipeline.findFirst.mockResolvedValue({ stages: defaultPipelineStages });
      tx.candidateSmsTemplate.findMany.mockResolvedValue([
        { id: 's1', name: 'Custom offer', triggerStageId: 'st-offer', triggerMode: 'prompt', body: 'B', enabled: false },
      ]);

      const list = await service.listWithDefaults(context);
      const offerRows = list.filter((t) => t.triggerStageId === 'st-offer');

      expect(offerRows).toHaveLength(1);
      expect(offerRows[0]).toMatchObject({ id: 's1', enabled: false, isDefault: false });
    });

    it('drops a default whose stage name has no match on this org\'s default pipeline', async () => {
      tx.pipeline.findFirst.mockResolvedValue({ stages: [] }); // no stages at all
      const list = await service.listWithDefaults(context);
      expect(list.filter((t) => t.isDefault)).toHaveLength(0);
    });

    it('scopes the findMany read to the org', async () => {
      await service.listWithDefaults(context);
      expect(tx.candidateSmsTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
      );
    });

    it('never includes a subject field on any view (SMS is body-only)', async () => {
      tx.pipeline.findFirst.mockResolvedValue({ stages: defaultPipelineStages });
      tx.candidateSmsTemplate.findMany.mockResolvedValue([
        { id: 's1', name: 'Custom offer', triggerStageId: 'st-offer', triggerMode: 'prompt', body: 'B', enabled: true },
      ]);
      const list = await service.listWithDefaults(context);
      for (const view of list) {
        expect(view).not.toHaveProperty('subject');
      }
    });
  });

  describe('resolveForStage', () => {
    it('opens its own forTenant read (does not require a caller-supplied tx)', async () => {
      await service.resolveForStage(context, 'st-offer');
      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
    });

    it('returns the saved enabled row whose triggerStageId matches over the code default', async () => {
      tx.candidateSmsTemplate.findFirst.mockResolvedValue({ id: 's1', body: 'B', triggerMode: 'auto', enabled: true });

      const r = await service.resolveForStage(context, 'st-offer');

      expect(r).toMatchObject({ id: 's1', body: 'B', triggerMode: 'auto' });
      expect(tx.candidateSmsTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', triggerStageId: 'st-offer', enabled: true }) }),
      );
    });

    it('falls back to the code default (matched by the stage\'s name) when no saved row', async () => {
      tx.candidateSmsTemplate.findFirst.mockResolvedValue(null);
      tx.pipelineStage.findFirst.mockResolvedValue({ name: 'offer' });

      const r = await service.resolveForStage(context, 'st-offer');

      expect(tx.pipelineStage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'st-offer', organizationId: 'org-1' }) }),
      );
      expect(r).toMatchObject({ id: null, triggerMode: 'prompt' }); // offer default is prompt
    });

    it('returns null for a stage with no default and no saved row', async () => {
      tx.candidateSmsTemplate.findFirst.mockResolvedValue(null);
      tx.pipelineStage.findFirst.mockResolvedValue({ name: 'screened' });

      expect(await service.resolveForStage(context, 'st-screened')).toBeNull();
    });

    it('returns null when the stage itself cannot be resolved', async () => {
      tx.candidateSmsTemplate.findFirst.mockResolvedValue(null);
      tx.pipelineStage.findFirst.mockResolvedValue(null);

      expect(await service.resolveForStage(context, 'bogus')).toBeNull();
    });
  });

  describe('upsert', () => {
    it('creates a new row when no id is given, org-scoped, and audits candidate_sms_template.saved', async () => {
      tx.candidateSmsTemplate.create.mockResolvedValue({ id: 'new-1', name: 'Offer', triggerStageId: 'st-offer', triggerMode: 'prompt', body: 'B', enabled: true });

      const dto = { name: 'Offer', triggerStageId: 'st-offer', triggerMode: 'prompt', body: 'B' } as any;
      const out = await service.upsert(context, 'user-1', dto);

      expect(tx.candidateSmsTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ organizationId: 'org-1', name: 'Offer', triggerStageId: 'st-offer', triggerMode: 'prompt', body: 'B' }),
      });
      expect(out).toMatchObject({ id: 'new-1' });
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ actorUserId: 'user-1', action: 'candidate_sms_template.saved', entityId: 'new-1' }),
      );
    });

    it('updates an existing row when id is given and found in the org', async () => {
      tx.candidateSmsTemplate.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1' });
      tx.candidateSmsTemplate.update.mockResolvedValue({ id: 's1', name: 'Offer v2' });

      const dto = { id: 's1', name: 'Offer v2', triggerStageId: 'st-offer', triggerMode: 'prompt', body: 'B' } as any;
      await service.upsert(context, 'user-1', dto);

      expect(tx.candidateSmsTemplate.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({ name: 'Offer v2' }),
      });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'candidate_sms_template.saved', entityId: 's1' }));
    });

    it('throws NotFoundException when updating an id not in the org', async () => {
      tx.candidateSmsTemplate.findFirst.mockResolvedValue(null);
      const dto = { id: 'missing', name: 'X', triggerStageId: 'st-offer', triggerMode: 'prompt', body: 'B' } as any;
      await expect(service.upsert(context, 'user-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('does not re-enable a disabled template on a content-only edit (enabled omitted from dto)', async () => {
      tx.candidateSmsTemplate.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1', enabled: false });
      tx.candidateSmsTemplate.update.mockResolvedValue({ id: 's1', enabled: false });

      const dto = { id: 's1', name: 'Offer v2', triggerStageId: 'st-offer', triggerMode: 'prompt', body: 'B2' } as any;
      await service.upsert(context, 'user-1', dto);

      const call = tx.candidateSmsTemplate.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 's1' });
      // must not have flipped enabled to true -- either omitted or explicitly preserved false
      if (Object.prototype.hasOwnProperty.call(call.data, 'enabled')) {
        expect(call.data.enabled).toBe(false);
      }
    });

    it('upserts by triggerStageId: a second create-call (no id) for the same non-null triggerStageId updates the first row instead of creating a duplicate', async () => {
      tx.candidateSmsTemplate.findFirst.mockResolvedValueOnce({ id: 'existing-1', organizationId: 'org-1', triggerStageId: 'st-offer', enabled: true });
      tx.candidateSmsTemplate.update.mockResolvedValue({ id: 'existing-1' });

      const dto = { name: 'Offer', triggerStageId: 'st-offer', triggerMode: 'prompt', body: 'B' } as any;
      await service.upsert(context, 'user-1', dto);

      expect(tx.candidateSmsTemplate.create).not.toHaveBeenCalled();
      expect(tx.candidateSmsTemplate.update).toHaveBeenCalledWith({
        where: { id: 'existing-1' },
        data: expect.objectContaining({ triggerStageId: 'st-offer', name: 'Offer' }),
      });
    });

    it('does not dedupe manual-only templates (triggerStageId: null): two create-calls both create', async () => {
      tx.candidateSmsTemplate.create
        .mockResolvedValueOnce({ id: 'm1', triggerStageId: null })
        .mockResolvedValueOnce({ id: 'm2', triggerStageId: null });

      const dto = { name: 'Manual A', triggerStageId: null, triggerMode: 'manual', body: 'B' } as any;
      await service.upsert(context, 'user-1', dto);
      await service.upsert(context, 'user-1', { ...dto, name: 'Manual B' });

      expect(tx.candidateSmsTemplate.findFirst).not.toHaveBeenCalled();
      expect(tx.candidateSmsTemplate.create).toHaveBeenCalledTimes(2);
      expect(tx.candidateSmsTemplate.update).not.toHaveBeenCalled();
    });
  });
});
