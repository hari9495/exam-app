import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CandidatesService } from './candidates.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('CandidatesService', () => {
  let service: CandidatesService;
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [CandidatesService, { provide: TenantPrismaService, useValue: tenantPrisma }],
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

  it('rejects creating a candidate whose email already exists in the organization', async () => {
    const tx = {
      candidate: { findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'a@test.com' }) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.create(context, { email: 'a@test.com', name: 'Alice' })).rejects.toThrow(ConflictException);
  });

  it("lists candidates scoped to the caller's organization", async () => {
    tenantPrisma.forTenant.mockResolvedValue([{ id: 'cand-1' }]);

    const result = await service.list(context, {});

    expect(result).toHaveLength(1);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
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
});
