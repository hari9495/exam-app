import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CandidateEmailsService } from './candidate-emails.service';

describe('CandidateEmailsService', () => {
  let service: CandidateEmailsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let email: { send: jest.Mock };
  let blobStorage: { signIfOurs: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: {
    pipelineEntry: Record<string, jest.Mock>;
    organization: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
    candidateEmail: Record<string, jest.Mock>;
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      pipelineEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'entry-1',
          candidateId: 'c1',
          applicationToken: 'tok-1',
          candidate: { name: 'Asha', email: 'asha@x.com', erasedAt: null },
          job: { title: 'BE' },
        }),
        update: jest.fn(),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Acme', logoPath: null }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Rita' }),
      },
      candidateEmail: {
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'msg-1', ...data })),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    email = { send: jest.fn() };
    blobStorage = { signIfOurs: jest.fn().mockResolvedValue(null) };
    audit = { record: jest.fn() };
    service = new CandidateEmailsService(tenantPrisma as any, email as any, blobStorage as any, audit as any);
  });

  describe('sendMessage', () => {
    it('renders raw tokens, sends, and logs a sent row', async () => {
      email.send.mockResolvedValue({ success: true });

      await service.sendMessage(context, 'user-1', 'entry-1', {
        templateId: null,
        subject: 'Hi {{candidateName}}',
        body: 'See {{statusLink}}',
        source: 'manual',
      });

      expect(tx.pipelineEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'entry-1', organizationId: 'org-1' }) }),
      );
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'asha@x.com', subject: 'Hi Asha', organizationId: 'org-1' }),
      );
      expect(tx.candidateEmail.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'sent', source: 'manual', toEmail: 'asha@x.com' }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ action: 'candidate_email.sent', actorUserId: 'user-1' }),
      );
      // Phase structure: forTenant opens two short transactions (prep, then log-write),
      // with the SMTP send happening between them, outside of either.
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(2);
      const sendOrder = email.send.mock.invocationCallOrder[0];
      const [firstTxOrder, secondTxOrder] = tenantPrisma.forTenant.mock.invocationCallOrder;
      const createOrder = tx.candidateEmail.create.mock.invocationCallOrder[0];
      expect(firstTxOrder).toBeLessThan(sendOrder);
      expect(sendOrder).toBeLessThan(secondTxOrder);
      expect(sendOrder).toBeLessThan(createOrder);
    });

    it('mints applicationToken when body references statusLink and entry has none', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue({
        id: 'entry-1',
        candidateId: 'c1',
        applicationToken: null,
        candidate: { name: 'Asha', email: 'asha@x.com', erasedAt: null },
        job: { title: 'BE' },
      });
      email.send.mockResolvedValue({ success: true });

      await service.sendMessage(context, 'user-1', 'entry-1', { subject: 's', body: '{{statusLink}}', source: 'manual' });

      expect(tx.pipelineEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ applicationToken: expect.any(String) }) }),
      );
    });

    it('does not mint applicationToken when statusLink is not referenced', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue({
        id: 'entry-1',
        candidateId: 'c1',
        applicationToken: null,
        candidate: { name: 'Asha', email: 'asha@x.com', erasedAt: null },
        job: { title: 'BE' },
      });
      email.send.mockResolvedValue({ success: true });

      await service.sendMessage(context, 'user-1', 'entry-1', { subject: 's', body: 'plain body', source: 'manual' });

      expect(tx.pipelineEntry.update).not.toHaveBeenCalled();
    });

    it('logs a failed row (not throw) when send fails', async () => {
      email.send.mockResolvedValue({ success: false });

      const msg = await service.sendMessage(context, 'user-1', 'entry-1', { subject: 's', body: 'b', source: 'manual' });

      expect(tx.candidateEmail.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ action: 'candidate_email.failed' }),
      );
      expect(msg).toBeDefined();
    });

    it('refuses to send to an erased candidate', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue({
        id: 'entry-1',
        candidateId: 'c1',
        applicationToken: 't',
        candidate: { name: 'X', email: 'e', erasedAt: new Date() },
        job: { title: 'BE' },
      });

      await expect(
        service.sendMessage(context, 'user-1', 'entry-1', { subject: 's', body: 'b', source: 'manual' }),
      ).rejects.toThrow(BadRequestException);
      expect(email.send).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the pipeline entry is missing', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage(context, 'user-1', 'entry-x', { subject: 's', body: 'b', source: 'manual' }),
      ).rejects.toThrow(NotFoundException);
      expect(email.send).not.toHaveBeenCalled();
    });

    it('signs the org logo and passes actorUserId through to sentByUserId', async () => {
      tx.organization.findUnique.mockResolvedValue({ name: 'Acme', logoPath: 'logos/acme.png' });
      blobStorage.signIfOurs.mockResolvedValue('https://signed/logo.png');
      email.send.mockResolvedValue({ success: true });

      await service.sendMessage(context, 'user-1', 'entry-1', { subject: 's', body: 'b', source: 'manual' });

      expect(blobStorage.signIfOurs).toHaveBeenCalledWith('logos/acme.png', expect.any(Number));
      expect(tx.candidateEmail.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sentByUserId: 'user-1' }) }),
      );
    });
  });

  describe('listMessages', () => {
    it('lists org-scoped messages for a candidate, newest first', async () => {
      await service.listMessages(context, 'c1');

      expect(tx.candidateEmail.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', candidateId: 'c1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('resend', () => {
    it('re-sends the stored snapshot with source manual', async () => {
      tx.candidateEmail.findFirst.mockResolvedValue({
        id: 'msg-1',
        pipelineEntryId: 'entry-1',
        templateId: null,
        subject: 'Old subject',
        renderedBody: 'Old body',
      });
      email.send.mockResolvedValue({ success: true });

      await service.resend(context, 'user-1', 'msg-1');

      expect(tx.candidateEmail.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'msg-1', organizationId: 'org-1' }) }),
      );
      expect(tx.pipelineEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'entry-1', organizationId: 'org-1' }) }),
      );
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Old subject' }));
      expect(tx.candidateEmail.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ source: 'manual', subject: 'Old subject' }) }),
      );
    });

    it('throws NotFoundException when the message does not exist', async () => {
      tx.candidateEmail.findFirst.mockResolvedValue(null);

      await expect(service.resend(context, 'user-1', 'msg-x')).rejects.toThrow(NotFoundException);
    });

    it('rejects with BadRequest when the message has no linked pipeline entry', async () => {
      tx.candidateEmail.findFirst.mockResolvedValue({
        id: 'msg-2',
        pipelineEntryId: null,
        templateId: null,
        subject: 'Old subject',
        renderedBody: 'Old body',
      });

      await expect(service.resend(context, 'user-1', 'msg-2')).rejects.toThrow(BadRequestException);
      expect(email.send).not.toHaveBeenCalled();
    });
  });
});
