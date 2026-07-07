import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let tenantPrisma: { forTenant: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('rejects creating a user with no organization context', async () => {
    await expect(
      service.create({ organizationId: null, isSuperAdmin: true }, { email: 'a@b.com', password: 'password1', role: 'recruiter' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a user scoped to the caller\'s organization', async () => {
    tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', email: 'a@b.com', organizationId: 'org-1', role: 'recruiter' });

    const result = await service.create(
      { organizationId: 'org-1', isSuperAdmin: false },
      { email: 'a@b.com', password: 'password1', role: 'recruiter' },
    );

    expect(result.organizationId).toBe('org-1');
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      expect.any(Function),
    );
  });
});
