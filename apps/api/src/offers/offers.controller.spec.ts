import { CanActivate, ExecutionContext, StreamableFile, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { OfferTemplatesService } from './offer-templates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';

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
  let offerTemplates: { getWithDefault: jest.Mock; upsert: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    offers = {
      createOffer: jest.fn().mockResolvedValue({ id: 'offer-1' }),
      listForEntry: jest.fn().mockResolvedValue([{ id: 'offer-1' }]),
      listForCandidate: jest.fn().mockResolvedValue([{ id: 'offer-1' }]),
      previewPdf: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
    };
    offerTemplates = {
      getWithDefault: jest.fn().mockResolvedValue({ id: null, subject: 'S', body: 'B' }),
      upsert: jest.fn().mockResolvedValue({ id: 't1', subject: 'S', body: 'B' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [OffersController],
      providers: [
        { provide: OffersService, useValue: offers },
        { provide: OfferTemplatesService, useValue: offerTemplates },
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
    await controller.listForEntry(tenant, 'entry-1');
    expect(offers.listForEntry).toHaveBeenCalledWith(tenant, 'entry-1');
  });

  it('listForCandidate delegates to the service with the candidate id', async () => {
    await controller.listForCandidate(tenant, 'cand-1');
    expect(offers.listForCandidate).toHaveBeenCalledWith(tenant, 'cand-1');
  });

  it('previewPdf streams the PDF buffer as a StreamableFile with the application/pdf content type', async () => {
    const res = { set: jest.fn() };
    const result = await controller.previewPdf(tenant, 'offer-1', res as any);

    expect(offers.previewPdf).toHaveBeenCalledWith(tenant, 'offer-1');
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'application/pdf' }));
    expect(result).toBeInstanceOf(StreamableFile);
  });

  it('getTemplate delegates to OfferTemplatesService.getWithDefault', async () => {
    await controller.getTemplate(tenant);
    expect(offerTemplates.getWithDefault).toHaveBeenCalledWith(tenant);
  });

  it('upsertTemplate delegates to OfferTemplatesService.upsert with the actor and dto', async () => {
    const dto = { subject: 'S', body: 'B' };
    await controller.upsertTemplate(tenant, 'user-1', dto as any);
    expect(offerTemplates.upsert).toHaveBeenCalledWith(tenant, 'user-1', dto);
  });

  // Routes must be mounted behind JwtAuthGuard, not simply absent -- an unauthenticated
  // request should 401, not 404.
  it('is unreachable when JwtAuthGuard rejects the request', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OffersController],
      providers: [
        { provide: OffersService, useValue: offers },
        { provide: OfferTemplatesService, useValue: offerTemplates },
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
