import { Test } from '@nestjs/testing';
import { TagsService } from './tags.service';
import { TenantPrismaService } from '@exam-platform/shared';

describe('TagsService', () => {
  let service: TagsService;
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [TagsService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(TagsService);
  });

  it('lists the caller\'s organization tags ordered by name', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'tag-1', name: 'javascript' }]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ tag: { findMany } }));

    const result = await service.list(context);

    expect(result).toEqual([{ id: 'tag-1', name: 'javascript' }]);
    expect(findMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1' }, orderBy: { name: 'asc' } });
  });
});
