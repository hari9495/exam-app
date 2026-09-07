import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService, AuditService } from '@exam-platform/shared';
import { FieldPermissionsService } from './field-permissions.service';

describe('FieldPermissionsService', () => {
  let service: FieldPermissionsService;
  let prisma: { organization: { findUnique: jest.Mock; update: jest.Mock } };
  let audit: { record: jest.Mock };

  const tenant = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn(), update: jest.fn() } };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        FieldPermissionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(FieldPermissionsService);
  });

  describe('getHiddenFields', () => {
    it('returns an empty set for a non-governable role without querying the db', async () => {
      const result = await service.getHiddenFields(tenant, 'org_admin', 'candidate');
      expect(result).toEqual(new Set());
      expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    });

    it('returns the parsed hidden-field set for a governable role', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        fieldPermissionsJson: JSON.stringify({ candidate: { recruiter: ['email'] } }),
      });
      const result = await service.getHiddenFields(tenant, 'recruiter', 'candidate');
      expect(result).toEqual(new Set(['email']));
      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        select: { fieldPermissionsJson: true },
      });
    });

    it('drops a stale/unknown field left over in stored JSON', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        fieldPermissionsJson: JSON.stringify({ candidate: { recruiter: ['email', 'ssn'] } }),
      });
      const result = await service.getHiddenFields(tenant, 'recruiter', 'candidate');
      expect(result).toEqual(new Set(['email']));
    });
  });

  describe('getConfig', () => {
    it('returns the parsed config', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        fieldPermissionsJson: JSON.stringify({ candidate: { recruiter: ['email'] } }),
      });
      const result = await service.getConfig(tenant);
      expect(result).toEqual({ candidate: { recruiter: ['email'] } });
    });

    it('returns an empty config when nothing is stored', async () => {
      prisma.organization.findUnique.mockResolvedValue({ fieldPermissionsJson: null });
      const result = await service.getConfig(tenant);
      expect(result).toEqual({});
    });
  });

  describe('setConfig', () => {
    it('validates, persists, and audits the update', async () => {
      prisma.organization.update.mockResolvedValue({});
      const result = await service.setConfig(tenant, 'user-1', { candidate: { recruiter: ['email'] } });

      expect(result).toEqual({ candidate: { recruiter: ['email'] } });
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { fieldPermissionsJson: JSON.stringify({ candidate: { recruiter: ['email'] } }) },
      });
      expect(audit.record).toHaveBeenCalledWith(tenant, {
        actorUserId: 'user-1',
        action: 'organization.field_permissions_updated',
        entityType: 'organization',
        entityId: 'org-1',
      });
    });

    it('rejects an unknown field with BadRequestException and does not persist', async () => {
      await expect(service.setConfig(tenant, 'user-1', { candidate: { recruiter: ['ssn'] } })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.organization.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('round-trips a config through setConfig and getConfig', async () => {
      let stored: string | null = null;
      prisma.organization.update.mockImplementation(({ data }: { data: { fieldPermissionsJson: string } }) => {
        stored = data.fieldPermissionsJson;
        return Promise.resolve({});
      });
      prisma.organization.findUnique.mockImplementation(() => Promise.resolve({ fieldPermissionsJson: stored }));

      await service.setConfig(tenant, 'user-1', { candidate: { recruiter: ['email'] } });
      const result = await service.getConfig(tenant);

      expect(result).toEqual({ candidate: { recruiter: ['email'] } });
    });
  });
});
