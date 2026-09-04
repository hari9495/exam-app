import { BadRequestException, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';

class MockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

describe('CandidatesController', () => {
  let controller: CandidatesController;
  let service: { getProfile: jest.Mock; getResumeUrl: jest.Mock; list: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      getProfile: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      getResumeUrl: jest.fn().mockResolvedValue({ url: 'https://blob.test/resume.pdf?sig=abc' }),
      list: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CandidatesController],
      providers: [{ provide: CandidatesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(CandidatesController);
  });

  it('getProfile delegates to the service with the tenant and candidate id', async () => {
    const result = await controller.getProfile(tenant, 'cand-1');
    expect(service.getProfile).toHaveBeenCalledWith(tenant, 'cand-1');
    expect(result).toEqual({ id: 'profile-1' });
  });

  it('getResumeUrl delegates to the service with the tenant and candidate id', async () => {
    const result = await controller.getResumeUrl(tenant, 'cand-1');
    expect(service.getResumeUrl).toHaveBeenCalledWith(tenant, 'cand-1');
    expect(result).toEqual({ url: 'https://blob.test/resume.pdf?sig=abc' });
  });

  describe('list globalStage filter', () => {
    it('passes a valid globalStage through to the service', async () => {
      await controller.list(tenant, undefined, undefined, undefined, undefined, 'available');
      expect(service.list).toHaveBeenCalledWith(tenant, {
        page: undefined, pageSize: undefined, search: undefined, status: undefined, globalStage: 'available',
      });
    });

    it('rejects a globalStage that is not one of GLOBAL_STAGES', () => {
      expect(() =>
        controller.list(tenant, undefined, undefined, undefined, undefined, 'not-a-stage'),
      ).toThrow(BadRequestException);
      expect(service.list).not.toHaveBeenCalled();
    });
  });
});
