import { CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { OrgSenderAddressesController } from './org-sender-addresses.controller';
import { OrgSenderAddressesService } from './org-sender-addresses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';

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

describe('OrgSenderAddressesController', () => {
  let controller: OrgSenderAddressesController;
  let service: {
    list: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue([{ id: 's1', label: 'Careers', address: 'careers@acme.com', isDefault: true }]),
      create: jest.fn().mockResolvedValue({ id: 's2', label: 'Talent', address: 'talent@acme.com', isDefault: false }),
      update: jest.fn().mockResolvedValue({ id: 's1', label: 'Careers Team', address: 'careers@acme.com', isDefault: true }),
      remove: jest.fn().mockResolvedValue({ success: true }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [OrgSenderAddressesController],
      providers: [{ provide: OrgSenderAddressesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(OrgSenderAddressesController);
  });

  it('GET / delegates to list', async () => {
    const res = await controller.list(tenant);
    expect(service.list).toHaveBeenCalledWith(tenant);
    expect(res).toEqual([{ id: 's1', label: 'Careers', address: 'careers@acme.com', isDefault: true }]);
  });

  it('POST / delegates to create with the dto', async () => {
    const dto = { label: 'Talent', address: 'talent@acme.com' } as any;
    const res = await controller.create(tenant, 'user-1', dto);
    expect(service.create).toHaveBeenCalledWith(tenant, 'user-1', dto);
    expect(res).toEqual({ id: 's2', label: 'Talent', address: 'talent@acme.com', isDefault: false });
  });

  it('PATCH /:id delegates to update', async () => {
    const dto = { label: 'Careers Team' } as any;
    const res = await controller.update(tenant, 'user-1', 's1', dto);
    expect(service.update).toHaveBeenCalledWith(tenant, 'user-1', 's1', dto);
    expect(res).toEqual({ id: 's1', label: 'Careers Team', address: 'careers@acme.com', isDefault: true });
  });

  it('DELETE /:id delegates to remove', async () => {
    const res = await controller.remove(tenant, 'user-1', 's1');
    expect(service.remove).toHaveBeenCalledWith(tenant, 'user-1', 's1');
    expect(res).toEqual({ success: true });
  });

  // Routes must be mounted behind JwtAuthGuard, not simply absent -- an unauthenticated
  // request should 401, not 404.
  it('is unreachable when JwtAuthGuard rejects the request', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrgSenderAddressesController],
      providers: [{ provide: OrgSenderAddressesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RejectingGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const server = app.getHttpServer();
    const response = await request(server).get('/org-sender-addresses');
    expect(response.status).toBe(401);
    await app.close();
  });

  // The guard class is applied at the controller level, but authorization itself is
  // HANDLER-ONLY -- each route must carry its own @RequirePermissions rather than relying
  // on a class-level metadata that would silently gate every current and future route the
  // same way.
  describe('permissions metadata', () => {
    const reflector = new Reflector();

    // GET is gated on pipeline:manage (recruiters use the compose picker; org_admin holds
    // pipeline:manage too, per seed.ts's ROLE_PERMISSIONS). The mutation routes stay
    // org:manage_settings-only.
    it('GET requires pipeline:manage', () => {
      expect(reflector.get(PERMISSIONS_KEY, OrgSenderAddressesController.prototype.list)).toEqual(['pipeline:manage']);
    });

    it('mutation routes require org:manage_settings', () => {
      expect(reflector.get(PERMISSIONS_KEY, OrgSenderAddressesController.prototype.create)).toEqual(['org:manage_settings']);
      expect(reflector.get(PERMISSIONS_KEY, OrgSenderAddressesController.prototype.update)).toEqual(['org:manage_settings']);
      expect(reflector.get(PERMISSIONS_KEY, OrgSenderAddressesController.prototype.remove)).toEqual(['org:manage_settings']);
    });
  });
});
