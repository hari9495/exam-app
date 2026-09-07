import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService, AuditService } from '@exam-platform/shared';
import { RecordVisibilityService } from './record-visibility.service';

describe('RecordVisibilityService', () => {
  let service: RecordVisibilityService;
  let prisma: { organization: { findFirstOrThrow: jest.Mock; update: jest.Mock } };
  let audit: { record: jest.Mock };

  const tenant = { organizationId: 'org-1', isSuperAdmin: false, userId: 'user-1' };

  beforeEach(async () => {
    prisma = { organization: { findFirstOrThrow: jest.fn(), update: jest.fn() } };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecordVisibilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(RecordVisibilityService);
  });

  describe('getRecordVisibility', () => {
    it('returns the org flag', async () => {
      prisma.organization.findFirstOrThrow.mockResolvedValue({ recordVisibilityEnabled: true });
      const result = await service.getRecordVisibility(tenant);
      expect(result).toEqual({ enabled: true });
      expect(prisma.organization.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        select: { recordVisibilityEnabled: true },
      });
    });

    it('rejects a context with no organization', async () => {
      await expect(service.getRecordVisibility({ organizationId: null, isSuperAdmin: true })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('setRecordVisibility', () => {
    it('persists and audits the update', async () => {
      prisma.organization.update.mockResolvedValue({});
      const result = await service.setRecordVisibility(tenant, true);

      expect(result).toEqual({ enabled: true });
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { recordVisibilityEnabled: true },
      });
      expect(audit.record).toHaveBeenCalledWith(tenant, {
        actorUserId: 'user-1',
        action: 'organization.record_visibility_updated',
        entityType: 'organization',
        entityId: 'org-1',
      });
    });

    it('rejects an org-less context and does not persist or audit', async () => {
      await expect(service.setRecordVisibility({ organizationId: null, isSuperAdmin: true }, true)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.organization.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
