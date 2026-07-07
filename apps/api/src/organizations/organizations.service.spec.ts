import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: { organization: { findUnique: jest.Mock; create: jest.Mock } };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn(), create: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [OrganizationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(OrganizationsService);
  });

  it('creates an organization when the slug is free', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', planId: 'plan-1' });

    const result = await service.create({ name: 'Acme', slug: 'acme', region: 'us', planId: 'plan-1' });

    expect(result.slug).toBe('acme');
    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: { name: 'Acme', slug: 'acme', region: 'us', planId: 'plan-1' },
    });
  });

  it('rejects a duplicate slug', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'existing-org' });

    await expect(
      service.create({ name: 'Acme 2', slug: 'acme', region: 'us', planId: 'plan-1' }),
    ).rejects.toThrow(ConflictException);
  });
});
