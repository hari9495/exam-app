import { NotFoundException } from '@nestjs/common';
import { CandidateEmailTemplatesService } from './candidate-email-templates.service';

describe('CandidateEmailTemplatesService', () => {
  let service: CandidateEmailTemplatesService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: { candidateEmailTemplate: Record<string, jest.Mock> };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      candidateEmailTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    audit = { record: jest.fn() };
    service = new CandidateEmailTemplatesService(tenantPrisma as any, audit as any);
  });

  describe('listWithDefaults', () => {
    it('merges saved rows over code defaults: saved wins, uncovered events fall back to the code default', async () => {
      tx.candidateEmailTemplate.findMany.mockResolvedValue([
        { id: 's1', name: 'Custom interview', triggerEvent: 'interview', triggerMode: 'prompt', subject: 'S', body: 'B', enabled: true },
      ]);

      const list = await service.listWithDefaults(context);

      const interview = list.find((t) => t.triggerEvent === 'interview');
      expect(interview).toMatchObject({ id: 's1', subject: 'S', isDefault: false });

      const offer = list.find((t) => t.triggerEvent === 'offer');
      expect(offer).toMatchObject({ id: null, isDefault: true });

      const applied = list.find((t) => t.triggerEvent === 'applied');
      expect(applied).toMatchObject({ id: null, isDefault: true });

      const rejected = list.find((t) => t.triggerEvent === 'rejected');
      expect(rejected).toMatchObject({ id: null, isDefault: true });

      // interview appears exactly once (saved row only, default suppressed)
      expect(list.filter((t) => t.triggerEvent === 'interview')).toHaveLength(1);
    });

    it('shows a saved DISABLED row for an event instead of the code default, and does not also emit the default', async () => {
      tx.candidateEmailTemplate.findMany.mockResolvedValue([
        { id: 's1', name: 'Custom offer', triggerEvent: 'offer', triggerMode: 'prompt', subject: 'S', body: 'B', enabled: false },
      ]);

      const list = await service.listWithDefaults(context);
      const offerRows = list.filter((t) => t.triggerEvent === 'offer');

      expect(offerRows).toHaveLength(1);
      expect(offerRows[0]).toMatchObject({ id: 's1', enabled: false, isDefault: false });
    });

    it('scopes the findMany read to the org', async () => {
      await service.listWithDefaults(context);
      expect(tx.candidateEmailTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
      );
    });
  });

  describe('resolveForEvent', () => {
    it('opens its own forTenant read (does not require a caller-supplied tx)', async () => {
      await service.resolveForEvent(context, 'offer');
      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
    });

    it('returns the saved enabled row over the code default', async () => {
      tx.candidateEmailTemplate.findFirst.mockResolvedValue({ id: 's1', subject: 'S', body: 'B', triggerMode: 'auto', enabled: true });

      const r = await service.resolveForEvent(context, 'offer');

      expect(r).toMatchObject({ id: 's1', subject: 'S', body: 'B', triggerMode: 'auto' });
      expect(tx.candidateEmailTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', triggerEvent: 'offer', enabled: true }) }),
      );
    });

    it('falls back to the code default when no saved row', async () => {
      tx.candidateEmailTemplate.findFirst.mockResolvedValue(null);

      const r = await service.resolveForEvent(context, 'offer');

      expect(r).toMatchObject({ id: null, triggerMode: 'prompt' }); // offer default is prompt
    });

    it('returns null for an event with no default and no saved row', async () => {
      tx.candidateEmailTemplate.findFirst.mockResolvedValue(null);

      expect(await service.resolveForEvent(context, 'screened')).toBeNull();
    });
  });

  describe('upsert', () => {
    it('creates a new row when no id is given, org-scoped, and audits candidate_email_template.saved', async () => {
      tx.candidateEmailTemplate.create.mockResolvedValue({ id: 'new-1', name: 'Offer', triggerEvent: 'offer', triggerMode: 'prompt', subject: 'S', body: 'B', enabled: true });

      const dto = { name: 'Offer', triggerEvent: 'offer', triggerMode: 'prompt', subject: 'S', body: 'B' } as any;
      const out = await service.upsert(context, 'user-1', dto);

      expect(tx.candidateEmailTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ organizationId: 'org-1', name: 'Offer', triggerEvent: 'offer', triggerMode: 'prompt', subject: 'S', body: 'B' }),
      });
      expect(out).toMatchObject({ id: 'new-1' });
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ actorUserId: 'user-1', action: 'candidate_email_template.saved', entityId: 'new-1' }),
      );
    });

    it('updates an existing row when id is given and found in the org', async () => {
      tx.candidateEmailTemplate.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1' });
      tx.candidateEmailTemplate.update.mockResolvedValue({ id: 's1', name: 'Offer v2' });

      const dto = { id: 's1', name: 'Offer v2', triggerEvent: 'offer', triggerMode: 'prompt', subject: 'S', body: 'B' } as any;
      await service.upsert(context, 'user-1', dto);

      expect(tx.candidateEmailTemplate.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({ name: 'Offer v2' }),
      });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'candidate_email_template.saved', entityId: 's1' }));
    });

    it('throws NotFoundException when updating an id not in the org', async () => {
      tx.candidateEmailTemplate.findFirst.mockResolvedValue(null);
      const dto = { id: 'missing', name: 'X', triggerEvent: 'offer', triggerMode: 'prompt', subject: 'S', body: 'B' } as any;
      await expect(service.upsert(context, 'user-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('does not re-enable a disabled template on a content-only edit (enabled omitted from dto)', async () => {
      tx.candidateEmailTemplate.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1', enabled: false });
      tx.candidateEmailTemplate.update.mockResolvedValue({ id: 's1', enabled: false });

      const dto = { id: 's1', name: 'Offer v2', triggerEvent: 'offer', triggerMode: 'prompt', subject: 'S2', body: 'B2' } as any;
      await service.upsert(context, 'user-1', dto);

      const call = tx.candidateEmailTemplate.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 's1' });
      // must not have flipped enabled to true -- either omitted or explicitly preserved false
      if (Object.prototype.hasOwnProperty.call(call.data, 'enabled')) {
        expect(call.data.enabled).toBe(false);
      }
    });

    it('upserts by triggerEvent: a second create-call (no id) for the same non-null triggerEvent updates the first row instead of creating a duplicate', async () => {
      tx.candidateEmailTemplate.findFirst.mockResolvedValueOnce({ id: 'existing-1', organizationId: 'org-1', triggerEvent: 'offer', enabled: true });
      tx.candidateEmailTemplate.update.mockResolvedValue({ id: 'existing-1' });

      const dto = { name: 'Offer', triggerEvent: 'offer', triggerMode: 'prompt', subject: 'S', body: 'B' } as any;
      await service.upsert(context, 'user-1', dto);

      expect(tx.candidateEmailTemplate.create).not.toHaveBeenCalled();
      expect(tx.candidateEmailTemplate.update).toHaveBeenCalledWith({
        where: { id: 'existing-1' },
        data: expect.objectContaining({ triggerEvent: 'offer', name: 'Offer' }),
      });
    });

    it('does not dedupe manual-only templates (triggerEvent: null): two create-calls both create', async () => {
      tx.candidateEmailTemplate.create
        .mockResolvedValueOnce({ id: 'm1', triggerEvent: null })
        .mockResolvedValueOnce({ id: 'm2', triggerEvent: null });

      const dto = { name: 'Manual A', triggerEvent: null, triggerMode: 'manual', subject: 'S', body: 'B' } as any;
      await service.upsert(context, 'user-1', dto);
      await service.upsert(context, 'user-1', { ...dto, name: 'Manual B' });

      expect(tx.candidateEmailTemplate.findFirst).not.toHaveBeenCalled();
      expect(tx.candidateEmailTemplate.create).toHaveBeenCalledTimes(2);
      expect(tx.candidateEmailTemplate.update).not.toHaveBeenCalled();
    });
  });

  describe('setEnabled', () => {
    it('enables a row and audits candidate_email_template.enabled', async () => {
      tx.candidateEmailTemplate.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1' });
      tx.candidateEmailTemplate.update.mockResolvedValue({ id: 's1', enabled: true });

      await service.setEnabled(context, 'user-1', 's1', true);

      expect(tx.candidateEmailTemplate.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { enabled: true } });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'candidate_email_template.enabled', entityId: 's1' }));
    });

    it('disables a row and audits candidate_email_template.disabled', async () => {
      tx.candidateEmailTemplate.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1' });
      tx.candidateEmailTemplate.update.mockResolvedValue({ id: 's1', enabled: false });

      await service.setEnabled(context, 'user-1', 's1', false);

      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'candidate_email_template.disabled', entityId: 's1' }));
    });

    it('throws NotFoundException when the row is not in the org', async () => {
      tx.candidateEmailTemplate.findFirst.mockResolvedValue(null);
      await expect(service.setEnabled(context, 'user-1', 'missing', true)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes a saved row and audits candidate_email_template.removed', async () => {
      tx.candidateEmailTemplate.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1' });

      const out = await service.remove(context, 'user-1', 's1');

      expect(tx.candidateEmailTemplate.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'candidate_email_template.removed', entityId: 's1' }));
      expect(out).toEqual({ success: true });
    });

    it('throws NotFoundException when the row is not in the org', async () => {
      tx.candidateEmailTemplate.findFirst.mockResolvedValue(null);
      await expect(service.remove(context, 'user-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
