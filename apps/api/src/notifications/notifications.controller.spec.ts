import { CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

class MockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

class RejectingGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    throw new UnauthorizedException();
  }
}

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: { getPreferences: jest.Mock; setPreference: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      getPreferences: jest.fn().mockResolvedValue([{ type: 'mention', group: 'general', label: 'Mentions', emailEnabled: true }]),
      setPreference: jest.fn().mockResolvedValue({ success: true }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(NotificationsController);
  });

  it('getPreferences delegates to service.getPreferences(tenant, userId)', async () => {
    const result = await controller.getPreferences(tenant, 'user-1');
    expect(service.getPreferences).toHaveBeenCalledWith(tenant, 'user-1');
    expect(result).toEqual([{ type: 'mention', group: 'general', label: 'Mentions', emailEnabled: true }]);
  });

  it('updatePreference delegates to service.setPreference(tenant, userId, dto.type, dto.emailEnabled)', async () => {
    const result = await controller.updatePreference(tenant, 'user-1', { type: 'mention', emailEnabled: false });
    expect(service.setPreference).toHaveBeenCalledWith(tenant, 'user-1', 'mention', false);
    expect(result).toEqual({ success: true });
  });

  // Routes must be mounted behind JwtAuthGuard, not simply absent -- an unauthenticated
  // request should 401, not 404.
  it('is unreachable when JwtAuthGuard rejects the request', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RejectingGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const server = app.getHttpServer();
    const response = await request(server).get('/notifications/preferences');
    expect(response.status).toBe(401);
    await app.close();
  });
});
