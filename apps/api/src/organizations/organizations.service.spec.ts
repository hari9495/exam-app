import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: { organization: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock } };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() } };
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

  describe('getBranding', () => {
    it('returns null logoUrl/colors for an org with nothing set', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', logoPath: null, primaryColor: null, accentColor: null });

      const result = await service.getBranding({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toEqual({ logoUrl: null, primaryColor: null, accentColor: null });
    });

    it('derives logoUrl from logoPath and API_ORIGIN', async () => {
      process.env.API_ORIGIN = 'http://localhost:3001';
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', logoPath: 'logos/org-1.png', primaryColor: '#1a73e8', accentColor: '#fbbc04' });

      const result = await service.getBranding({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toEqual({ logoUrl: 'http://localhost:3001/uploads/logos/org-1.png', primaryColor: '#1a73e8', accentColor: '#fbbc04' });
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(service.getBranding({ organizationId: null, isSuperAdmin: true })).rejects.toThrow(BadRequestException);
      expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('updateBrandingColors', () => {
    it('updates only the provided fields and returns the fresh branding', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1', logoPath: null, primaryColor: '#1a73e8', accentColor: null });

      const result = await service.updateBrandingColors({ organizationId: 'org-1', isSuperAdmin: false }, { primaryColor: '#1a73e8' });

      expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: { primaryColor: '#1a73e8' } });
      expect(result).toEqual({ logoUrl: null, primaryColor: '#1a73e8', accentColor: null });
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(
        service.updateBrandingColors({ organizationId: null, isSuperAdmin: true }, { primaryColor: '#1a73e8' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });
  });
});
