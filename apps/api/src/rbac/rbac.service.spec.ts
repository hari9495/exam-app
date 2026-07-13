import { Test } from '@nestjs/testing';
import { RbacService } from './rbac.service';
import { PrismaService } from '@exam-platform/shared';

describe('RbacService', () => {
  let service: RbacService;
  let prisma: { rolePermission: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { rolePermission: { findMany: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [RbacService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(RbacService);
  });

  it('groups permissions by role, sorted alphabetically within each role', async () => {
    prisma.rolePermission.findMany.mockResolvedValue([
      { role: 'org_admin', permission: { key: 'org:view' } },
      { role: 'org_admin', permission: { key: 'audit:view' } },
      { role: 'recruiter', permission: { key: 'exam:manage' } },
    ]);

    const result = await service.listRoles();

    expect(result).toEqual([
      { role: 'org_admin', permissions: ['audit:view', 'org:view'] },
      { role: 'recruiter', permissions: ['exam:manage'] },
    ]);
  });

  it('returns an empty array when no role/permission grants exist', async () => {
    prisma.rolePermission.findMany.mockResolvedValue([]);

    const result = await service.listRoles();

    expect(result).toEqual([]);
  });
});
