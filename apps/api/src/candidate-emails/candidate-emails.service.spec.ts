import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
    candidate: Record<string, jest.Mock>;
    orgSenderAddress: Record<string, jest.Mock>;
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      pipelineEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'entry-1',
          candidateId: 'c1',
          applicationToken: 'tok-1',
          candidate: { name: 'Asha', email: 'asha@x.com', erasedAt: null, emailOptedOutAt: null, unsubscribeToken: 'existing-token' },
          job: { title: 'BE' },
        }),
        update: jest.fn(),
        // recomputeGlobalStage reads a candidate's live entries; default to none so an
        // entry-less, now-contacted candidate resolves to in_review.
        findMany: jest.fn().mockResolvedValue([]),
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
        // recomputeGlobalStage counts sent emails after sendMessage's own create -- default to 1
        // so the "no entries + contacted" -> in_review path is exercised by default.
        count: jest.fn().mockResolvedValue(1),
      },
      candidate: {
        update: jest.fn().mockResolvedValue({}),
      },
      orgSenderAddress: {
        findFirst: jest.fn(),
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

    it('appends the actor signature to the sent body and stored renderedBody', async () => {
      tx.user.findUnique.mockResolvedValue({ name: 'Rita', emailSignature: 'Rita Recruiter\nAcme Inc' });
      email.send.mockResolvedValue({ success: true });

      const msg = (await service.sendMessage(context, 'user-1', 'entry-1', {
        subject: 's',
        body: 'Hello there',
        source: 'manual',
      }))!;

      expect(msg.renderedBody).toBe('Hello there\n\n--\nRita Recruiter\nAcme Inc');
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining('Rita Recruiter<br />Acme Inc') }),
      );
    });

    it('leaves the body unchanged when the actor has no signature (null or empty)', async () => {
      tx.user.findUnique.mockResolvedValue({ name: 'Rita', emailSignature: null });
      email.send.mockResolvedValue({ success: true });

      const msg = (await service.sendMessage(context, 'user-1', 'entry-1', {
        subject: 's',
        body: 'Hello there',
        source: 'manual',
      }))!;

      expect(msg.renderedBody).toBe('Hello there');

      tx.user.findUnique.mockResolvedValue({ name: 'Rita', emailSignature: '   ' });
      const msg2 = (await service.sendMessage(context, 'user-1', 'entry-1', {
        subject: 's',
        body: 'Hello there',
        source: 'manual',
      }))!;
      expect(msg2.renderedBody).toBe('Hello there');
    });

    it('does not append a signature for system sends (actorUserId null)', async () => {
      email.send.mockResolvedValue({ success: true });

      const msg = (await service.sendMessage(context, null, 'entry-1', {
        subject: 's',
        body: 'Hello there',
        source: 'stage_auto',
      }))!;

      expect(msg.renderedBody).toBe('Hello there');
      expect(tx.user.findUnique).not.toHaveBeenCalled();
    });

    it('stores the signature raw (unescaped) in renderedBody but escapes it in the sent html', async () => {
      tx.user.findUnique.mockResolvedValue({ name: 'Rita', emailSignature: 'Rita & Co <rita@acme.com>' });
      email.send.mockResolvedValue({ success: true });

      const msg = (await service.sendMessage(context, 'user-1', 'entry-1', {
        subject: 's',
        body: 'Hello there',
        source: 'manual',
      }))!;

      expect(msg.renderedBody).toBe('Hello there\n\n--\nRita & Co <rita@acme.com>');
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining('Rita &amp; Co &lt;rita@acme.com&gt;') }),
      );
    });

    it('recomputes the candidate global stage after logging the email, moving an entry-less new candidate to in_review', async () => {
      email.send.mockResolvedValue({ success: true });

      await service.sendMessage(context, 'user-1', 'entry-1', { subject: 's', body: 'b', source: 'manual' });

      expect(tx.pipelineEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ candidateId: 'c1', organizationId: 'org-1' }) }),
      );
      expect(tx.candidateEmail.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ candidateId: 'c1', organizationId: 'org-1' }) }),
      );
      expect(tx.candidate.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { globalStage: 'in_review' },
      });
      // Must run after the email row is recorded -- recompute counts candidateEmail rows.
      const createOrder = tx.candidateEmail.create.mock.invocationCallOrder[0];
      const countOrder = tx.candidateEmail.count.mock.invocationCallOrder[0];
      expect(createOrder).toBeLessThan(countOrder);
    });

    it('sends with fromAddress when senderAddressId resolves to one of the org\'s own sender addresses', async () => {
      tx.orgSenderAddress.findFirst.mockResolvedValue({ id: 'sender-1', organizationId: 'org-1', address: 'jobs@acme.com' });
      email.send.mockResolvedValue({ success: true });

      await service.sendMessage(context, 'user-1', 'entry-1', {
        subject: 's',
        body: 'b',
        source: 'manual',
        senderAddressId: 'sender-1',
      });

      expect(tx.orgSenderAddress.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sender-1', organizationId: 'org-1' } }),
      );
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ fromAddress: 'jobs@acme.com' }));
    });

    it('rejects when senderAddressId does not belong to the org, and does not send', async () => {
      tx.orgSenderAddress.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage(context, 'user-1', 'entry-1', {
          subject: 's',
          body: 'b',
          source: 'manual',
          senderAddressId: 'not-mine',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(email.send).not.toHaveBeenCalled();
    });

    it('sends without fromAddress when senderAddressId is absent (unchanged behavior)', async () => {
      email.send.mockResolvedValue({ success: true });

      await service.sendMessage(context, 'user-1', 'entry-1', { subject: 's', body: 'b', source: 'manual' });

      expect(tx.orgSenderAddress.findFirst).not.toHaveBeenCalled();
      expect(email.send).toHaveBeenCalledWith(expect.not.objectContaining({ fromAddress: expect.anything() }));
    });

    it('throws ConflictException for an opted-out candidate on a manual send, with no send and no row', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue({
        id: 'entry-1',
        candidateId: 'c1',
        applicationToken: 'tok-1',
        candidate: { name: 'Asha', email: 'asha@x.com', erasedAt: null, emailOptedOutAt: new Date(), unsubscribeToken: 'existing-token' },
        job: { title: 'BE' },
      });

      await expect(
        service.sendMessage(context, 'user-1', 'entry-1', { subject: 's', body: 'b', source: 'manual' }),
      ).rejects.toThrow(ConflictException);
      expect(email.send).not.toHaveBeenCalled();
      expect(tx.candidateEmail.create).not.toHaveBeenCalled();
    });

    it.each(['stage_prompt', 'stage_auto'] as const)(
      'skips (no throw, no send, no row) a %s send to an opted-out candidate, and logs it',
      async (source) => {
        tx.pipelineEntry.findFirst.mockResolvedValue({
          id: 'entry-1',
          candidateId: 'c1',
          applicationToken: 'tok-1',
          candidate: { name: 'Asha', email: 'asha@x.com', erasedAt: null, emailOptedOutAt: new Date(), unsubscribeToken: 'existing-token' },
          job: { title: 'BE' },
        });
        const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

        const result = await service.sendMessage(context, null, 'entry-1', { subject: 's', body: 'b', source });

        expect(result).toBeNull();
        expect(email.send).not.toHaveBeenCalled();
        expect(tx.candidateEmail.create).not.toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('opted-out candidate c1'));
      },
    );

    it('mints an unsubscribeToken when the candidate has none, and the sent html footer links to it', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue({
        id: 'entry-1',
        candidateId: 'c1',
        applicationToken: 'tok-1',
        candidate: { name: 'Asha', email: 'asha@x.com', erasedAt: null, emailOptedOutAt: null, unsubscribeToken: null },
        job: { title: 'BE' },
      });
      email.send.mockResolvedValue({ success: true });

      await service.sendMessage(context, 'user-1', 'entry-1', { subject: 's', body: 'b', source: 'manual' });

      expect(tx.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c1' }, data: { unsubscribeToken: expect.any(String) } }),
      );
      const mintedToken = tx.candidate.update.mock.calls.find((c: any) => 'unsubscribeToken' in c[0].data)?.[0].data
        .unsubscribeToken;
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining(`/unsubscribe/${mintedToken}`) }),
      );
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ html: expect.stringContaining('unsubscribe</a>') }));
    });

    it('reuses an existing unsubscribeToken instead of minting a new one', async () => {
      // default beforeEach candidate already has unsubscribeToken: 'existing-token'
      email.send.mockResolvedValue({ success: true });

      await service.sendMessage(context, 'user-1', 'entry-1', { subject: 's', body: 'b', source: 'manual' });

      expect(tx.candidate.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ unsubscribeToken: expect.any(String) }) }),
      );
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining('/unsubscribe/existing-token') }),
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

    it('does not double-append the signature when resending an already-signed message', async () => {
      tx.candidateEmail.findFirst.mockResolvedValue({
        id: 'msg-1',
        pipelineEntryId: 'entry-1',
        templateId: null,
        subject: 'Old subject',
        renderedBody: 'Old body\n\n--\nRita Recruiter\nAcme Inc',
      });
      tx.user.findUnique.mockResolvedValue({ name: 'Rita', emailSignature: 'Rita Recruiter\nAcme Inc' });
      email.send.mockResolvedValue({ success: true });

      const msg = (await service.resend(context, 'user-1', 'msg-1'))!;

      const signatureOccurrences = (msg.renderedBody.match(/--\nRita Recruiter\nAcme Inc/g) ?? []).length;
      expect(signatureOccurrences).toBe(1);
      expect(msg.renderedBody).toBe('Old body\n\n--\nRita Recruiter\nAcme Inc');
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

    it('blocks a resend to an opted-out candidate with the same ConflictException as a manual send', async () => {
      tx.candidateEmail.findFirst.mockResolvedValue({
        id: 'msg-1',
        pipelineEntryId: 'entry-1',
        templateId: null,
        subject: 'Old subject',
        renderedBody: 'Old body',
      });
      tx.pipelineEntry.findFirst.mockResolvedValue({
        id: 'entry-1',
        candidateId: 'c1',
        applicationToken: 'tok-1',
        candidate: { name: 'Asha', email: 'asha@x.com', erasedAt: null, emailOptedOutAt: new Date(), unsubscribeToken: 'existing-token' },
        job: { title: 'BE' },
      });

      await expect(service.resend(context, 'user-1', 'msg-1')).rejects.toThrow(ConflictException);
      expect(email.send).not.toHaveBeenCalled();
      expect(tx.candidateEmail.create).not.toHaveBeenCalled();
    });
  });
});
