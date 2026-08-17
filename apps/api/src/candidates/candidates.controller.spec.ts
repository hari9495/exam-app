import { CanActivate, ExecutionContext } from '@nestjs/common';
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
  let service: { getProfile: jest.Mock; getResumeUrl: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      getProfile: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      getResumeUrl: jest.fn().mockResolvedValue({ url: 'https://blob.test/resume.pdf?sig=abc' }),
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
});
