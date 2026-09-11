import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { ApiUsageService } from '../api-usage/api-usage.service';

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
      providers: [
        { provide: OrganizationsService, useValue: service },
        { provide: ApiUsageService, useValue: {} },
      ],
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

describe('OrganizationsController api-usage', () => {
  let controller: OrganizationsController;
  let apiUsage: { report: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    apiUsage = { report: jest.fn().mockResolvedValue({ window: 30, totals: { requests: 0, throttled: 0 }, byEndpoint: [], byDay: [] }) };
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: OrganizationsService, useValue: {} },
        { provide: ApiUsageService, useValue: apiUsage },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(OrganizationsController);
  });

  it('GET /organizations/api-usage delegates to ApiUsageService.report with default window 30', async () => {
    const result = await controller.getApiUsage(tenant, {});
    expect(apiUsage.report).toHaveBeenCalledWith(tenant, 30);
    expect(result).toEqual({ window: 30, totals: { requests: 0, throttled: 0 }, byEndpoint: [], byDay: [] });
  });

  it('GET /organizations/api-usage passes an explicit window through', async () => {
    await controller.getApiUsage(tenant, { window: 90 });
    expect(apiUsage.report).toHaveBeenCalledWith(tenant, 90);
  });

  it('gates the api-usage getter behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.getApiUsage);
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
      providers: [
        { provide: OrganizationsService, useValue: service },
        { provide: ApiUsageService, useValue: {} },
      ],
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

describe('OrganizationsController careers', () => {
  let controller: OrganizationsController;
  let service: { getCareers: jest.Mock; setCareers: jest.Mock; uploadCareersBanner: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      getCareers: jest.fn().mockResolvedValue({ enabled: false, headline: null, intro: null, bannerUrl: null }),
      setCareers: jest.fn().mockResolvedValue({ enabled: true, headline: 'Join us', intro: null, bannerUrl: null }),
      uploadCareersBanner: jest.fn().mockResolvedValue({ bannerUrl: 'https://example.com/banner.png' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: OrganizationsService, useValue: service },
        { provide: ApiUsageService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(OrganizationsController);
  });

  it('GET /organizations/careers delegates to getCareers', async () => {
    const result = await controller.getCareers(tenant);
    expect(service.getCareers).toHaveBeenCalledWith(tenant);
    expect(result).toEqual({ enabled: false, headline: null, intro: null, bannerUrl: null });
  });

  it('PUT /organizations/careers delegates to setCareers', async () => {
    const dto = { enabled: true, headline: 'Join us' };
    const result = await controller.setCareers(tenant, 'user-1', dto as any);
    expect(service.setCareers).toHaveBeenCalledWith(tenant, 'user-1', dto);
    expect(result).toEqual({ enabled: true, headline: 'Join us', intro: null, bannerUrl: null });
  });

  it('POST /organizations/careers/banner delegates to uploadCareersBanner', async () => {
    const file = { mimetype: 'image/png', size: 1024, buffer: Buffer.from('x') } as Express.Multer.File;
    const result = await controller.uploadCareersBanner(tenant, 'user-1', file);
    expect(service.uploadCareersBanner).toHaveBeenCalledWith(tenant, 'user-1', file);
    expect(result).toEqual({ bannerUrl: 'https://example.com/banner.png' });
  });

  it('gates the getter behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.getCareers);
    expect(permissions).toEqual(['org:manage_settings']);
  });

  it('gates the setter behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.setCareers);
    expect(permissions).toEqual(['org:manage_settings']);
  });

  it('gates the banner upload behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.uploadCareersBanner);
    expect(permissions).toEqual(['org:manage_settings']);
  });
});

