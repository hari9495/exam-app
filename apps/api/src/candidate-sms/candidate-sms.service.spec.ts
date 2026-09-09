import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CandidateSmsService } from './candidate-sms.service';

describe('CandidateSmsService', () => {
  let service: CandidateSmsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let sms: { send: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: {
    pipelineEntry: Record<string, jest.Mock>;
    organization: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
    candidateSms: Record<string, jest.Mock>;
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      pipelineEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'entry-1',
          candidateId: 'c1',
          candidate: { name: 'Asha', phone: '+15551234567', erasedAt: null, smsOptedOutAt: null },
          job: { title: 'BE' },
        }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Acme' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Rita' }),
      },
      candidateSms: {
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'sms-1', ...data })),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    sms = { send: jest.fn() };
    audit = { record: jest.fn() };
    service = new CandidateSmsService(tenantPrisma as any, sms as any, audit as any);
  });

  describe('sendSms', () => {
    it('renders the body, sends, and logs a sent row', async () => {
      sms.send.mockResolvedValue({ success: true });

      const msg = await service.sendSms(context, 'user-1', 'entry-1', {
        templateId: null,
        body: 'Hi {{candidateName}}, re {{jobTitle}} at {{orgName}} from {{recruiterName}}',
        source: 'manual',
      });

      expect(tx.pipelineEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'entry-1', organizationId: 'org-1' }) }),
      );
      expect(sms.send).toHaveBeenCalledWith({
        to: '+15551234567',
        body: 'Hi Asha, re BE at Acme from Rita',
        organizationId: 'org-1',
      });
      expect(tx.candidateSms.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'sent',
            source: 'manual',
            toPhone: '+15551234567',
            sentByUserId: 'user-1',
            renderedBody: 'Hi Asha, re BE at Acme from Rita',
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ action: 'candidate_sms.sent', actorUserId: 'user-1' }),
      );
      expect(msg?.id).toBe('sms-1');

      // Phase structure: two short transactions, with SmsService.send happening between them.
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(2);
      const sendOrder = sms.send.mock.invocationCallOrder[0];
      const [firstTxOrder, secondTxOrder] = tenantPrisma.forTenant.mock.invocationCallOrder;
      const createOrder = tx.candidateSms.create.mock.invocationCallOrder[0];
      expect(firstTxOrder).toBeLessThan(sendOrder);
      expect(sendOrder).toBeLessThan(secondTxOrder);
      expect(sendOrder).toBeLessThan(createOrder);
    });

    it('logs a failed row (not throw) when send fails', async () => {
      sms.send.mockResolvedValue({ success: false });

      const msg = await service.sendSms(context, 'user-1', 'entry-1', { templateId: null, body: 'b', source: 'manual' });

      expect(tx.candidateSms.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'failed', errorDetail: 'delivery failed' }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ action: 'candidate_sms.failed' }),
      );
      expect(msg).toBeDefined();
    });

    it('throws NotFoundException when the pipeline entry is missing', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.sendSms(context, 'user-1', 'entry-x', { templateId: null, body: 'b', source: 'manual' }),
      ).rejects.toThrow(NotFoundException);
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('refuses to send to an erased candidate', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue({
        id: 'entry-1',
        candidateId: 'c1',
        candidate: { name: 'X', phone: '+1', erasedAt: new Date(), smsOptedOutAt: null },
        job: { title: 'BE' },
      });

      await expect(
        service.sendSms(context, 'user-1', 'entry-1', { templateId: null, body: 'b', source: 'manual' }),
      ).rejects.toThrow(BadRequestException);
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('rejects a manual send with BadRequestException when the candidate has no phone', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue({
        id: 'entry-1',
        candidateId: 'c1',
        candidate: { name: 'X', phone: null, erasedAt: null, smsOptedOutAt: null },
        job: { title: 'BE' },
      });

      await expect(
        service.sendSms(context, 'user-1', 'entry-1', { templateId: null, body: 'b', source: 'manual' }),
      ).rejects.toThrow(BadRequestException);
      expect(sms.send).not.toHaveBeenCalled();
    });

    it.each(['stage_prompt', 'stage_auto'] as const)(
      'skips (no throw, no send, no row) a %s send when the candidate has no phone, and logs it',
      async (source) => {
        tx.pipelineEntry.findFirst.mockResolvedValue({
          id: 'entry-1',
          candidateId: 'c1',
          candidate: { name: 'X', phone: '   ', erasedAt: null, smsOptedOutAt: null },
          job: { title: 'BE' },
        });
        const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

        const result = await service.sendSms(context, null, 'entry-1', { templateId: null, body: 'b', source });

        expect(result).toBeNull();
        expect(sms.send).not.toHaveBeenCalled();
        expect(tx.candidateSms.create).not.toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalled();
      },
    );

    it('throws ConflictException for an opted-out candidate on a manual send, with no send and no row', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue({
        id: 'entry-1',
        candidateId: 'c1',
        candidate: { name: 'Asha', phone: '+15551234567', erasedAt: null, smsOptedOutAt: new Date() },
        job: { title: 'BE' },
      });

      await expect(
        service.sendSms(context, 'user-1', 'entry-1', { templateId: null, body: 'b', source: 'manual' }),
      ).rejects.toThrow(ConflictException);
      expect(sms.send).not.toHaveBeenCalled();
      expect(tx.candidateSms.create).not.toHaveBeenCalled();
    });

    it.each(['stage_prompt', 'stage_auto'] as const)(
      'skips (no throw, no send, no row) a %s send to an opted-out candidate, and logs it',
      async (source) => {
        tx.pipelineEntry.findFirst.mockResolvedValue({
          id: 'entry-1',
          candidateId: 'c1',
          candidate: { name: 'Asha', phone: '+15551234567', erasedAt: null, smsOptedOutAt: new Date() },
          job: { title: 'BE' },
        });
        const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

        const result = await service.sendSms(context, null, 'entry-1', { templateId: null, body: 'b', source });

        expect(result).toBeNull();
        expect(sms.send).not.toHaveBeenCalled();
        expect(tx.candidateSms.create).not.toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('opted-out candidate c1'));
      },
    );

    it('does not call recomputeGlobalStage machinery (no candidate.update, only a candidateSms row)', async () => {
      sms.send.mockResolvedValue({ success: true });
      const candidateUpdate = jest.fn();
      (tx as any).candidate = { update: candidateUpdate };

      await service.sendSms(context, 'user-1', 'entry-1', { templateId: null, body: 'b', source: 'manual' });

      expect(candidateUpdate).not.toHaveBeenCalled();
    });
  });

  describe('listMessages', () => {
    it('lists org-scoped messages for a candidate, newest first', async () => {
      await service.listMessages(context, 'c1');

      expect(tx.candidateSms.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', candidateId: 'c1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('resend', () => {
    it('re-sends the stored renderedBody with source manual', async () => {
      tx.candidateSms.findFirst.mockResolvedValue({
        id: 'sms-1',
        pipelineEntryId: 'entry-1',
        templateId: null,
        renderedBody: 'Old body',
      });
      sms.send.mockResolvedValue({ success: true });

      await service.resend(context, 'user-1', 'sms-1');

      expect(tx.candidateSms.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'sms-1', organizationId: 'org-1' }) }),
      );
      expect(sms.send).toHaveBeenCalledWith(expect.objectContaining({ body: 'Old body' }));
      expect(tx.candidateSms.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ source: 'manual', renderedBody: 'Old body' }) }),
      );
    });

    it('throws NotFoundException when the message does not exist', async () => {
      tx.candidateSms.findFirst.mockResolvedValue(null);

      await expect(service.resend(context, 'user-1', 'sms-x')).rejects.toThrow(NotFoundException);
    });

    it('rejects with BadRequest when the message has no linked pipeline entry', async () => {
      tx.candidateSms.findFirst.mockResolvedValue({
        id: 'sms-2',
        pipelineEntryId: null,
        templateId: null,
        renderedBody: 'Old body',
      });

      await expect(service.resend(context, 'user-1', 'sms-2')).rejects.toThrow(BadRequestException);
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('blocks a resend to an opted-out candidate with the same ConflictException as a manual send', async () => {
      tx.candidateSms.findFirst.mockResolvedValue({
        id: 'sms-1',
        pipelineEntryId: 'entry-1',
        templateId: null,
        renderedBody: 'Old body',
      });
      tx.pipelineEntry.findFirst.mockResolvedValue({
        id: 'entry-1',
        candidateId: 'c1',
        candidate: { name: 'Asha', phone: '+15551234567', erasedAt: null, smsOptedOutAt: new Date() },
        job: { title: 'BE' },
      });

      await expect(service.resend(context, 'user-1', 'sms-1')).rejects.toThrow(ConflictException);
      expect(sms.send).not.toHaveBeenCalled();
      expect(tx.candidateSms.create).not.toHaveBeenCalled();
    });
  });
});
