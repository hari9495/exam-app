import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BlobServiceClient, ContainerClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { CandidatesService } from './candidates.service';
import { TenantPrismaService, AuditService, BlobStorageService } from '@exam-platform/shared';

// Only BlobServiceClient.fromConnectionString is faked below (real-BlobStorageService nested
// describe) -- ContainerClient/StorageSharedKeyCredential stay the real SDK classes, same
// pattern as packages/shared/src/storage/blob-storage.service.spec.ts.
jest.mock('@azure/storage-blob', () => {
  const actual = jest.requireActual('@azure/storage-blob');
  return { ...actual, BlobServiceClient: { fromConnectionString: jest.fn() } };
});

describe('CandidatesService', () => {
  let service: CandidatesService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let blobStorage: { deleteByUrl: jest.Mock; isConfigured: jest.Mock; signIfOurs: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    blobStorage = {
      deleteByUrl: jest.fn().mockResolvedValue(undefined),
      isConfigured: jest.fn().mockReturnValue(true),
      // Identity pass-through by default -- signing behaviour itself is covered end to end below
      // and in packages/shared/src/storage/blob-storage.service.spec.ts.
      signIfOurs: jest.fn(async (value) => value),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CandidatesService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: BlobStorageService, useValue: blobStorage },
      ],
    }).compile();
    service = moduleRef.get(CandidatesService);
  });

  it("creates a candidate scoped to the caller's organization", async () => {
    const tx = {
      candidate: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'a@test.com', name: 'Alice' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.create(context, { email: 'a@test.com', name: 'Alice' });

    expect(result.id).toBe('cand-1');
    expect(tx.candidate.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', email: 'a@test.com', name: 'Alice', phone: undefined },
    });
  });

  describe('list invitation counts and status filter', () => {
    it('attaches an invitationCount to each row so the UI knows who is safe to delete', async () => {
      const tx = {
        candidate: {
          findMany: jest.fn().mockResolvedValue([{ id: 'cand-1' }, { id: 'cand-2' }]),
          count: jest.fn().mockResolvedValue(2),
        },
        invitation: { groupBy: jest.fn().mockResolvedValue([{ candidateId: 'cand-1', _count: { _all: 3 } }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.list(context, {});

      expect(result.data).toEqual([
        { id: 'cand-1', invitationCount: 3 },
        { id: 'cand-2', invitationCount: 0 },
      ]);
    });

    it('skips the invitation lookup entirely when the page is empty', async () => {
      const tx = {
        candidate: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
        invitation: { groupBy: jest.fn() },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.list(context, {});

      expect(tx.invitation.groupBy).not.toHaveBeenCalled();
    });

    it('filters by status when one is supplied', async () => {
      const tx = {
        candidate: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
        invitation: { groupBy: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.list(context, { status: 'active' });

      expect(tx.candidate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'active' }) }));
    });

    it('does not constrain status when no filter is supplied', async () => {
      const tx = {
        candidate: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
        invitation: { groupBy: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.list(context, {});

      const where = tx.candidate.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('status');
    });
  });

  describe('update', () => {
    it('updates only the supplied fields and records an audit entry', async () => {
      const tx = {
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'a@test.com', erasedAt: null }),
          update: jest.fn().mockResolvedValue({ id: 'cand-1', name: 'Alice B' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.update(context, 'user-1', 'cand-1', { name: 'Alice B' });

      expect(tx.candidate.update).toHaveBeenCalledWith({ where: { id: 'cand-1' }, data: { name: 'Alice B' } });
      expect(result).toEqual({ id: 'cand-1', name: 'Alice B' });
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1',
        action: 'candidate.updated',
        entityType: 'candidate',
        entityId: 'cand-1',
        metadata: { fields: ['name'] },
      });
    });

    it('deactivates a candidate by writing the inactive status', async () => {
      const tx = {
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'a@test.com', erasedAt: null }),
          update: jest.fn().mockResolvedValue({ id: 'cand-1', status: 'inactive' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.update(context, 'user-1', 'cand-1', { status: 'inactive' });

      expect(tx.candidate.update).toHaveBeenCalledWith({ where: { id: 'cand-1' }, data: { status: 'inactive' } });
    });

    it('normalises a cleared phone to null rather than an empty string', async () => {
      const tx = {
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'a@test.com', erasedAt: null }),
          update: jest.fn().mockResolvedValue({ id: 'cand-1' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.update(context, 'user-1', 'cand-1', { phone: '' });

      expect(tx.candidate.update).toHaveBeenCalledWith({ where: { id: 'cand-1' }, data: { phone: null } });
    });

    it('rejects changing the email to one another candidate in the org already uses', async () => {
      const tx = {
        candidate: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 'cand-1', email: 'a@test.com', erasedAt: null })
            .mockResolvedValueOnce({ id: 'cand-2', email: 'taken@test.com' }),
          update: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'cand-1', { email: 'taken@test.com' })).rejects.toThrow(ConflictException);
      expect(tx.candidate.update).not.toHaveBeenCalled();
    });

    it('allows re-submitting the candidate own unchanged email without a clash lookup', async () => {
      const tx = {
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'a@test.com', erasedAt: null }),
          update: jest.fn().mockResolvedValue({ id: 'cand-1' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.update(context, 'user-1', 'cand-1', { email: 'a@test.com' });

      expect(tx.candidate.findFirst).toHaveBeenCalledTimes(1);
      expect(tx.candidate.update).toHaveBeenCalled();
    });

    it('refuses to edit an erased candidate so the redaction is not undone', async () => {
      const tx = {
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'erased@redacted.invalid', erasedAt: new Date() }),
          update: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'cand-1', { name: 'Alice' })).rejects.toThrow(ConflictException);
      expect(tx.candidate.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a candidate outside the caller organization', async () => {
      const tx = { candidate: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'cand-1', { name: 'Alice' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes a candidate who has never been invited and records an audit entry', async () => {
      const tx = {
        candidate: { findFirst: jest.fn().mockResolvedValue({ id: 'cand-1' }), delete: jest.fn().mockResolvedValue({ id: 'cand-1' }) },
        invitation: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.remove(context, 'user-1', 'cand-1');

      expect(tx.candidate.delete).toHaveBeenCalledWith({ where: { id: 'cand-1' } });
      expect(result).toEqual({ id: 'cand-1' });
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1',
        action: 'candidate.deleted',
        entityType: 'candidate',
        entityId: 'cand-1',
      });
    });

    it('refuses to delete a candidate with invitations so results are never orphaned', async () => {
      const tx = {
        candidate: { findFirst: jest.fn().mockResolvedValue({ id: 'cand-1' }), delete: jest.fn() },
        invitation: { count: jest.fn().mockResolvedValue(2) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.remove(context, 'user-1', 'cand-1')).rejects.toThrow(ConflictException);
      expect(tx.candidate.delete).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a candidate outside the caller organization', async () => {
      const tx = { candidate: { findFirst: jest.fn().mockResolvedValue(null), delete: jest.fn() }, invitation: { count: jest.fn() } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.remove(context, 'user-1', 'cand-1')).rejects.toThrow(NotFoundException);
    });
  });

  it('rejects creating a candidate whose email already exists in the organization', async () => {
    const tx = {
      candidate: { findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'a@test.com' }) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.create(context, { email: 'a@test.com', name: 'Alice' })).rejects.toThrow(ConflictException);
  });

  it("lists candidates scoped to the caller's organization", async () => {
    const tx = {
      candidate: {
        findMany: jest.fn().mockResolvedValue([{ id: 'cand-1' }]),
        count: jest.fn().mockResolvedValue(1),
      },
      invitation: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.list(context, {});

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });

  it('paginates and filters by search on name or email', async () => {
    const tx = {
      candidate: {
        findMany: jest.fn().mockResolvedValue([{ id: 'cand-2', name: 'Alice Smith', email: 'alice@test.com' }]),
        count: jest.fn().mockResolvedValue(1),
      },
      invitation: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.list(context, { page: '1', pageSize: '10', search: 'alice' });

    expect(tx.candidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ name: { contains: 'alice' } }, { email: { contains: 'alice' } }],
        }),
        skip: 0,
        take: 10,
      }),
    );
    expect(result.data).toHaveLength(1);
  });

  it('creates new candidates and updates existing ones from a CSV bulk upload, reporting row errors', async () => {
    const existingCandidate = { id: 'cand-existing', email: 'bob@test.com' };
    const tx = {
      candidate: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(existingCandidate),
        create: jest.fn().mockResolvedValue({ id: 'cand-new' }),
        update: jest.fn().mockResolvedValue({ id: 'cand-existing' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const csv = 'email,name,phone\nbad-email,Bad,\nalice@test.com,Alice,\nbob@test.com,Bob Updated,';
    const result = await service.bulkUpload(context, csv);

    expect(result.errors).toEqual([{ row: 1, reason: 'Invalid or missing email: "bad-email"' }]);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(tx.candidate.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', email: 'alice@test.com', name: 'Alice', phone: undefined },
    });
    expect(tx.candidate.update).toHaveBeenCalledWith({
      where: { id: 'cand-existing' },
      data: { name: 'Bob Updated', phone: undefined },
    });
  });

  describe('exportData', () => {
    it('assembles the candidate\'s full data footprint with human-readable joins', async () => {
      const tx = {
        candidate: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'cand-1', email: 'a@test.com', name: 'Alice', phone: '555-1234', createdAt: new Date('2026-01-01'),
          }),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', status: 'completed', invitedAt: new Date('2026-01-02'),
              expiresAt: new Date('2026-01-09'), revokedAt: null,
              exam: { title: 'Backend Round' },
              attempt: {
                id: 'attempt-1', status: 'submitted', startedAt: new Date('2026-01-03'),
                submittedAt: new Date('2026-01-03'), deviceFingerprint: 'fp-abc',
                result: { score: 5, maxScore: 10, percentage: 50, passFail: 'pass' },
                answers: [
                  {
                    selectedOptionIdsJson: JSON.stringify(['opt-a']),
                    isCorrect: true, marksAwarded: 5,
                    question: { text: 'What is 2+2?', options: [{ id: 'opt-a', text: '4' }, { id: 'opt-b', text: '5' }] },
                  },
                ],
                proctoringEvents: [
                  { eventType: 'tab_switch', severity: 'medium', occurredAt: new Date('2026-01-03'), metadataJson: JSON.stringify({ count: 2 }) },
                ],
                proctoringAnalysis: { status: 'completed', riskLevel: 'low', summary: 'No issues observed.' },
                insight: { status: 'completed', summary: 'Strong fundamentals.' },
                messages: [{ body: 'Please stay in frame', sentAt: new Date('2026-01-03'), readAt: null }],
              },
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.exportData(context, 'user-1', 'cand-1');

      expect(result.candidate).toEqual({
        id: 'cand-1', email: 'a@test.com', name: 'Alice', phone: '555-1234', createdAt: new Date('2026-01-01'),
      });
      expect(result.invitations).toEqual([
        { id: 'inv-1', examTitle: 'Backend Round', status: 'completed', invitedAt: new Date('2026-01-02'), expiresAt: new Date('2026-01-09'), revokedAt: null },
      ]);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].examTitle).toBe('Backend Round');
      expect(result.attempts[0].result).toEqual({ score: 5, maxScore: 10, percentage: 50, passFail: 'pass' });
      expect(result.attempts[0].answers).toEqual([
        { questionText: 'What is 2+2?', selectedOptions: ['4'], isCorrect: true, marksAwarded: 5 },
      ]);
      expect(result.attempts[0].proctoringEvents).toEqual([
        { eventType: 'tab_switch', severity: 'medium', occurredAt: new Date('2026-01-03'), metadata: { count: 2 } },
      ]);
      expect(result.attempts[0].messages).toEqual([
        { body: 'Please stay in frame', sentAt: new Date('2026-01-03'), readAt: null },
      ]);
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'candidate.data_exported', entityType: 'candidate', entityId: 'cand-1',
      });
    });

    it('handles an invitation with no attempt yet', async () => {
      const tx = {
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'a@test.com', name: 'Alice', phone: null, createdAt: new Date('2026-01-01') }),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', status: 'invited', invitedAt: new Date('2026-01-02'), expiresAt: new Date('2026-01-09'), revokedAt: null,
              exam: { title: 'Backend Round' }, attempt: null,
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.exportData(context, 'user-1', 'cand-1');

      expect(result.invitations).toHaveLength(1);
      expect(result.attempts).toEqual([]);
    });

    it('throws NotFoundException (and does not audit) for a candidate outside the caller organization', async () => {
      const tx = { candidate: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.exportData(context, 'user-1', 'cand-x')).rejects.toThrow(NotFoundException);
      expect(audit.record).not.toHaveBeenCalled();
    });

    function exportTxWithProctoringEvent(metadataJson: string | null) {
      return {
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'a@test.com', name: 'Alice', phone: null, createdAt: new Date('2026-01-01') }),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', status: 'completed', invitedAt: new Date('2026-01-02'), expiresAt: new Date('2026-01-09'), revokedAt: null,
              exam: { title: 'Backend Round' },
              attempt: {
                id: 'attempt-1', status: 'submitted', startedAt: new Date('2026-01-03'), submittedAt: new Date('2026-01-03'), deviceFingerprint: null,
                result: null, answers: [],
                proctoringEvents: [{ eventType: 'webcam_snapshot', severity: 'low', occurredAt: new Date('2026-01-03'), metadataJson }],
                proctoringAnalysis: null, insight: null, messages: [],
              },
            },
          ]),
        },
      };
    }

    it('signs a raw blob URL in an exported proctoring event', async () => {
      const tx = exportTxWithProctoringEvent(JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg' }));
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      blobStorage.signIfOurs.mockImplementation(async (value: string) => `${value}?sig=signed`);

      const result = await service.exportData(context, 'user-1', 'cand-1');

      expect(blobStorage.signIfOurs).toHaveBeenCalledWith('https://blob.test/container/webcam-snapshots/a.jpg');
      expect(result.attempts[0].proctoringEvents[0].metadata).toEqual({
        snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg?sig=signed',
      });
    });

    it('leaves a data: URI identical in an exported proctoring event', async () => {
      const tx = exportTxWithProctoringEvent(JSON.stringify({ snapshot: 'data:image/jpeg;base64,AAAA' }));
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.exportData(context, 'user-1', 'cand-1');

      expect(result.attempts[0].proctoringEvents[0].metadata).toEqual({ snapshot: 'data:image/jpeg;base64,AAAA' });
    });

    describe('with the real BlobStorageService (offline SAS signing, no network)', () => {
      const CONTAINER_URL = 'https://fakeaccount.blob.core.windows.net/container';
      let realService: CandidatesService;

      beforeEach(() => {
        const credential = new StorageSharedKeyCredential('fakeaccount', Buffer.from('fake-key').toString('base64'));
        const realContainer = new ContainerClient(CONTAINER_URL, credential);
        (BlobServiceClient.fromConnectionString as jest.Mock).mockReturnValue({
          getContainerClient: () => realContainer,
        });
        process.env.AZURE_STORAGE_CONNECTION_STRING = 'UseDevelopmentStorage=true';
        process.env.AZURE_STORAGE_CONTAINER = 'container';
        const realBlobStorage = new BlobStorageService();
        realService = new CandidatesService(tenantPrisma as never, audit as never, realBlobStorage);
      });

      afterEach(() => {
        delete process.env.AZURE_STORAGE_CONNECTION_STRING;
        delete process.env.AZURE_STORAGE_CONTAINER;
      });

      it('resolves a raw blob URL to a genuinely signed SAS URL', async () => {
        const tx = exportTxWithProctoringEvent(JSON.stringify({ snapshot: `${CONTAINER_URL}/webcam-snapshots/a.jpg` }));
        tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

        const result = await realService.exportData(context, 'user-1', 'cand-1');
        const { snapshot } = result.attempts[0].proctoringEvents[0].metadata as { snapshot: string };

        expect(snapshot.startsWith(`${CONTAINER_URL}/webcam-snapshots/a.jpg?`)).toBe(true);
        expect(new URLSearchParams(snapshot.split('?')[1]).get('sp')).toBe('r');
      });
    });
  });

  describe('erase', () => {
    function makeEraseTx(
      overrides: { candidate?: Record<string, unknown>; proctoringEvents?: { metadataJson: string | null }[] } = {},
    ) {
      return {
        candidate: {
          findFirst: jest.fn().mockResolvedValue(
            overrides.candidate ?? { id: 'cand-1', email: 'a@test.com', name: 'Alice', phone: '555-1234', erasedAt: null },
          ),
          update: jest.fn(),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([{ id: 'inv-1' }, { id: 'inv-2' }]),
          updateMany: jest.fn(),
        },
        attempt: {
          findMany: jest.fn().mockResolvedValue([{ id: 'attempt-1' }]),
          updateMany: jest.fn(),
        },
        candidateMessage: { updateMany: jest.fn() },
        proctoringEvent: {
          findMany: jest.fn().mockResolvedValue(overrides.proctoringEvents ?? []),
          updateMany: jest.fn(),
        },
        proctoringAnalysis: { updateMany: jest.fn() },
        attemptInsight: { updateMany: jest.fn() },
        candidateRefreshToken: { deleteMany: jest.fn() },
      };
    }

    it('scrubs every PII-bearing field, deletes session tokens, and revokes live invitations atomically', async () => {
      const tx = makeEraseTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.erase(context, 'user-1', 'cand-1');

      expect(tx.candidate.update).toHaveBeenCalledWith({
        where: { id: 'cand-1' },
        data: { name: 'Redacted', email: 'erased-cand-1@redacted.invalid', phone: null, erasedAt: expect.any(Date) },
      });
      expect(tx.attempt.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['attempt-1'] } }, data: { deviceFingerprint: null },
      });
      expect(tx.candidateMessage.updateMany).toHaveBeenCalledWith({
        where: { attemptId: { in: ['attempt-1'] } }, data: { body: '[redacted]' },
      });
      expect(tx.proctoringEvent.updateMany).toHaveBeenCalledWith({
        where: { attemptId: { in: ['attempt-1'] } }, data: { metadataJson: null },
      });
      expect(tx.proctoringAnalysis.updateMany).toHaveBeenCalledWith({
        where: { attemptId: { in: ['attempt-1'] }, summary: { not: null } }, data: { summary: '[redacted]' },
      });
      expect(tx.attemptInsight.updateMany).toHaveBeenCalledWith({
        where: { attemptId: { in: ['attempt-1'] }, summary: { not: null } }, data: { summary: '[redacted]' },
      });
      expect(tx.candidateRefreshToken.deleteMany).toHaveBeenCalledWith({
        where: { invitationId: { in: ['inv-1', 'inv-2'] } },
      });
      expect(tx.invitation.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['inv-1', 'inv-2'] }, status: 'invited' },
        data: { status: 'revoked', revokedAt: expect.any(Date) },
      });
      expect(result.id).toBe('cand-1');
      expect(result.erasedAt).toEqual(expect.any(Date));
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'candidate.erased', entityType: 'candidate', entityId: 'cand-1',
      });
    });

    it('is idempotent: an already-erased candidate is a no-op with no re-scrub and no second audit entry', async () => {
      const previouslyErasedAt = new Date('2026-06-01');
      const tx = makeEraseTx({
        candidate: { id: 'cand-1', email: 'erased-cand-1@redacted.invalid', name: 'Redacted', phone: null, erasedAt: previouslyErasedAt },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.erase(context, 'user-1', 'cand-1');

      expect(result).toEqual({ id: 'cand-1', erasedAt: previouslyErasedAt });
      expect(tx.candidate.update).not.toHaveBeenCalled();
      expect(tx.candidateRefreshToken.deleteMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('throws NotFoundException (and touches nothing) for a candidate outside the caller organization', async () => {
      const tx = makeEraseTx();
      tx.candidate.findFirst.mockResolvedValue(null);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.erase(context, 'user-1', 'cand-x')).rejects.toThrow(NotFoundException);
      expect(tx.candidate.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('reads the webcam snapshot and screen-capture URLs before metadataJson is nulled, then deletes both blobs after the transaction commits', async () => {
      const tx = makeEraseTx({
        proctoringEvents: [
          { metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg' }) },
          { metadataJson: JSON.stringify({ screenshot: 'https://blob.test/container/screen-captures/b.jpg' }) },
        ],
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.erase(context, 'user-1', 'cand-1');

      // Ordering, not just occurrence, using Jest's invocationCallOrder -- a single monotonic
      // counter shared across every mock.fn() in this test, so it's a genuine proxy for real
      // call order (moving the delete loop inside the transaction callback would fail this),
      // even though `forTenant` itself is mocked rather than a real interactive transaction.
      const readOrder = tx.proctoringEvent.findMany.mock.invocationCallOrder[0];
      const nullOrder = tx.proctoringEvent.updateMany.mock.invocationCallOrder[0];
      const lastTxStatementOrder = tx.invitation.updateMany.mock.invocationCallOrder[0];
      const auditOrder = audit.record.mock.invocationCallOrder[0];
      const deleteOrders = blobStorage.deleteByUrl.mock.invocationCallOrder;

      expect(readOrder).toBeLessThan(nullOrder);
      expect(auditOrder).toBeGreaterThan(lastTxStatementOrder);
      // The audit record is the legally-required half; it must not wait on best-effort blob
      // cleanup, so it's written before the delete loop starts, not after it finishes.
      expect(auditOrder).toBeLessThan(Math.min(...deleteOrders));

      expect(tx.proctoringEvent.updateMany).toHaveBeenCalledWith({
        where: { attemptId: { in: ['attempt-1'] } }, data: { metadataJson: null },
      });
      expect(blobStorage.deleteByUrl).toHaveBeenCalledWith('https://blob.test/container/webcam-snapshots/a.jpg');
      expect(blobStorage.deleteByUrl).toHaveBeenCalledWith('https://blob.test/container/screen-captures/b.jpg');
      expect(blobStorage.deleteByUrl).toHaveBeenCalledTimes(2);
    });

    it('deletes each collected URL only once even if the same evidence URL appears on more than one event', async () => {
      const tx = makeEraseTx({
        proctoringEvents: [
          { metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg' }) },
          { metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg' }) },
        ],
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.erase(context, 'user-1', 'cand-1');

      expect(blobStorage.deleteByUrl).toHaveBeenCalledTimes(1);
    });

    it('skips the delete loop and logs once, rather than once per blob, when blob storage is not configured', async () => {
      const tx = makeEraseTx({
        proctoringEvents: [
          { metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg' }) },
          { metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/b.jpg' }) },
        ],
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      blobStorage.isConfigured.mockReturnValue(false);

      const result = await service.erase(context, 'user-1', 'cand-1');

      expect(result).toEqual({ id: 'cand-1', erasedAt: expect.any(Date) });
      expect(blobStorage.deleteByUrl).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalled();
    });

    it('still reports a successful erase, and still deletes the remaining blobs, when one blob delete throws', async () => {
      const tx = makeEraseTx({
        proctoringEvents: [
          { metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg' }) },
          { metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/b.jpg' }) },
        ],
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      blobStorage.deleteByUrl.mockRejectedValueOnce(new Error('blob storage unavailable'));

      const result = await service.erase(context, 'user-1', 'cand-1');

      expect(result).toEqual({ id: 'cand-1', erasedAt: expect.any(Date) });
      expect(blobStorage.deleteByUrl).toHaveBeenCalledTimes(2);
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'candidate.erased', entityType: 'candidate', entityId: 'cand-1',
      });
    });

    it('does not abort the erase when one proctoring event carries malformed metadataJson', async () => {
      const tx = makeEraseTx({
        proctoringEvents: [
          { metadataJson: 'not-valid-json{' },
          { metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/c.jpg' }) },
        ],
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.erase(context, 'user-1', 'cand-1');

      expect(result).toEqual({ id: 'cand-1', erasedAt: expect.any(Date) });
      expect(blobStorage.deleteByUrl).toHaveBeenCalledTimes(1);
      expect(blobStorage.deleteByUrl).toHaveBeenCalledWith('https://blob.test/container/webcam-snapshots/c.jpg');
      expect(audit.record).toHaveBeenCalled();
    });
  });
});
