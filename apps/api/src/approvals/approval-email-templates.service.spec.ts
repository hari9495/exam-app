import { BadRequestException } from '@nestjs/common';
import { ApprovalEmailTemplatesService } from './approval-email-templates.service';

describe('ApprovalEmailTemplatesService', () => {
  let service: ApprovalEmailTemplatesService;
  let tenantPrisma: { forTenant: jest.Mock };
  let tx: { approvalEmailTemplate: { findMany: jest.Mock; upsert: jest.Mock } };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      approvalEmailTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({
          id: 'tmpl-1',
          organizationId: 'org-1',
          eventType: 'approval.requested',
          subject: 'Please review',
          body: 'A request needs your approval.',
          enabled: true,
        }),
      },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    audit = { record: jest.fn() };
    service = new ApprovalEmailTemplatesService(tenantPrisma as any, audit as any);
  });

  describe('list', () => {
    it('returns all four event slots as unset placeholders when nothing is saved', async () => {
      const result = await service.list(context);

      expect(result).toEqual([
        { eventType: 'approval.requested', subject: null, body: null, enabled: true },
        { eventType: 'approval.approved', subject: null, body: null, enabled: true },
        { eventType: 'approval.rejected', subject: null, body: null, enabled: true },
        { eventType: 'approval.cancelled', subject: null, body: null, enabled: true },
      ]);
    });

    it('fills in the saved row for a configured slot and leaves the rest unset', async () => {
      tx.approvalEmailTemplate.findMany.mockResolvedValue([
        { eventType: 'approval.approved', subject: 'Approved!', body: 'Your request was approved.', enabled: false },
      ]);

      const result = await service.list(context);

      expect(result.find((s) => s.eventType === 'approval.approved')).toEqual({
        eventType: 'approval.approved',
        subject: 'Approved!',
        body: 'Your request was approved.',
        enabled: false,
      });
      expect(result.find((s) => s.eventType === 'approval.requested')).toEqual({
        eventType: 'approval.requested',
        subject: null,
        body: null,
        enabled: true,
      });
    });
  });

  describe('upsert', () => {
    it('rejects an unknown event type without touching the database', async () => {
      await expect(
        service.upsert(context, 'user-1', 'not_a_real_event', { subject: 'S', body: 'B' }),
      ).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('upserts by (organizationId, eventType) with the dto fields', async () => {
      await service.upsert(context, 'user-1', 'approval.requested', { subject: 'Please review', body: 'A request needs your approval.', enabled: true });

      expect(tx.approvalEmailTemplate.upsert).toHaveBeenCalledWith({
        where: { organizationId_eventType: { organizationId: 'org-1', eventType: 'approval.requested' } },
        update: { subject: 'Please review', body: 'A request needs your approval.', enabled: true },
        create: {
          organizationId: 'org-1',
          eventType: 'approval.requested',
          subject: 'Please review',
          body: 'A request needs your approval.',
          enabled: true,
        },
      });
    });

    it('defaults enabled to true on create and leaves the existing enabled flag untouched on update when omitted', async () => {
      await service.upsert(context, 'user-1', 'approval.requested', { subject: 'S', body: 'B' });

      expect(tx.approvalEmailTemplate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { subject: 'S', body: 'B' },
          create: expect.objectContaining({ enabled: true }),
        }),
      );
    });

    it('audits approval_email_template.saved with the eventType', async () => {
      const row = await service.upsert(context, 'user-1', 'approval.requested', { subject: 'S', body: 'B' });

      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1',
        action: 'approval_email_template.saved',
        entityType: 'approval_email_template',
        entityId: row.id,
        metadata: { eventType: 'approval.requested' },
      });
    });
  });
});
