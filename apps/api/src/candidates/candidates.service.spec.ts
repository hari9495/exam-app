import { Test } from '@nestjs/testing';
import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
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
  let blobStorage: { deleteByUrl: jest.Mock; signIfOurs: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    blobStorage = {
      deleteByUrl: jest.fn().mockResolvedValue('deleted'),
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

    // Face reference images are special-category biometric data. erase() already reaches them;
    // the subject-access path did not, so a subject's own export was silently missing the most
    // sensitive thing held about them.
    function exportTxWithFaceEnrolment(faceEnrolment: Record<string, unknown> | null) {
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
                result: null, answers: [], proctoringEvents: [], proctoringAnalysis: null, insight: null, messages: [],
                faceEnrolment,
              },
            },
          ]),
        },
      };
    }

    it('includes the face enrolment, with the reference image signed on read', async () => {
      const tx = exportTxWithFaceEnrolment({
        status: 'enrolled',
        referenceImagePath: 'https://blob.test/container/face/attempt-1.jpg',
        capturedAt: new Date('2026-01-03T10:00:00Z'),
        consentAt: new Date('2026-01-03T09:59:00Z'),
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      blobStorage.signIfOurs.mockImplementation(async (value: string) => `${value}?sig=signed`);

      const result = await service.exportData(context, 'user-1', 'cand-1');

      // The query has to ASK for it -- otherwise the mapping above only works because this mock
      // volunteered the relation.
      expect(tx.invitation.findMany.mock.calls[0][0].include.attempt.include).toMatchObject({ faceEnrolment: true });
      expect(result.attempts[0].faceEnrolment).toEqual({
        status: 'enrolled',
        capturedAt: new Date('2026-01-03T10:00:00Z'),
        consentAt: new Date('2026-01-03T09:59:00Z'),
        referenceImageUrl: 'https://blob.test/container/face/attempt-1.jpg?sig=signed',
      });
      expect(blobStorage.signIfOurs).toHaveBeenCalledWith('https://blob.test/container/face/attempt-1.jpg');
    });

    it('exports a declined enrolment as a null image and a null consent moment, not as silence', async () => {
      const tx = exportTxWithFaceEnrolment({
        status: 'not_verified', referenceImagePath: null, capturedAt: null, consentAt: null,
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.exportData(context, 'user-1', 'cand-1');

      expect(result.attempts[0].faceEnrolment).toEqual({
        status: 'not_verified', capturedAt: null, consentAt: null, referenceImageUrl: null,
      });
    });

    it('reports null face enrolment for an attempt from before the feature existed', async () => {
      const tx = exportTxWithFaceEnrolment(null);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.exportData(context, 'user-1', 'cand-1');

      expect(result.attempts[0].faceEnrolment).toBeNull();
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

  describe('getProfile', () => {
    it('returns the org-scoped candidate profile', async () => {
      const profile = { id: 'profile-1', candidateId: 'cand-1', resumePath: 'resumes/cand-1.pdf' };
      const tx = { candidateProfile: { findFirst: jest.fn().mockResolvedValue(profile) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getProfile(context, 'cand-1');

      expect(tx.candidateProfile.findFirst).toHaveBeenCalledWith({
        where: { candidateId: 'cand-1', organizationId: 'org-1' },
      });
      expect(result).toEqual(profile);
    });

    it('returns null (not a 404) when the candidate has no profile yet', async () => {
      const tx = { candidateProfile: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getProfile(context, 'cand-1');

      expect(result).toBeNull();
    });
  });

  describe('getResumeUrl', () => {
    it('signs and returns the résumé blob URL', async () => {
      const tx = {
        candidateProfile: { findFirst: jest.fn().mockResolvedValue({ resumePath: 'resumes/cand-1.pdf' }) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      blobStorage.signIfOurs.mockResolvedValue('https://blob.test/container/resumes/cand-1.pdf?sig=abc');

      const result = await service.getResumeUrl(context, 'cand-1');

      expect(blobStorage.signIfOurs).toHaveBeenCalledWith('resumes/cand-1.pdf');
      expect(result).toEqual({ url: 'https://blob.test/container/resumes/cand-1.pdf?sig=abc' });
    });

    it('throws NotFoundException when the candidate has no profile', async () => {
      const tx = { candidateProfile: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.getResumeUrl(context, 'cand-1')).rejects.toThrow(NotFoundException);
      expect(blobStorage.signIfOurs).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the profile has no résumé on file', async () => {
      const tx = { candidateProfile: { findFirst: jest.fn().mockResolvedValue({ resumePath: null }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.getResumeUrl(context, 'cand-1')).rejects.toThrow(NotFoundException);
      expect(blobStorage.signIfOurs).not.toHaveBeenCalled();
    });
  });

  describe('erase', () => {
    function makeEraseTx(
      overrides: {
        candidate?: Record<string, unknown>;
        proctoringEvents?: { metadataJson: string | null }[];
        faceEnrolments?: { referenceImagePath: string | null }[];
        faceEnrolment?: { deleteMany?: jest.Mock };
        candidateProfile?: { resumePath: string | null } | null;
      } = {},
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
        faceEnrolment: {
          findMany: jest.fn().mockResolvedValue(overrides.faceEnrolments ?? []),
          deleteMany: overrides.faceEnrolment?.deleteMany ?? jest.fn(),
        },
        candidateProfile: {
          findFirst: jest.fn().mockResolvedValue(overrides.candidateProfile ?? null),
        },
      };
    }
    // Alias matching the brief's naming -- same helper, used by the face-data tests below.
    const mockEraseTx = (overrides: Parameters<typeof makeEraseTx>[0] = {}) => {
      const tx = makeEraseTx(overrides);
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));
      return tx;
    };

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

    it("collects the candidate's résumé blob URL alongside the proctoring evidence and deletes it after the transaction commits", async () => {
      const tx = makeEraseTx({
        proctoringEvents: [{ metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg' }) }],
        candidateProfile: { resumePath: 'https://blob.test/container/resumes/cand-1.pdf' },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.erase(context, 'user-1', 'cand-1');

      expect(tx.candidateProfile.findFirst).toHaveBeenCalledWith({
        where: { candidateId: 'cand-1' },
        select: { resumePath: true },
      });
      expect(blobStorage.deleteByUrl).toHaveBeenCalledWith('https://blob.test/container/resumes/cand-1.pdf');
      expect(blobStorage.deleteByUrl).toHaveBeenCalledTimes(2);
    });

    it('does not attempt a résumé blob delete when the candidate has no profile or résumé on file', async () => {
      const tx = makeEraseTx({ candidateProfile: null });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.erase(context, 'user-1', 'cand-1');

      expect(blobStorage.deleteByUrl).not.toHaveBeenCalled();
    });

    it('attempts every blob (deleteByUrl reports the skip itself) and logs a warn-level summary, rather than one log per blob, when blob storage is not configured', async () => {
      const tx = makeEraseTx({
        proctoringEvents: [
          { metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg' }) },
          { metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/b.jpg' }) },
        ],
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      blobStorage.deleteByUrl.mockResolvedValue('skipped-not-configured');
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      const result = await service.erase(context, 'user-1', 'cand-1');

      expect(result).toEqual({ id: 'cand-1', erasedAt: expect.any(Date) });
      expect(blobStorage.deleteByUrl).toHaveBeenCalledTimes(2);
      expect(audit.record).toHaveBeenCalled();
      // One summary line reflecting both skips, at warn (a non-clean outcome), never at .log,
      // and never containing the blob URL/path itself.
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [summary] = warnSpy.mock.calls[0];
      expect(summary).toContain('2 skipped (not configured)');
      expect(summary).not.toContain('blob.test');

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('still reports a successful erase, still deletes the remaining blobs, and logs the failing blob path + error in a companion warn line, when one blob delete throws', async () => {
      const tx = makeEraseTx({
        proctoringEvents: [
          { metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg' }) },
          { metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/b.jpg' }) },
        ],
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      blobStorage.deleteByUrl.mockRejectedValueOnce(new Error('blob storage unavailable'));
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const result = await service.erase(context, 'user-1', 'cand-1');

      expect(result).toEqual({ id: 'cand-1', erasedAt: expect.any(Date) });
      expect(blobStorage.deleteByUrl).toHaveBeenCalledTimes(2);
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'candidate.erased', entityType: 'candidate', entityId: 'cand-1',
      });
      // The summary line (counts only) plus a companion detail line -- the only place left, once
      // this call returns, that identifies *which* blob failed and why (metadataJson is already
      // null by now). The detail carries the container-relative path and the error message, but
      // never the scheme/host, and never a query string (where a SAS token would live).
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy.mock.calls[0][0]).toContain('1 failed');
      const [detail] = warnSpy.mock.calls[1];
      expect(detail).toContain('failed:');
      expect(detail).toContain('webcam-snapshots/a.jpg (blob storage unavailable)');
      expect(detail).not.toContain('https://blob.test');

      warnSpy.mockRestore();
    });

    it('logs a clean summary at .log (not .warn) when every blob deletes cleanly', async () => {
      const tx = makeEraseTx({
        proctoringEvents: [{ metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg' }) }],
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      await service.erase(context, 'user-1', 'cand-1');

      expect(warnSpy).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls[0][0]).toContain('1 deleted');

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('logs at .warn (not .log) when every blob resolves "not-found" -- an all-absent run is not a clean success', async () => {
      const tx = makeEraseTx({
        proctoringEvents: [{ metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg' }) }],
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      blobStorage.deleteByUrl.mockResolvedValue('not-found');
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      await service.erase(context, 'user-1', 'cand-1');

      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1); // no failed/unattempted entries, so no companion detail line
      expect(warnSpy.mock.calls[0][0]).toContain('1 not found');

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('stops once the delete budget is exhausted, logs the unattempted paths at warn, and still reports the erase as successful', async () => {
      const urls = Array.from({ length: 25 }, (_, i) => `https://blob.test/container/webcam-snapshots/${i}.jpg`);
      const tx = makeEraseTx({
        proctoringEvents: urls.map((url) => ({ metadataJson: JSON.stringify({ snapshot: url }) })),
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      // Chosen to discriminate the fix, not just exercise "the budget trips eventually": at
      // 18s elapsed with a 20s budget, the *old* `Date.now() < deadline` check (18000 < 20000)
      // would still admit a second 10-wide batch that could then run its full 3s per-call
      // timeout and finish at 21s -- past the budget the comment claims to enforce. The *new*
      // `Date.now() + EVIDENCE_DELETE_TIMEOUT_MS <= deadline` check (18000 + 3000 <= 20000) is
      // exactly false, so only the first batch (comfortably admitted at 1s elapsed) runs.
      // Reverting the comparison operator turns this from 10 into 20 deleteByUrl calls.
      const realNow = Date.now.bind(Date);
      const base = realNow();
      let call = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => {
        call += 1;
        if (call === 1) return base; // deadline = base + 20_000
        if (call === 2) return base + 1_000; // first batch's admission check
        return base + 18_000; // every check from the second batch onward
      });
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const result = await service.erase(context, 'user-1', 'cand-1');

      expect(result).toEqual({ id: 'cand-1', erasedAt: expect.any(Date) });
      expect(blobStorage.deleteByUrl).toHaveBeenCalledTimes(10); // only the first batch -- the second is refused, not just delayed
      expect(warnSpy).toHaveBeenCalledTimes(2);
      const [summary] = warnSpy.mock.calls[0];
      expect(summary).toContain('15 unattempted');
      expect(summary).toContain('budget exhausted');
      const [detail] = warnSpy.mock.calls[1];
      expect(detail).toContain('unattempted:');
      // Every unattempted URL's path is present (still no scheme/host), so the 15 blobs left in
      // place are individually findable, not just counted.
      for (let i = 10; i < 25; i += 1) {
        expect(detail).toContain(`webcam-snapshots/${i}.jpg`);
      }

      (Date.now as jest.Mock).mockRestore();
      warnSpy.mockRestore();
    });

    it('never slices a legacy inline data: URI as if it were a blob path when it ends up in the failed detail line', async () => {
      // Payload deliberately shaped like real webcam JPEG base64 -- the regression this guards
      // is `new URL(...).pathname` on an opaque `data:` scheme handing back the *entire* opaque
      // body (here, the base64 payload itself) to be logged verbatim.
      const dataUri = 'data:image/jpeg;base64,AAAA/BASE64FACEIMAGEDATA==';
      const tx = makeEraseTx({
        proctoringEvents: [
          { metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg' }) },
          { metadataJson: JSON.stringify({ snapshot: dataUri }) },
        ],
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      // The real blob deletes cleanly; the inline data: URI is the one that fails, so
      // blobPathForLogging is genuinely exercised on it (a `not-ours` skip would never reach
      // the logging path at all -- it must be *logged*, via failed or unattempted, to matter).
      blobStorage.deleteByUrl.mockResolvedValueOnce('deleted').mockRejectedValueOnce(new Error('unreachable'));
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await service.erase(context, 'user-1', 'cand-1');

      const allLogText = warnSpy.mock.calls.map(([message]) => message).join('\n');
      expect(allLogText).not.toContain('base64');
      expect(allLogText).not.toContain('FACEIMAGEDATA');
      expect(allLogText).toContain('(inline or non-URL evidence value)');

      warnSpy.mockRestore();
    });

    it('writes a companion audit entry with the delete tally strictly after the delete loop finishes', async () => {
      const tx = makeEraseTx({
        proctoringEvents: [
          { metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg' }) },
          { metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/b.jpg' }) },
        ],
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      blobStorage.deleteByUrl.mockResolvedValueOnce('deleted').mockResolvedValueOnce('not-found');

      await service.erase(context, 'user-1', 'cand-1');

      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1',
        action: 'candidate.erased.evidence_deleted',
        entityType: 'candidate',
        entityId: 'cand-1',
        metadata: {
          total: 2, deleted: 1, notFound: 1, failed: 0,
          skippedNotOurs: 0, skippedEmptyName: 0, skippedNotConfigured: 0, unattempted: 0,
        },
      });
      const deleteOrders = blobStorage.deleteByUrl.mock.invocationCallOrder;
      const auditOrders = audit.record.mock.invocationCallOrder;
      expect(auditOrders[1]).toBeGreaterThan(Math.max(...deleteOrders));
    });

    it('still succeeds and does not throw when the companion audit write itself fails', async () => {
      const tx = makeEraseTx({
        proctoringEvents: [{ metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg' }) }],
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      audit.record.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('audit db unavailable'));
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const result = await service.erase(context, 'user-1', 'cand-1');

      expect(result).toEqual({ id: 'cand-1', erasedAt: expect.any(Date) });
      expect(warnSpy.mock.calls.some(([message]) => typeof message === 'string' && message.includes('audit entry'))).toBe(true);

      warnSpy.mockRestore();
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

    it('deletes the face reference image blob and the enrolment row', async () => {
      const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
      blobStorage.deleteByUrl = jest.fn().mockResolvedValue('deleted');
      mockEraseTx({
        faceEnrolments: [{ referenceImagePath: 'https://acct.blob.core.windows.net/c/face/a1.jpg' }],
        faceEnrolment: { deleteMany },
      });

      await service.erase(context, 'user-1', 'cand-1');

      expect(blobStorage.deleteByUrl).toHaveBeenCalledWith('https://acct.blob.core.windows.net/c/face/a1.jpg');
      expect(deleteMany).toHaveBeenCalled();
    });

    // This is the assertion that makes the GDPR position defensible rather than nominal.
    it('leaves NO face data behind for the erased candidate', async () => {
      const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
      blobStorage.deleteByUrl = jest.fn().mockResolvedValue('deleted');
      mockEraseTx({
        faceEnrolments: [
          { referenceImagePath: 'https://acct.blob.core.windows.net/c/face/a1.jpg' },
          { referenceImagePath: 'https://acct.blob.core.windows.net/c/face/a2.jpg' },
        ],
        faceEnrolment: { deleteMany },
      });

      await service.erase(context, 'user-1', 'cand-1');

      expect(blobStorage.deleteByUrl).toHaveBeenCalledTimes(2);
      expect(deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.anything() }));
    });

    it('still deletes the row when the blob is already gone', async () => {
      const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
      blobStorage.deleteByUrl = jest.fn().mockRejectedValue(new Error('404'));
      mockEraseTx({ faceEnrolments: [{ referenceImagePath: 'https://acct.blob.core.windows.net/c/face/a1.jpg' }], faceEnrolment: { deleteMany } });

      await expect(service.erase(context, 'user-1', 'cand-1')).resolves.toBeDefined();
      expect(deleteMany).toHaveBeenCalled();
    });
  });
});
