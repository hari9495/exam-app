import { BadRequestException } from '@nestjs/common';
import { InterviewEmailTemplatesService } from './interview-email-templates.service';
import { INTERVIEW_EMAIL_EVENT_TYPES, INTERVIEW_EMAIL_DEFAULTS } from './interview-email-types';

describe('InterviewEmailTemplatesService', () => {
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: { interviewEmailTemplate: { findMany: jest.Mock; upsert: jest.Mock } };
  let service: InterviewEmailTemplatesService;
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = { interviewEmailTemplate: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    audit = { record: jest.fn() };
    service = new InterviewEmailTemplatesService(tenantPrisma as any, audit as any);
  });

  describe('list', () => {
    it('returns a slot for every event type, unset when the org has no row', async () => {
      const slots = await service.list(context);
      expect(slots).toHaveLength(INTERVIEW_EMAIL_EVENT_TYPES.length);
      expect(slots.every((s) => s.subject === null && s.body === null && s.enabled === true)).toBe(true);
    });

    it('merges a saved row over the placeholder', async () => {
      tx.interviewEmailTemplate.findMany.mockResolvedValue([{ eventType: 'invite', subject: 'S', body: 'B', enabled: false }]);
      const slots = await service.list(context);
      const invite = slots.find((s) => s.eventType === 'invite');
      expect(invite).toEqual({ eventType: 'invite', subject: 'S', body: 'B', enabled: false });
    });
  });

  describe('upsert', () => {
    it('rejects an unknown event type before any DB access', async () => {
      await expect(service.upsert(context, 'user-1', 'bogus', { subject: 's', body: 'b' })).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('upserts by (org, eventType) and audits', async () => {
      tx.interviewEmailTemplate.upsert.mockResolvedValue({ id: 'row-1' });
      await service.upsert(context, 'user-1', 'invite', { subject: 'S', body: 'B', enabled: true });
      expect(tx.interviewEmailTemplate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId_eventType: { organizationId: 'org-1', eventType: 'invite' } } }),
      );
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'interview_email_template.saved', metadata: { eventType: 'invite' } }));
    });
  });

  describe('resolveMap (fallback)', () => {
    it('uses the built-in default for a missing row and a disabled row, and the org copy for an enabled row', async () => {
      tx.interviewEmailTemplate.findMany.mockResolvedValue([
        { eventType: 'invite', subject: 'Custom invite', body: 'Custom body', enabled: true },
        { eventType: 'cancellation', subject: 'X', body: 'Y', enabled: false }, // disabled → default
      ]);
      const map = await service.resolveMap(context);
      expect(map.invite).toEqual({ subject: 'Custom invite', body: 'Custom body' });
      expect(map.cancellation).toEqual(INTERVIEW_EMAIL_DEFAULTS.cancellation); // disabled falls back
      expect(map.confirmation_candidate).toEqual(INTERVIEW_EMAIL_DEFAULTS.confirmation_candidate); // missing falls back
    });
  });
});
