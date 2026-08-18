import { CanActivate, ExecutionContext, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PipelineAnalyticsController } from './pipeline-analytics.controller';
import { PipelineAnalyticsService } from './pipeline-analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';

class MockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

class RejectingGuard implements CanActivate {
  canActivate(): boolean {
    throw new UnauthorizedException();
  }
}

describe('PipelineAnalyticsController', () => {
  let controller: PipelineAnalyticsController;
  let service: { getHiring: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = { getHiring: jest.fn().mockResolvedValue({ funnel: [], timeToHire: {}, sources: [], jobs: [] }) };
    const moduleRef = await Test.createTestingModule({
      controllers: [PipelineAnalyticsController],
      providers: [{ provide: PipelineAnalyticsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(PipelineAnalyticsController);
  });

  it('delegates with parsed dates and jobId', async () => {
    await controller.getHiring(tenant, '2026-08-01', '2026-08-31', 'job-1');
    expect(service.getHiring).toHaveBeenCalledWith(tenant, {
      from: new Date('2026-08-01'),
      to: new Date('2026-08-31'),
      jobId: 'job-1',
    });
  });

  it('defaults to the last 90 days when from/to are omitted', async () => {
    await controller.getHiring(tenant, undefined, undefined, undefined);
    const call = service.getHiring.mock.calls[0][1];
    expect(call.jobId).toBeUndefined();
    expect(call.to.getTime() - call.from.getTime()).toBe(90 * 86_400_000);
  });

  it('throws BadRequestException on an invalid date', () => {
    expect(() => controller.getHiring(tenant, 'not-a-date', undefined, undefined)).toThrow(BadRequestException);
  });

  it('401s when JwtAuthGuard rejects', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PipelineAnalyticsController],
      providers: [{ provide: PipelineAnalyticsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RejectingGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const response = await request(app.getHttpServer()).get('/analytics/hiring');
    expect(response.status).toBe(401);
    await app.close();
  });
});
