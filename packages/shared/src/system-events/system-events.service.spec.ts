import { Test } from '@nestjs/testing';
import { SystemEventsService } from './system-events.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('SystemEventsService', () => {
  let service: SystemEventsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let create: jest.Mock;

  beforeEach(async () => {
    create = jest.fn();
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_ctx, fn) => fn({ systemEvent: { create } })) };
    const moduleRef = await Test.createTestingModule({
      providers: [SystemEventsService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(SystemEventsService);
  });

  it('writes the event under a super-admin context so NULL-org platform events pass the RLS insert block', async () => {
    await service.record({ organizationId: null, service: 'api', severity: 'error', message: 'boom' });

    expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
    expect(create).toHaveBeenCalledWith({
      data: { organizationId: null, service: 'api', severity: 'error', message: 'boom', contextJson: null },
    });
  });

  it('stores the org id on the row and serializes context to JSON', async () => {
    await service.record({
      organizationId: 'org-1',
      service: 'candidate-browser',
      severity: 'warn',
      message: 'answer save failed',
      context: { attemptId: 'a-1', route: '/attempt/answer' },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        contextJson: JSON.stringify({ attemptId: 'a-1', route: '/attempt/answer' }),
      }),
    });
  });

  it('truncates messages beyond the 2000-char column cap instead of failing the insert', async () => {
    await service.record({ organizationId: null, service: 'api', severity: 'error', message: 'x'.repeat(5000) });

    const written = create.mock.calls[0][0].data.message;
    expect(written.length).toBe(2000);
    expect(written.endsWith('…')).toBe(true);
  });

  it('never throws when the database write fails', async () => {
    tenantPrisma.forTenant.mockRejectedValue(new Error('db down'));

    await expect(
      service.record({ organizationId: null, service: 'api', severity: 'error', message: 'boom' }),
    ).resolves.toBeUndefined();
  });
});
