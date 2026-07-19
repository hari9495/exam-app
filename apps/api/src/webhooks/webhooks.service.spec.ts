import { Test } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { TenantPrismaService } from '@exam-platform/shared';
import { WEBHOOK_DELIVERIES_QUEUE } from '../jobs/webhook-deliveries.queue';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let tenantPrisma: { forTenant: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    queue = { add: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: WEBHOOK_DELIVERIES_QUEUE, useValue: queue },
      ],
    }).compile();
    service = moduleRef.get(WebhooksService);
  });

  it('does nothing when the org has no webhookUrl configured', async () => {
    tenantPrisma.forTenant.mockResolvedValueOnce({ webhookUrl: null });

    await service.enqueue('org-1', 'invitation.created', { id: 'inv-1' });

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('creates a pending WebhookDelivery row and enqueues a job with retry options', async () => {
    const tx = { webhookDelivery: { create: jest.fn().mockResolvedValue({ id: 'delivery-1' }) } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce({ webhookUrl: 'https://example.com/hook' })
      .mockImplementationOnce((_ctx, fn) => fn(tx));

    await service.enqueue('org-1', 'invitation.created', { id: 'inv-1' });

    expect(tx.webhookDelivery.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', eventType: 'invitation.created', payloadJson: JSON.stringify({ id: 'inv-1' }), status: 'pending' },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'deliver',
      { deliveryId: 'delivery-1' },
      { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
    );
  });
});
