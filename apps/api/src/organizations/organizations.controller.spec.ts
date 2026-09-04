import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';

class MockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

// Covers only the two pipeline-settings routes added alongside the candidates globalStage
// filter -- the rest of this controller's routes are exercised through the e2e suite, not
// a per-route unit spec, matching this file's absence until now.
describe('OrganizationsController pipeline settings', () => {
  let controller: OrganizationsController;
  let service: { getPipelineSettings: jest.Mock; updatePipelineSettings: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      getPipelineSettings: jest.fn().mockResolvedValue({ autoArchiveSiblingsOnHire: true }),
      updatePipelineSettings: jest.fn().mockResolvedValue({ autoArchiveSiblingsOnHire: false }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [{ provide: OrganizationsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(OrganizationsController);
  });

  it('GET /organizations/pipeline-settings delegates to getPipelineSettings', async () => {
    const result = await controller.getPipelineSettings(tenant);
    expect(service.getPipelineSettings).toHaveBeenCalledWith(tenant);
    expect(result).toEqual({ autoArchiveSiblingsOnHire: true });
  });

  it('PATCH /organizations/pipeline-settings delegates to updatePipelineSettings', async () => {
    const result = await controller.updatePipelineSettings(tenant, 'user-1', { autoArchiveSiblingsOnHire: false });
    expect(service.updatePipelineSettings).toHaveBeenCalledWith(tenant, 'user-1', { autoArchiveSiblingsOnHire: false });
    expect(result).toEqual({ autoArchiveSiblingsOnHire: false });
  });

  it('gates the setter behind pipelines:configure', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.updatePipelineSettings);
    expect(permissions).toEqual(['pipelines:configure']);
  });

  it('gates the getter behind pipelines:configure', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.getPipelineSettings);
    expect(permissions).toEqual(['pipelines:configure']);
  });
});
