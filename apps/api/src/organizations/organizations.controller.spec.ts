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
  let service: {
    getPipelineSettings: jest.Mock;
    updatePipelineSettings: jest.Mock;
    getBusinessHours: jest.Mock;
    updateBusinessHours: jest.Mock;
  };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      getPipelineSettings: jest.fn().mockResolvedValue({ autoArchiveSiblingsOnHire: true }),
      updatePipelineSettings: jest.fn().mockResolvedValue({ autoArchiveSiblingsOnHire: false }),
      getBusinessHours: jest.fn().mockResolvedValue({ businessHours: null, holidays: [] }),
      updateBusinessHours: jest.fn().mockResolvedValue({ businessHours: null, holidays: [] }),
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

  it('GET /organizations/business-hours delegates to getBusinessHours', async () => {
    const result = await controller.getBusinessHours(tenant);
    expect(service.getBusinessHours).toHaveBeenCalledWith(tenant);
    expect(result).toEqual({ businessHours: null, holidays: [] });
  });

  it('PATCH /organizations/business-hours delegates to updateBusinessHours', async () => {
    const dto = { businessHours: null, holidays: [] } as any;
    const result = await controller.updateBusinessHours(tenant, 'user-1', dto);
    expect(service.updateBusinessHours).toHaveBeenCalledWith(tenant, 'user-1', dto);
    expect(result).toEqual({ businessHours: null, holidays: [] });
  });

  // The recruiter slot picker reads this GET as any authenticated user -- unlike every
  // other settings route, it deliberately carries no @RequirePermissions (same precedent
  // as getBranding above it in the controller).
  it('has NO permission guard on the business-hours getter', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.getBusinessHours);
    expect(permissions).toBeUndefined();
  });

  it('gates the business-hours setter behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.updateBusinessHours);
    expect(permissions).toEqual(['org:manage_settings']);
  });
});

describe('OrganizationsController apply-consent', () => {
  let controller: OrganizationsController;
  let service: { getApplyConsent: jest.Mock; setApplyConsent: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      getApplyConsent: jest.fn().mockResolvedValue({ text: null, version: 1 }),
      setApplyConsent: jest.fn().mockResolvedValue({ text: 'I agree', version: 2 }),
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

  it('GET /organizations/apply-consent delegates to getApplyConsent', async () => {
    const result = await controller.getApplyConsent(tenant);
    expect(service.getApplyConsent).toHaveBeenCalledWith(tenant);
    expect(result).toEqual({ text: null, version: 1 });
  });

  it('PUT /organizations/apply-consent delegates to setApplyConsent', async () => {
    const dto = { text: 'I agree' };
    const result = await controller.updateApplyConsent(tenant, 'user-1', dto);
    expect(service.setApplyConsent).toHaveBeenCalledWith(tenant, 'user-1', dto);
    expect(result).toEqual({ text: 'I agree', version: 2 });
  });

  it('gates the getter behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.getApplyConsent);
    expect(permissions).toEqual(['org:manage_settings']);
  });

  it('gates the setter behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.updateApplyConsent);
    expect(permissions).toEqual(['org:manage_settings']);
  });
});

describe('OrganizationsController sms-config', () => {
  let controller: OrganizationsController;
  let service: { getSmsConfig: jest.Mock; putSmsConfig: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      getSmsConfig: jest.fn().mockResolvedValue({ smsEnabled: false, smsAccountSid: null, smsFromNumber: null, configured: false }),
      putSmsConfig: jest.fn().mockResolvedValue({ smsEnabled: true, smsAccountSid: 'AC123', smsFromNumber: '+15551234567', configured: true }),
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

  it('GET /organizations/sms-config delegates to getSmsConfig and never surfaces the token', async () => {
    const result = await controller.getSmsConfig(tenant);
    expect(service.getSmsConfig).toHaveBeenCalledWith(tenant);
    expect(result).toEqual({ smsEnabled: false, smsAccountSid: null, smsFromNumber: null, configured: false });
    expect(result).not.toHaveProperty('smsAuthToken');
    expect(result).not.toHaveProperty('smsAuthTokenEncrypted');
  });

  it('PUT /organizations/sms-config delegates to putSmsConfig', async () => {
    const dto = { smsEnabled: true, smsAccountSid: 'AC123', smsFromNumber: '+15551234567', smsAuthToken: 'secret-token' };
    const result = await controller.putSmsConfig(tenant, 'user-1', dto);
    expect(service.putSmsConfig).toHaveBeenCalledWith(tenant, 'user-1', dto);
    expect(result).toEqual({ smsEnabled: true, smsAccountSid: 'AC123', smsFromNumber: '+15551234567', configured: true });
    expect(result).not.toHaveProperty('smsAuthToken');
  });

  it('gates the getter behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.getSmsConfig);
    expect(permissions).toEqual(['org:manage_settings']);
  });

  it('gates the setter behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.putSmsConfig);
    expect(permissions).toEqual(['org:manage_settings']);
  });
});
