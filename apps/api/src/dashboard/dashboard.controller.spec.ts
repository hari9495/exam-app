import { BadRequestException, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';

class MockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: { getSummary: jest.Mock; getTrend: jest.Mock; getExamPerformance: jest.Mock; getFunnel: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      getSummary: jest.fn(),
      getTrend: jest.fn().mockResolvedValue({ points: [] }),
      getExamPerformance: jest.fn().mockResolvedValue({ exams: [] }),
      getFunnel: jest.fn().mockResolvedValue({ invited: 0, started: 0, submitted: 0, passed: 0 }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(DashboardController);
  });

  describe('getTrend', () => {
    it('rejects an invalid metric', () => {
      expect(() => controller.getTrend(tenant, 'bogus', '14')).toThrow(BadRequestException);
    });

    it('rejects a missing metric', () => {
      expect(() => controller.getTrend(tenant, undefined, '14')).toThrow(BadRequestException);
    });

    it('defaults days to 14 when omitted', () => {
      controller.getTrend(tenant, 'candidates', undefined);
      expect(service.getTrend).toHaveBeenCalledWith(tenant, 'candidates', 14);
    });

    it('defaults days to 14 when given a value outside {7, 14, 30}', () => {
      controller.getTrend(tenant, 'candidates', '99');
      expect(service.getTrend).toHaveBeenCalledWith(tenant, 'candidates', 14);
    });

    it('passes a valid metric and days through to the service', () => {
      controller.getTrend(tenant, 'invitations', '30');
      expect(service.getTrend).toHaveBeenCalledWith(tenant, 'invitations', 30);
    });
  });
});
