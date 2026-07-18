import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { TenantPrismaService } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';

describe('UsersService', () => {
  let service: UsersService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('rejects creating a user with no organization context', async () => {
    await expect(
      service.create({ organizationId: null, isSuperAdmin: true }, { email: 'a@b.com', password: 'password1', role: 'recruiter' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a user scoped to the caller\'s organization', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

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

  it('never returns a passwordHash from create()', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.create(
      { organizationId: 'org-1', isSuperAdmin: false },
      { email: 'a@b.com', password: 'password1', role: 'recruiter' },
    );

    expect(result).not.toHaveProperty('passwordHash');
  });

  it('includes name in the created user response', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: null,
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.create(
      { organizationId: 'org-1', isSuperAdmin: false },
      { email: 'a@b.com', password: 'password1', role: 'recruiter' },
    );

    expect(result).toHaveProperty('name', null);
  });

  it('getMe returns the caller\'s own user record', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: 'Jane Recruiter',
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.getMe({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1');

    expect(result.name).toBe('Jane Recruiter');
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      expect.any(Function),
    );
  });

  it('updateMe updates only the name field', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: 'New Name',
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.updateMe({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', {
      name: 'New Name',
    });

    expect(result.name).toBe('New Name');
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      expect.any(Function),
    );
  });
});
