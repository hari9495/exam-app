import { BadRequestException, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CustomFieldsConfigController } from './custom-fields-config.controller';
import { CustomFieldsService } from './custom-fields.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';

class MockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

const selectDef = {
  id: 'f1',
  organizationId: 'org-1',
  entityType: 'candidate',
  key: 'source',
  label: 'Source',
  fieldType: 'select',
  optionsJson: '["A","B"]',
  required: false,
  showOnApply: true,
  position: 0,
  archivedAt: null,
  createdAt: new Date('2026-01-01'),
};

const textDef = { ...selectDef, id: 'f2', fieldType: 'text', optionsJson: null };

describe('CustomFieldsConfigController', () => {
  let controller: CustomFieldsConfigController;
  let service: { list: jest.Mock; create: jest.Mock; update: jest.Mock; archive: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue([selectDef, textDef]),
      create: jest.fn().mockResolvedValue(selectDef),
      update: jest.fn().mockResolvedValue(textDef),
      archive: jest.fn().mockResolvedValue({ id: 'f1', archivedAt: new Date() }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CustomFieldsConfigController],
      providers: [{ provide: CustomFieldsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(CustomFieldsConfigController);
  });

  it('rejects a bad entityType with BadRequestException', async () => {
    await expect(controller.list(tenant, 'widget')).rejects.toThrow(BadRequestException);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('GET delegates to service.list with tenant context and parses optionsJson -> options', async () => {
    const res = await controller.list(tenant, 'candidate', 'true');
    expect(service.list).toHaveBeenCalledWith(tenant, 'candidate', true);
    expect(res).toEqual([
      expect.objectContaining({ id: 'f1', options: ['A', 'B'] }),
      expect.objectContaining({ id: 'f2', options: null }),
    ]);
    expect(res[0]).not.toHaveProperty('optionsJson');
    expect(res[1]).not.toHaveProperty('optionsJson');
  });

  it('defaults includeArchived to false when omitted', async () => {
    await controller.list(tenant, 'job');
    expect(service.list).toHaveBeenCalledWith(tenant, 'job', false);
  });

  it('POST delegates to service.create and returns the mapped response', async () => {
    const dto = { entityType: 'candidate', label: 'Source', fieldType: 'select', options: ['A', 'B'] } as any;
    const res = await controller.create(tenant, dto);
    expect(service.create).toHaveBeenCalledWith(tenant, dto);
    expect(res).toEqual(expect.objectContaining({ id: 'f1', options: ['A', 'B'] }));
    expect(res).not.toHaveProperty('optionsJson');
  });

  it('PATCH delegates to service.update and returns the mapped response with null options', async () => {
    const dto = { label: 'Renamed' } as any;
    const res = await controller.update(tenant, 'f2', dto);
    expect(service.update).toHaveBeenCalledWith(tenant, 'f2', dto);
    expect(res).toEqual(expect.objectContaining({ id: 'f2', options: null }));
    expect(res).not.toHaveProperty('optionsJson');
  });

  it('DELETE delegates to service.archive', async () => {
    await controller.archive(tenant, 'f1');
    expect(service.archive).toHaveBeenCalledWith(tenant, 'f1');
  });
});
