import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CandidateWhatsappService } from './candidate-whatsapp.service';
import { recomputeGlobalStage } from '../candidates/recompute-global-stage';

jest.mock('../candidates/recompute-global-stage', () => ({
  recomputeGlobalStage: jest.fn(),
}));

describe('CandidateWhatsappService', () => {
  let service: CandidateWhatsappService;
  let tenantPrisma: { forTenant: jest.Mock };
  let whatsapp: { send: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: {
    pipelineEntry: Record<string, jest.Mock>;
    organization: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
    candidateWhatsapp: Record<string, jest.Mock>;
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      pipelineEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'entry-1',
          candidateId: 'c1',
          candidate: { name: 'Asha', phone: '+15551234567', erasedAt: null, whatsappOptedOutAt: null },
          job: { title: 'BE' },
        }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Acme' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Rita' }),
      },
      candidateWhatsapp: {
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'msg-1', ...data })),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    whatsapp = { send: jest.fn() };
    audit = { record: jest.fn() };
    service = new CandidateWhatsappService(whatsapp as any, tenantPrisma as any, audit as any);
    jest.clearAllMocks();
    tenantPrisma.forTenant.mockImplementation((_c: any, fn: any) => fn(tx));
  });

  describe('sendWhatsapp', () => {
    it('renders the body, sends outside the tx, and logs a sent row', async () => {
      whatsapp.send.mockResolvedValue({ success: true });

      await service.sendWhatsapp(context, 'user-1', 'entry-1', {
        templateId: null,
        body: 'Hi {{candidateName}}, re {{jobTitle}} at {{orgName}} from {{recruiterName}}',
        source: 'manual',
      });

      expect(tx.pipelineEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'entry-1', organizationId: 'org-1' }) }),
      );
      expect(whatsapp.send).toHaveBeenCalledWith({
        to: '+15551234567',
        body: 'Hi Asha, re BE at Acme from Rita',
        organizationId: 'org-1',
      });
      expect(tx.candidateWhatsapp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            candidateId: 'c1',
            pipelineEntryId: 'entry-1',
            toPhone: '+15551234567',
            status: 'sent',
            source: 'manual',
            sentByUserId: 'user-1',
            errorDetail: null,
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ action: 'candidate_whatsapp.sent', actorUserId: 'user-1' }),
      );
      expect(recomputeGlobalStage).not.toHaveBeenCalled();

      // Phase structure: two short transactions, with the send happening between them.
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(2);
      const sendOrder = whatsapp.send.mock.invocationCallOrder[0];
      const [firstTxOrder, secondTxOrder] = tenantPrisma.forTenant.mock.invocationCallOrder;
      const createOrder = tx.candidateWhatsapp.create.mock.invocationCallOrder[0];
      expect(firstTxOrder).toBeLessThan(sendOrder);
      expect(sendOrder).toBeLessThan(secondTxOrder);
      expect(sendOrder).toBeLessThan(createOrder);
    });

    it('logs a failed row (not throw) when send fails', async () => {
      whatsapp.send.mockResolvedValue({ success: false });

      const msg = await service.sendWhatsapp(context, 'user-1', 'entry-1', {
        templateId: null,
        body: 'b',
        source: 'manual',
      });

      expect(tx.candidateWhatsapp.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'failed', errorDetail: 'delivery failed' }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ action: 'candidate_whatsapp.failed' }),
      );
      expect(msg).toBeDefined();
    });

    it('throws NotFoundException when the pipeline entry is missing', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.sendWhatsapp(context, 'user-1', 'entry-x', { templateId: null, body: 'b', source: 'manual' }),
      ).rejects.toThrow(NotFoundException);
      expect(whatsapp.send).not.toHaveBeenCalled();
    });

    it('refuses to send to an erased candidate', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue({
        id: 'entry-1',
        candidateId: 'c1',
        candidate: { name: 'X', phone: '+1555', erasedAt: new Date(), whatsappOptedOutAt: null },
        job: { title: 'BE' },
      });

      await expect(
        service.sendWhatsapp(context, 'user-1', 'entry-1', { templateId: null, body: 'b', source: 'manual' }),
      ).rejects.toThrow(BadRequestException);
      expect(whatsapp.send).not.toHaveBeenCalled();
    });

    it.each([null, '', '   '])('rejects a manual send when the candidate has no phone (%p)', async (phone) => {
      tx.pipelineEntry.findFirst.mockResolvedValue({
        id: 'entry-1',
        candidateId: 'c1',
        candidate: { name: 'X', phone, erasedAt: null, whatsappOptedOutAt: null },
        job: { title: 'BE' },
      });

      await expect(
        service.sendWhatsapp(context, 'user-1', 'entry-1', { templateId: null, body: 'b', source: 'manual' }),
      ).rejects.toThrow(BadRequestException);
      expect(whatsapp.send).not.toHaveBeenCalled();
      expect(tx.candidateWhatsapp.create).not.toHaveBeenCalled();
    });

    it.each(['stage_prompt', 'stage_auto'] as const)(
      'skips (no throw, no send, no row) a %s send when the candidate has no phone',
      async (source) => {
        tx.pipelineEntry.findFirst.mockResolvedValue({
          id: 'entry-1',
          candidateId: 'c1',
          candidate: { name: 'X', phone: null, erasedAt: null, whatsappOptedOutAt: null },
          job: { title: 'BE' },
        });

        const result = await service.sendWhatsapp(context, null, 'entry-1', { templateId: null, body: 'b', source });

        expect(result).toBeNull();
        expect(whatsapp.send).not.toHaveBeenCalled();
        expect(tx.candidateWhatsapp.create).not.toHaveBeenCalled();
      },
    );

    it('throws ConflictException for an opted-out candidate on a manual send, with no send and no row', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue({
        id: 'entry-1',
        candidateId: 'c1',
        candidate: { name: 'Asha', phone: '+1555', erasedAt: null, whatsappOptedOutAt: new Date() },
        job: { title: 'BE' },
      });

      await expect(
        service.sendWhatsapp(context, 'user-1', 'entry-1', { templateId: null, body: 'b', source: 'manual' }),
      ).rejects.toThrow(ConflictException);
      expect(whatsapp.send).not.toHaveBeenCalled();
      expect(tx.candidateWhatsapp.create).not.toHaveBeenCalled();
    });

    it.each(['stage_prompt', 'stage_auto'] as const)(
      'skips (no throw, no send, no row) a %s send to an opted-out candidate',
      async (source) => {
        tx.pipelineEntry.findFirst.mockResolvedValue({
          id: 'entry-1',
          candidateId: 'c1',
          candidate: { name: 'Asha', phone: '+1555', erasedAt: null, whatsappOptedOutAt: new Date() },
          job: { title: 'BE' },
        });

        const result = await service.sendWhatsapp(context, null, 'entry-1', { templateId: null, body: 'b', source });

        expect(result).toBeNull();
        expect(whatsapp.send).not.toHaveBeenCalled();
        expect(tx.candidateWhatsapp.create).not.toHaveBeenCalled();
      },
    );
  });

  describe('listMessages', () => {
    it('lists org-scoped messages for a candidate, newest first', async () => {
      await service.listMessages(context, 'c1');

      expect(tx.candidateWhatsapp.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', candidateId: 'c1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('resend', () => {
    it('re-sends the stored snapshot with source manual', async () => {
      tx.candidateWhatsapp.findFirst.mockResolvedValue({
        id: 'msg-1',
        pipelineEntryId: 'entry-1',
        templateId: null,
        renderedBody: 'Old body',
      });
      whatsapp.send.mockResolvedValue({ success: true });

      await service.resend(context, 'user-1', 'msg-1');

      expect(tx.candidateWhatsapp.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'msg-1', organizationId: 'org-1' }) }),
      );
      expect(whatsapp.send).toHaveBeenCalledWith(expect.objectContaining({ body: 'Old body' }));
      expect(tx.candidateWhatsapp.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ source: 'manual' }) }),
      );
    });

    it('throws NotFoundException when the message does not exist', async () => {
      tx.candidateWhatsapp.findFirst.mockResolvedValue(null);

      await expect(service.resend(context, 'user-1', 'msg-x')).rejects.toThrow(NotFoundException);
    });

    it('rejects with BadRequest when the message has no linked pipeline entry', async () => {
      tx.candidateWhatsapp.findFirst.mockResolvedValue({
        id: 'msg-2',
        pipelineEntryId: null,
        templateId: null,
        renderedBody: 'Old body',
      });

      await expect(service.resend(context, 'user-1', 'msg-2')).rejects.toThrow(BadRequestException);
      expect(whatsapp.send).not.toHaveBeenCalled();
    });

    it('blocks a resend to an opted-out candidate with the same ConflictException as a manual send', async () => {
      tx.candidateWhatsapp.findFirst.mockResolvedValue({
        id: 'msg-1',
        pipelineEntryId: 'entry-1',
        templateId: null,
        renderedBody: 'Old body',
      });
      tx.pipelineEntry.findFirst.mockResolvedValue({
        id: 'entry-1',
        candidateId: 'c1',
        candidate: { name: 'Asha', phone: '+1555', erasedAt: null, whatsappOptedOutAt: new Date() },
        job: { title: 'BE' },
      });

      await expect(service.resend(context, 'user-1', 'msg-1')).rejects.toThrow(ConflictException);
      expect(whatsapp.send).not.toHaveBeenCalled();
      expect(tx.candidateWhatsapp.create).not.toHaveBeenCalled();
    });
  });
});
