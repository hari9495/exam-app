import { BadRequestException, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';

class MockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

describe('CandidatesController', () => {
  let controller: CandidatesController;
  let service: { getProfile: jest.Mock; getResumeUrl: jest.Mock; list: jest.Mock; setSmsOptOut: jest.Mock; setWhatsappOptOut: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      getProfile: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      getResumeUrl: jest.fn().mockResolvedValue({ url: 'https://blob.test/resume.pdf?sig=abc' }),
      list: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      setSmsOptOut: jest.fn().mockResolvedValue({ id: 'cand-1', smsOptedOutAt: new Date('2026-09-09T00:00:00.000Z') }),
      setWhatsappOptOut: jest.fn().mockResolvedValue({ id: 'cand-1', whatsappOptedOutAt: null }),
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

  describe('setSmsOptOut', () => {
    it('PATCH :id/sms-opt-out delegates to the service with tenant, actor, id, and dto', async () => {
      const dto = { optedOut: true };
      const result = await controller.setSmsOptOut(tenant, 'user-1', 'cand-1', dto);
      expect(service.setSmsOptOut).toHaveBeenCalledWith(tenant, 'user-1', 'cand-1', dto);
      expect(result).toEqual({ id: 'cand-1', smsOptedOutAt: expect.any(Date) });
    });

    it('gates the route behind candidate:manage', () => {
      const permissions = Reflect.getMetadata(PERMISSIONS_KEY, CandidatesController.prototype.setSmsOptOut);
      expect(permissions).toEqual(['candidate:manage']);
    });
  });

  describe('list globalStage filter', () => {
    it('passes a valid globalStage through to the service', async () => {
      await controller.list(tenant, 'org_admin', undefined, undefined, undefined, undefined, 'available');
      expect(service.list).toHaveBeenCalledWith(
        tenant,
        { page: undefined, pageSize: undefined, search: undefined, status: undefined, globalStage: 'available' },
        'org_admin',
      );
    });

    it('rejects a globalStage that is not one of GLOBAL_STAGES', () => {
      expect(() =>
        controller.list(tenant, 'org_admin', undefined, undefined, undefined, undefined, 'not-a-stage'),
      ).toThrow(BadRequestException);
      expect(service.list).not.toHaveBeenCalled();
    });
  });

  describe('setWhatsappOptOut', () => {
    it('PATCH /candidates/:id/whatsapp-opt-out delegates to the service', async () => {
      const result = await controller.setWhatsappOptOut(tenant, 'user-1', 'cand-1', { optedOut: true });
      expect(service.setWhatsappOptOut).toHaveBeenCalledWith(tenant, 'user-1', 'cand-1', true);
      expect(result).toEqual({ id: 'cand-1', whatsappOptedOutAt: null });
    });

    it('gates the route behind candidate:manage', () => {
      const permissions = Reflect.getMetadata(PERMISSIONS_KEY, CandidatesController.prototype.setWhatsappOptOut);
      expect(permissions).toEqual(['candidate:manage']);
    });
  });
});
