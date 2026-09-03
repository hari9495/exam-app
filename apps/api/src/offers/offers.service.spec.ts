import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OffersService } from './offers.service';

describe('OffersService', () => {
  let service: OffersService;
  let tenantPrisma: { forTenant: jest.Mock };
  let offerTemplates: { getWithDefault: jest.Mock };
  let email: { send: jest.Mock };
  let blobStorage: { upload: jest.Mock; signIfOurs: jest.Mock };
  let audit: { record: jest.Mock };
  let integrationEvents: { emit: jest.Mock };
  let approvals: { getChains: jest.Mock; submit: jest.Mock; isConfigurer: jest.Mock; cancelForSubject: jest.Mock };
  let tx: {
    pipelineEntry: Record<string, jest.Mock>;
    offer: Record<string, jest.Mock>;
    organization: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      pipelineEntry: {
        findFirst: jest.fn().mockResolvedValue({ id: 'entry-1', candidateId: 'cand-1', organizationId: 'org-1' }),
        findUnique: jest.fn().mockResolvedValue({
          candidateId: 'cand-1',
          job: { title: 'Backend Engineer' },
          candidate: { name: 'Asha' },
        }),
      },
      offer: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'offer-1', status: 'draft', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Acme', logoPath: null }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Rita', email: 'rita@acme.test' }),
      },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    offerTemplates = {
      getWithDefault: jest.fn().mockResolvedValue({ id: null, subject: 'Default subject', body: 'Default body' }),
    };
    email = { send: jest.fn() };
    blobStorage = {
      upload: jest.fn().mockResolvedValue('https://blob.test/container/offers/org-1/tok-1.pdf'),
      signIfOurs: jest.fn().mockResolvedValue(null),
    };
    audit = { record: jest.fn() };
    integrationEvents = { emit: jest.fn() };
    approvals = {
      getChains: jest.fn().mockResolvedValue({ requisition: { gate: 'requisition', enabled: false, steps: [] }, offer: { gate: 'offer', enabled: false, steps: [] } }),
      submit: jest.fn(),
      isConfigurer: jest.fn(),
      cancelForSubject: jest.fn(),
    };
    service = new OffersService(
      tenantPrisma as any,
      offerTemplates as any,
      email as any,
      blobStorage as any,
      audit as any,
      integrationEvents as any,
      approvals as any,
    );
  });

  describe('createOffer', () => {
    const dto = { compensation: '100k', startDate: '2026-09-01', expiresAt: '2026-09-15' };

    it('persists a draft offer with the terms and org-scoped candidate/entry, and audits offer.created', async () => {
      tx.offer.create.mockResolvedValue({ id: 'offer-1', status: 'draft', ...dto });

      const out = await service.createOffer(context, 'user-1', 'entry-1', dto as any);

      expect(tx.pipelineEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'entry-1', organizationId: 'org-1' }) }),
      );
      expect(tx.offer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          pipelineEntryId: 'entry-1',
          candidateId: 'cand-1',
          compensation: '100k',
          status: 'draft',
          startDate: new Date('2026-09-01'),
          expiresAt: new Date('2026-09-15'),
        }),
      });
      expect(out).toMatchObject({ id: 'offer-1' });
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ actorUserId: 'user-1', action: 'offer.created', entityId: 'offer-1' }),
      );
    });

    it('resolves letterSubject/letterBody from the org template when dto omits subject/body', async () => {
      tx.offer.create.mockResolvedValue({ id: 'offer-1' });

      await service.createOffer(context, 'user-1', 'entry-1', dto as any);

      expect(offerTemplates.getWithDefault).toHaveBeenCalledWith(context);
      expect(tx.offer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ letterSubject: 'Default subject', letterBody: 'Default body' }),
      });
    });

    it('uses dto subject/body when provided, skipping the template lookup', async () => {
      tx.offer.create.mockResolvedValue({ id: 'offer-1' });

      await service.createOffer(context, 'user-1', 'entry-1', { ...dto, subject: 'Custom subject', body: 'Custom body' } as any);

      expect(offerTemplates.getWithDefault).not.toHaveBeenCalled();
      expect(tx.offer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ letterSubject: 'Custom subject', letterBody: 'Custom body' }),
      });
    });

    it('throws NotFoundException when the entry is not in the org', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue(null);

      await expect(service.createOffer(context, 'user-1', 'entry-x', dto as any)).rejects.toThrow(NotFoundException);
      expect(tx.offer.create).not.toHaveBeenCalled();
    });
  });

  describe('previewPdf', () => {
    it('loads the org-scoped offer and returns a Buffer', async () => {
      tx.offer.findFirst.mockResolvedValue({
        id: 'offer-1',
        organizationId: 'org-1',
        compensation: '100k',
        startDate: new Date('2026-09-01'),
        expiresAt: new Date('2026-09-15'),
        letterSubject: 'Subj {{candidateName}}',
        letterBody: 'Body {{candidateName}} {{jobTitle}} {{orgName}}',
        pipelineEntry: { candidate: { name: 'Asha' }, job: { title: 'Backend Engineer' } },
      });

      const buffer = await service.previewPdf(context, 'offer-1');

      expect(tx.offer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'offer-1', organizationId: 'org-1' }) }),
      );
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('throws NotFoundException when the offer is not in the org', async () => {
      tx.offer.findFirst.mockResolvedValue(null);

      await expect(service.previewPdf(context, 'offer-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listForEntry', () => {
    it('lists org-scoped offers for a pipeline entry, newest first', async () => {
      await service.listForEntry(context, 'entry-1');

      expect(tx.offer.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', pipelineEntryId: 'entry-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('listForCandidate', () => {
    it('lists org-scoped offers for a candidate, newest first', async () => {
      await service.listForCandidate(context, 'cand-1');

      expect(tx.offer.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', candidateId: 'cand-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('sendOffer', () => {
    function baseOffer(overrides: Record<string, unknown> = {}) {
      return {
        id: 'offer-1',
        organizationId: 'org-1',
        status: 'draft',
        compensation: '100k',
        letterSubject: 'Subj {{candidateName}}',
        letterBody: 'Body {{candidateName}} {{jobTitle}} {{orgName}} {{offerLink}}',
        startDate: new Date('2026-09-01'),
        expiresAt: new Date('2026-09-15'),
        pipelineEntry: {
          candidate: { id: 'cand-1', name: 'Asha', email: 'asha@x.com', erasedAt: null },
          job: { title: 'Backend Engineer' },
        },
        ...overrides,
      };
    }

    it('runs a short tx to mint the offerToken, then sends OUTSIDE any tx, then a short tx to mark sent + audit offer.sent (with the PDF attached)', async () => {
      tx.offer.findFirst.mockResolvedValue(baseOffer());
      email.send.mockResolvedValue({ success: true });

      const out = await service.sendOffer(context, 'user-1', 'offer-1');

      expect(tx.offer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'offer-1', organizationId: 'org-1' }) }),
      );

      // Phase 1: offerToken minted inside the first short tx.
      const mintedToken = tx.offer.update.mock.calls[0][0].data.offerToken;
      expect(mintedToken).toEqual(expect.any(String));

      // Phase 2 (outside any tx): blob upload + SMTP send, with the PDF attached and the
      // offer link embedded in the email body.
      expect(blobStorage.upload).toHaveBeenCalledWith(
        `offers/org-1/${mintedToken}.pdf`,
        expect.any(Buffer),
        'application/pdf',
      );
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'asha@x.com',
          organizationId: 'org-1',
          html: expect.stringContaining(`/offer/${mintedToken}`),
          attachments: [{ filename: 'offer-letter.pdf', content: expect.any(Buffer) }],
        }),
      );

      // Phase 3: second short tx marks the offer sent and audits offer.sent.
      expect(tx.offer.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'offer-1' },
        data: {
          status: 'sent',
          pdfPath: 'https://blob.test/container/offers/org-1/tok-1.pdf',
          sentAt: expect.any(Date),
          sentByUserId: 'user-1',
        },
      });
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ actorUserId: 'user-1', action: 'offer.sent', entityId: 'offer-1', metadata: { to: 'asha@x.com' } }),
      );
      expect(out).toMatchObject({ status: 'sent', pdfPath: 'https://blob.test/container/offers/org-1/tok-1.pdf' });

      // Ordering: the two forTenant calls bracket the send/upload -- neither runs inside a
      // forTenant callback (the network call must stay outside the 5s interactive-tx timeout).
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(2);
      const [firstTxOrder, secondTxOrder] = tenantPrisma.forTenant.mock.invocationCallOrder;
      const uploadOrder = blobStorage.upload.mock.invocationCallOrder[0];
      const sendOrder = email.send.mock.invocationCallOrder[0];
      expect(firstTxOrder).toBeLessThan(uploadOrder);
      expect(firstTxOrder).toBeLessThan(sendOrder);
      expect(uploadOrder).toBeLessThan(secondTxOrder);
      expect(sendOrder).toBeLessThan(secondTxOrder);
    });

    it('on a delivery failure, leaves the offer in draft (no status flip) and audits offer.send_failed', async () => {
      tx.offer.findFirst.mockResolvedValue(baseOffer());
      email.send.mockResolvedValue({ success: false });

      const out = await service.sendOffer(context, 'user-1', 'offer-1');

      // Only the offerToken mint update happened -- no second update flipping status to sent.
      expect(tx.offer.update).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ actorUserId: 'user-1', action: 'offer.send_failed', entityId: 'offer-1' }),
      );
      expect(out.status).toBe('draft');
    });

    it('throws BadRequestException and sends nothing when the candidate has been erased', async () => {
      tx.offer.findFirst.mockResolvedValue(
        baseOffer({ pipelineEntry: { candidate: { id: 'cand-1', name: 'Asha', email: 'asha@x.com', erasedAt: new Date() }, job: { title: 'BE' } } }),
      );

      await expect(service.sendOffer(context, 'user-1', 'offer-1')).rejects.toThrow(BadRequestException);
      expect(tx.offer.update).not.toHaveBeenCalled();
      expect(blobStorage.upload).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('throws BadRequestException and sends nothing when the offer is not in draft status', async () => {
      tx.offer.findFirst.mockResolvedValue(baseOffer({ status: 'sent' }));

      await expect(service.sendOffer(context, 'user-1', 'offer-1')).rejects.toThrow(BadRequestException);
      expect(tx.offer.update).not.toHaveBeenCalled();
      expect(blobStorage.upload).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an offer outside the org', async () => {
      tx.offer.findFirst.mockResolvedValue(null);

      await expect(service.sendOffer(context, 'user-1', 'offer-x')).rejects.toThrow(NotFoundException);
    });

    it('works from draft when the offer gate is off (existing behavior preserved)', async () => {
      approvals.getChains.mockResolvedValue({ requisition: { enabled: false, steps: [] }, offer: { enabled: false, steps: [] } });
      tx.offer.findFirst.mockResolvedValue(baseOffer({ status: 'draft' }));
      email.send.mockResolvedValue({ success: true });

      const out = await service.sendOffer(context, 'user-1', 'offer-1');

      expect(out.status).toBe('sent');
    });

    it('refuses unless status is approved when the offer gate is on', async () => {
      approvals.getChains.mockResolvedValue({ requisition: { enabled: false, steps: [] }, offer: { enabled: true, steps: [] } });
      tx.offer.findFirst.mockResolvedValue(baseOffer({ status: 'draft' }));

      await expect(service.sendOffer(context, 'user-1', 'offer-1')).rejects.toThrow(ConflictException);
      expect(tx.offer.update).not.toHaveBeenCalled();
      expect(blobStorage.upload).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('sends an approved offer when the gate is on', async () => {
      approvals.getChains.mockResolvedValue({ requisition: { enabled: false, steps: [] }, offer: { enabled: true, steps: [] } });
      tx.offer.findFirst.mockResolvedValue(baseOffer({ status: 'approved' }));
      email.send.mockResolvedValue({ success: true });

      const out = await service.sendOffer(context, 'user-1', 'offer-1');

      expect(out.status).toBe('sent');
    });
  });

  describe('markApproved / markDraft', () => {
    it('markApproved updates the org-scoped offer status to approved', async () => {
      await service.markApproved(context, 'offer-1');
      expect(tx.offer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', organizationId: 'org-1' },
        data: { status: 'approved' },
      });
    });

    it('markDraft updates the org-scoped offer status to draft', async () => {
      await service.markDraft(context, 'offer-1');
      expect(tx.offer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', organizationId: 'org-1' },
        data: { status: 'draft' },
      });
    });
  });

  describe('submitOffer', () => {
    it('submits a draft offer and sets pending_approval when submit returns pending', async () => {
      tx.offer.findFirst.mockResolvedValue({ id: 'offer-1', organizationId: 'org-1', status: 'draft' });
      approvals.submit.mockResolvedValue({ status: 'pending_approval', requestId: 'req-1' });

      const result = await service.submitOffer(context, 'user-1', 'offer-1');

      expect(approvals.submit).toHaveBeenCalledWith(context, 'offer', 'offer-1', 'user-1');
      expect(tx.offer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', organizationId: 'org-1' },
        data: { status: 'pending_approval' },
      });
      expect(result).toEqual({ status: 'pending_approval', requestId: 'req-1' });
    });

    it('sets status approved immediately when submit auto-passes', async () => {
      tx.offer.findFirst.mockResolvedValue({ id: 'offer-1', organizationId: 'org-1', status: 'draft' });
      approvals.submit.mockResolvedValue({ status: 'approved' });

      const result = await service.submitOffer(context, 'user-1', 'offer-1');

      expect(tx.offer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', organizationId: 'org-1' },
        data: { status: 'approved' },
      });
      expect(result).toEqual({ status: 'approved' });
    });

    it('throws NotFoundException for an offer outside the org', async () => {
      tx.offer.findFirst.mockResolvedValue(null);

      await expect(service.submitOffer(context, 'user-1', 'offer-x')).rejects.toThrow(NotFoundException);
      expect(approvals.submit).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the offer is not in draft', async () => {
      tx.offer.findFirst.mockResolvedValue({ id: 'offer-1', organizationId: 'org-1', status: 'pending_approval' });

      await expect(service.submitOffer(context, 'user-1', 'offer-1')).rejects.toThrow(ConflictException);
      expect(approvals.submit).not.toHaveBeenCalled();
    });
  });

  describe('cancelOfferApproval', () => {
    it('checks isConfigurer, cancels the open request for the offer subject, then resets to draft', async () => {
      approvals.isConfigurer.mockResolvedValue(true);

      await service.cancelOfferApproval(context, 'user-1', 'offer-1');

      expect(approvals.isConfigurer).toHaveBeenCalledWith(context, 'user-1');
      expect(approvals.cancelForSubject).toHaveBeenCalledWith(context, 'offer', 'offer-1', 'user-1', true);
      expect(tx.offer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', organizationId: 'org-1' },
        data: { status: 'draft' },
      });
    });
  });

  describe('withdraw', () => {
    it('withdraws a sent offer and audits offer.withdrawn', async () => {
      tx.offer.findFirst.mockResolvedValue({ id: 'offer-1', organizationId: 'org-1', status: 'sent' });
      tx.offer.update.mockResolvedValue({ id: 'offer-1', status: 'withdrawn' });

      const out = await service.withdraw(context, 'user-1', 'offer-1');

      expect(tx.offer.update).toHaveBeenCalledWith({ where: { id: 'offer-1' }, data: { status: 'withdrawn' } });
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ actorUserId: 'user-1', action: 'offer.withdrawn', entityId: 'offer-1' }),
      );
      expect(out).toEqual({ id: 'offer-1', status: 'withdrawn' });
    });

    it('throws BadRequestException when the offer is not sent', async () => {
      tx.offer.findFirst.mockResolvedValue({ id: 'offer-1', organizationId: 'org-1', status: 'draft' });

      await expect(service.withdraw(context, 'user-1', 'offer-1')).rejects.toThrow(BadRequestException);
      expect(tx.offer.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an offer outside the org', async () => {
      tx.offer.findFirst.mockResolvedValue(null);

      await expect(service.withdraw(context, 'user-1', 'offer-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPublicOffer', () => {
    function baseOffer(overrides: Record<string, unknown> = {}) {
      return {
        id: 'offer-1',
        organizationId: 'org-1',
        pipelineEntryId: 'entry-1',
        compensation: '100k',
        startDate: new Date('2026-09-01'),
        expiresAt: new Date('2026-09-15'),
        status: 'sent',
        pdfPath: 'offers/org-1/tok-1.pdf',
        sentByUserId: 'user-1',
        ...overrides,
      };
    }

    it('resolves by offerToken and returns terms + a signed pdf URL', async () => {
      tx.offer.findUnique.mockResolvedValue(baseOffer());
      blobStorage.signIfOurs.mockResolvedValue('https://blob.test/signed.pdf');

      const out = await service.getPublicOffer('offer-token-1');

      expect(tx.offer.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { offerToken: 'offer-token-1' } }),
      );
      expect(blobStorage.signIfOurs).toHaveBeenCalledWith('offers/org-1/tok-1.pdf', expect.any(Number));
      expect(out).toMatchObject({
        jobTitle: 'Backend Engineer',
        orgName: 'Acme',
        compensation: '100k',
        status: 'sent',
        pdfUrl: 'https://blob.test/signed.pdf',
      });
    });

    it('returns a null pdfUrl when the offer has no pdfPath', async () => {
      tx.offer.findUnique.mockResolvedValue(baseOffer({ pdfPath: null }));

      const out = await service.getPublicOffer('offer-token-1');

      expect(blobStorage.signIfOurs).not.toHaveBeenCalled();
      expect(out.pdfUrl).toBeNull();
    });

    it('throws a generic NotFoundException for an unknown token', async () => {
      tx.offer.findUnique.mockResolvedValue(null);

      await expect(service.getPublicOffer('bad-token')).rejects.toThrow(NotFoundException);
    });
  });

  describe('respondPublic', () => {
    function baseOffer(overrides: Record<string, unknown> = {}) {
      return {
        id: 'offer-1',
        organizationId: 'org-1',
        pipelineEntryId: 'entry-1',
        compensation: '100k',
        startDate: new Date('2026-09-01'),
        expiresAt: new Date('2027-01-01'),
        status: 'sent',
        pdfPath: 'offers/org-1/tok-1.pdf',
        sentByUserId: 'user-1',
        ...overrides,
      };
    }

    it('accepts a sent, unexpired offer: sets status + respondedAt, audits offer.accepted with a null actor, and notifies the recruiter OUTSIDE the tx', async () => {
      tx.offer.findUnique.mockResolvedValue(baseOffer());
      tx.offer.updateMany.mockResolvedValue({ count: 1 });

      const out = await service.respondPublic('offer-token-1', 'accept');

      expect(tx.offer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', organizationId: 'org-1', status: 'sent' },
        data: { status: 'accepted', respondedAt: expect.any(Date) },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
        expect.objectContaining({ actorUserId: null, action: 'offer.accepted', entityType: 'offer', entityId: 'offer-1' }),
      );
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'rita@acme.test',
          organizationId: 'org-1',
          html: expect.stringContaining('accepted'),
        }),
      );
      expect(out).toMatchObject({ id: 'offer-1', status: 'accepted' });
      expect(integrationEvents.emit).toHaveBeenCalledWith(
        'org-1',
        'offer.accepted',
        expect.objectContaining({ subject: 'Asha', roleTitle: 'Backend Engineer', linkPath: '/candidates/cand-1' }),
      );

      // Ordering: the update tx runs, then the recruiter is notified -- and the send call
      // itself never happens inside a forTenant callback.
      const [updateTxOrder] = tenantPrisma.forTenant.mock.invocationCallOrder;
      const sendOrder = email.send.mock.invocationCallOrder[0];
      expect(updateTxOrder).toBeLessThan(sendOrder);
      // Every forTenant call in this flow resolves before email.send fires, i.e. send is not
      // itself part of any forTenant callback's synchronous execution.
      for (const callOrder of tenantPrisma.forTenant.mock.invocationCallOrder) {
        expect(callOrder).toBeLessThan(sendOrder);
      }
    });

    it('escapes an HTML-injecting candidate name in the recruiter-notify email', async () => {
      tx.offer.findUnique.mockResolvedValue(baseOffer());
      tx.offer.updateMany.mockResolvedValue({ count: 1 });
      tx.pipelineEntry.findUnique.mockResolvedValue({
        job: { title: 'Backend Engineer' },
        candidate: { name: '<img src=x onerror=alert(1)><script>alert(1)</script>' },
      });

      await service.respondPublic('offer-token-1', 'accept');

      const html = email.send.mock.calls[0][0].html as string;
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;img');
    });

    it('declines a sent, unexpired offer symmetrically', async () => {
      tx.offer.findUnique.mockResolvedValue(baseOffer());
      tx.offer.updateMany.mockResolvedValue({ count: 1 });

      const out = await service.respondPublic('offer-token-1', 'decline');

      expect(tx.offer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', organizationId: 'org-1', status: 'sent' },
        data: { status: 'declined', respondedAt: expect.any(Date) },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
        expect.objectContaining({ actorUserId: null, action: 'offer.declined', entityId: 'offer-1' }),
      );
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ html: expect.stringContaining('declined') }));
      expect(out).toMatchObject({ status: 'declined' });
    });

    it('skips the recruiter email when the offer has no sentByUserId, but still emits offer.accepted', async () => {
      tx.offer.findUnique.mockResolvedValue(baseOffer({ sentByUserId: null }));
      tx.offer.updateMany.mockResolvedValue({ count: 1 });

      await service.respondPublic('offer-token-1', 'accept');

      expect(email.send).not.toHaveBeenCalled();
      expect(integrationEvents.emit).toHaveBeenCalledWith('org-1', 'offer.accepted', expect.objectContaining({ subject: 'Asha' }));
    });

    it('does not emit offer.accepted on decline', async () => {
      tx.offer.findUnique.mockResolvedValue(baseOffer());
      tx.offer.updateMany.mockResolvedValue({ count: 1 });

      await service.respondPublic('offer-token-1', 'decline');

      expect(integrationEvents.emit).not.toHaveBeenCalled();
    });

    it('throws a generic ConflictException and makes no changes when the offer has expired', async () => {
      tx.offer.findUnique.mockResolvedValue(baseOffer({ expiresAt: new Date('2020-01-01') }));

      await expect(service.respondPublic('offer-token-1', 'accept')).rejects.toThrow(ConflictException);
      expect(tx.offer.updateMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('throws a generic ConflictException and makes no changes when the offer already has a response', async () => {
      tx.offer.findUnique.mockResolvedValue(baseOffer({ status: 'accepted' }));

      await expect(service.respondPublic('offer-token-1', 'decline')).rejects.toThrow(ConflictException);
      expect(tx.offer.updateMany).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('throws a generic ConflictException for a draft (never-sent) offer', async () => {
      tx.offer.findUnique.mockResolvedValue(baseOffer({ status: 'draft' }));

      await expect(service.respondPublic('offer-token-1', 'accept')).rejects.toThrow(ConflictException);
      expect(tx.offer.updateMany).not.toHaveBeenCalled();
    });

    it('throws a generic NotFoundException for an unknown token', async () => {
      tx.offer.findUnique.mockResolvedValue(null);

      await expect(service.respondPublic('bad-token', 'accept')).rejects.toThrow(NotFoundException);
    });

    it('loses the race to a concurrent responder: updateMany count:0 throws ConflictException with no audit row and no recruiter email', async () => {
      tx.offer.findUnique.mockResolvedValue(baseOffer());
      tx.offer.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.respondPublic('offer-token-1', 'accept')).rejects.toThrow(ConflictException);
      expect(tx.offer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', organizationId: 'org-1', status: 'sent' },
        data: { status: 'accepted', respondedAt: expect.any(Date) },
      });
      expect(audit.record).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });
  });
});
