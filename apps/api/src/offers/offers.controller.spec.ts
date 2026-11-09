import { CanActivate, ExecutionContext, StreamableFile, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { OfferTemplatesService } from './offer-templates.service';
import { OfferBuilderService } from './offer-builder.service';
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

describe('OffersController', () => {
  let controller: OffersController;
  let offers: { createOffer: jest.Mock; listForEntry: jest.Mock; listForCandidate: jest.Mock; previewPdf: jest.Mock };
  let offerTemplates: { list: jest.Mock; getDefault: jest.Mock; create: jest.Mock; update: jest.Mock; remove: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;
  const req = { user: { userId: 'user-1' } } as any;
  let builder: { canSeePay: jest.Mock; submit: jest.Mock; cancelApproval: jest.Mock };

  beforeEach(async () => {
    builder = { canSeePay: jest.fn().mockResolvedValue(true), submit: jest.fn(), cancelApproval: jest.fn() };
    offers = {
      createOffer: jest.fn().mockResolvedValue({ id: 'offer-1' }),
      listForEntry: jest.fn().mockResolvedValue([{ id: 'offer-1' }]),
      listForCandidate: jest.fn().mockResolvedValue([{ id: 'offer-1' }]),
      previewPdf: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
    };
    offerTemplates = {
      list: jest.fn().mockResolvedValue([{ id: 't1', subject: 'S', body: 'B' }]),
      getDefault: jest.fn().mockResolvedValue({ id: null, subject: 'S', body: 'B' }),
      create: jest.fn().mockResolvedValue({ id: 't1', subject: 'S', body: 'B' }),
      update: jest.fn().mockResolvedValue({ id: 't1', subject: 'S2', body: 'B2' }),
      remove: jest.fn().mockResolvedValue({ success: true }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [OffersController],
      providers: [
        { provide: OffersService, useValue: offers },
        { provide: OfferTemplatesService, useValue: offerTemplates },
        { provide: OfferBuilderService, useValue: builder },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(OffersController);
  });

  it('createOffer delegates to the service with the actor, entry id, and dto', async () => {
    const dto = { compensation: '100k', startDate: '2026-09-01', expiresAt: '2026-09-15' };
    await controller.createOffer(tenant, 'user-1', 'entry-1', dto as any);
    expect(offers.createOffer).toHaveBeenCalledWith(tenant, 'user-1', 'entry-1', dto);
  });

  it('listForEntry delegates to the service with the entry id', async () => {
    await controller.listForEntry(tenant, 'entry-1', req);
    expect(offers.listForEntry).toHaveBeenCalledWith(tenant, 'entry-1');
  });

  it('listForCandidate delegates to the service with the candidate id', async () => {
    await controller.listForCandidate(tenant, 'cand-1', req);
    expect(offers.listForCandidate).toHaveBeenCalledWith(tenant, 'cand-1');
  });

  it('previewPdf streams the PDF buffer as a StreamableFile with the application/pdf content type', async () => {
    const res = { set: jest.fn() };
    const result = await controller.previewPdf(tenant, 'offer-1', res as any, req);

    expect(offers.previewPdf).toHaveBeenCalledWith(tenant, 'offer-1');
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'application/pdf' }));
    expect(result).toBeInstanceOf(StreamableFile);
  });

  it('createOffer with a templateId passes it through to the service', async () => {
    const dto = { compensation: '100k', startDate: '2026-09-01', expiresAt: '2026-09-15', templateId: 'tmpl-1' };
    await controller.createOffer(tenant, 'user-1', 'entry-1', dto as any);
    expect(offers.createOffer).toHaveBeenCalledWith(tenant, 'user-1', 'entry-1', dto);
  });

  it('hides offer pay from people without ats.offer.compensation.view (HIR-09)', async () => {
    builder.canSeePay.mockResolvedValue(false);
    offers.listForEntry.mockResolvedValue([{ id: 'offer-1', compensation: 'Fixed CTC' }]);
    expect(await controller.listForEntry(tenant, 'entry-1', req)).toEqual([{ id: 'offer-1', compensation: null }]);
    await expect(controller.previewPdf(tenant, 'offer-1', { set: jest.fn() } as any, req)).rejects.toThrow('ats.offer.compensation.view');
  });

  it('submit goes to the P03 offer route and is refused while acting for someone else (HIR-09)', async () => {
    await controller.submitOffer(tenant, 'user-1', 'offer-1', req);
    expect(builder.submit).toHaveBeenCalledWith(tenant, 'user-1', 'offer-1');
    expect(() => controller.submitOffer(tenant, 'user-1', 'offer-1', { user: { impersonatorUserId: 'x' } } as any)).toThrow('acting for someone else');
  });

  it('listTemplates delegates to OfferTemplatesService.list', async () => {
    await controller.listTemplates(tenant);
    expect(offerTemplates.list).toHaveBeenCalledWith(tenant);
  });

  it('getDefaultTemplate delegates to OfferTemplatesService.getDefault', async () => {
    await controller.getDefaultTemplate(tenant);
    expect(offerTemplates.getDefault).toHaveBeenCalledWith(tenant);
  });

  it('createTemplate delegates to OfferTemplatesService.create with the actor and dto', async () => {
    const dto = { name: 'Standard', subject: 'S', body: 'B' };
    await controller.createTemplate(tenant, 'user-1', dto as any);
    expect(offerTemplates.create).toHaveBeenCalledWith(tenant, 'user-1', dto);
  });

  it('updateTemplate delegates to OfferTemplatesService.update with the actor, id, and dto', async () => {
    const dto = { subject: 'S2' };
    await controller.updateTemplate(tenant, 'user-1', 't1', dto as any);
    expect(offerTemplates.update).toHaveBeenCalledWith(tenant, 'user-1', 't1', dto);
  });

  it('removeTemplate delegates to OfferTemplatesService.remove with the actor and id', async () => {
    await controller.removeTemplate(tenant, 'user-1', 't1');
    expect(offerTemplates.remove).toHaveBeenCalledWith(tenant, 'user-1', 't1');
  });

  it('every offer-template route carries the same pipeline:manage permission as the other offer routes', () => {
    const reflector = new Reflector();
    expect(reflector.get(PERMISSIONS_KEY, OffersController.prototype.listTemplates)).toEqual(['pipeline:manage']);
    expect(reflector.get(PERMISSIONS_KEY, OffersController.prototype.getDefaultTemplate)).toEqual(['pipeline:manage']);
    expect(reflector.get(PERMISSIONS_KEY, OffersController.prototype.createTemplate)).toEqual(['pipeline:manage']);
    expect(reflector.get(PERMISSIONS_KEY, OffersController.prototype.updateTemplate)).toEqual(['pipeline:manage']);
    expect(reflector.get(PERMISSIONS_KEY, OffersController.prototype.removeTemplate)).toEqual(['pipeline:manage']);
  });

  // Routes must be mounted behind JwtAuthGuard, not simply absent -- an unauthenticated
  // request should 401, not 404.
  it('is unreachable when JwtAuthGuard rejects the request', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OffersController],
      providers: [
        { provide: OffersService, useValue: offers },
        { provide: OfferTemplatesService, useValue: offerTemplates },
        { provide: OfferBuilderService, useValue: builder },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RejectingGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const server = app.getHttpServer();
    const response = await request(server).get('/candidates/cand-1/offers');
    expect(response.status).toBe(401);
    await app.close();
  });
});