describe('OrganizationsController sms-config', () => {
  let controller: OrganizationsController;
  let service: { getSmsConfig: jest.Mock; putSmsConfig: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      getSmsConfig: jest.fn().mockResolvedValue({ smsEnabled: false, smsProvider: 'twilio', configured: false, config: {} }),
      putSmsConfig: jest.fn().mockResolvedValue({
        smsEnabled: true,
        smsProvider: 'twilio',
        configured: true,
        config: { accountSid: 'AC123', from: '+15551234567' },
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: OrganizationsService, useValue: service },
        { provide: ApiUsageService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(OrganizationsController);
  });

  it('GET /organizations/sms-config delegates to getSmsConfig and never surfaces a secret', async () => {
    const result = await controller.getSmsConfig(tenant);
    expect(service.getSmsConfig).toHaveBeenCalledWith(tenant);
    expect(result).toEqual({ smsEnabled: false, smsProvider: 'twilio', configured: false, config: {} });
    expect(JSON.stringify(result)).not.toMatch(/authToken|authHeader/i);
  });

  it('PUT /organizations/sms-config delegates to putSmsConfig and never surfaces a secret', async () => {
    const dto = { smsEnabled: true, smsProvider: 'twilio', config: { accountSid: 'AC123', from: '+15551234567', authToken: 'secret-token' } };
    const result = await controller.putSmsConfig(tenant, 'user-1', dto);
    expect(service.putSmsConfig).toHaveBeenCalledWith(tenant, 'user-1', dto);
    expect(result).toEqual({
      smsEnabled: true,
      smsProvider: 'twilio',
      configured: true,
      config: { accountSid: 'AC123', from: '+15551234567' },
    });
    expect(JSON.stringify(result)).not.toContain('secret-token');
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

describe('OrganizationsController sms-providers catalog', () => {
  let controller: OrganizationsController;
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: OrganizationsService, useValue: {} },
        { provide: ApiUsageService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(OrganizationsController);
  });

  it('GET /organizations/sms-providers returns id/label/configFields metadata only, no secrets', () => {
    const result = controller.getSmsProviders();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    for (const entry of result) {
      expect(Object.keys(entry).sort()).toEqual(['configFields', 'id', 'label']);
    }
    const twilio = result.find((p: any) => p.id === 'twilio');
    expect(twilio).toBeDefined();
    expect(twilio!.label).toBe('Twilio');
    expect(twilio!.configFields.some((f: any) => f.key === 'authToken' && f.secret === true)).toBe(true);
  });

  it('gates sms-providers behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.getSmsProviders);
    expect(permissions).toEqual(['org:manage_settings']);
  });
});

describe('OrganizationsController whatsapp-config', () => {
  let controller: OrganizationsController;
  let service: { getWhatsappConfig: jest.Mock; putWhatsappConfig: jest.Mock; getWhatsappProviderCatalog: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      getWhatsappConfig: jest.fn().mockResolvedValue({
        whatsappEnabled: false,
        whatsappProvider: 'twilio',
        configured: false,
        config: {},
      }),
      putWhatsappConfig: jest.fn().mockResolvedValue({
        whatsappEnabled: true,
        whatsappProvider: 'twilio',
        configured: true,
        config: { accountSid: 'AC123' },
      }),
      getWhatsappProviderCatalog: jest.fn().mockReturnValue([
        { id: 'twilio', label: 'Twilio WhatsApp', configFields: [] },
        { id: 'http', label: 'Generic HTTP', configFields: [] },
      ]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: OrganizationsService, useValue: service },
        { provide: ApiUsageService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(OrganizationsController);
  });

  it('GET /organizations/whatsapp-config delegates to getWhatsappConfig and never carries a secret', async () => {
    const result = await controller.getWhatsappConfig(tenant);
    expect(service.getWhatsappConfig).toHaveBeenCalledWith(tenant);
    expect(JSON.stringify(result)).not.toMatch(/authToken|authHeader/);
  });

  it('PUT /organizations/whatsapp-config delegates to putWhatsappConfig', async () => {
    const dto = { config: { accountSid: 'AC123' } } as any;
    const result = await controller.updateWhatsappConfig(tenant, 'user-1', dto);
    expect(service.putWhatsappConfig).toHaveBeenCalledWith(tenant, 'user-1', dto);
    expect(result).toEqual({ whatsappEnabled: true, whatsappProvider: 'twilio', configured: true, config: { accountSid: 'AC123' } });
  });

  it('GET /organizations/whatsapp-providers delegates to getWhatsappProviderCatalog with no args', () => {
    const result = controller.getWhatsappProviders();
    expect(service.getWhatsappProviderCatalog).toHaveBeenCalledWith();
    expect(result).toEqual([
      { id: 'twilio', label: 'Twilio WhatsApp', configFields: [] },
      { id: 'http', label: 'Generic HTTP', configFields: [] },
    ]);
  });

  it('gates the config getter behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.getWhatsappConfig);
    expect(permissions).toEqual(['org:manage_settings']);
  });

  it('gates the config setter behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.updateWhatsappConfig);
    expect(permissions).toEqual(['org:manage_settings']);
  });

  it('gates the provider catalog behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrganizationsController.prototype.getWhatsappProviders);
    expect(permissions).toEqual(['org:manage_settings']);
  });
});
