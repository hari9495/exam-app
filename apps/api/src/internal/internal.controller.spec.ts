import { Test } from '@nestjs/testing';
import { InternalController } from './internal.controller';
import { WebhooksService } from '../webhooks/webhooks.service';

describe('InternalController', () => {
  let controller: InternalController;
  let webhooksService: { enqueue: jest.Mock };

  beforeEach(async () => {
    webhooksService = { enqueue: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [InternalController],
      providers: [{ provide: WebhooksService, useValue: webhooksService }],
    }).compile();
    controller = moduleRef.get(InternalController);
  });

  it('delegates to WebhooksService.enqueue with the request body fields', async () => {
    await controller.dispatch({ organizationId: 'org-1', eventType: 'attempt.settled', data: { attemptId: 'attempt-1' } });

    expect(webhooksService.enqueue).toHaveBeenCalledWith('org-1', 'attempt.settled', { attemptId: 'attempt-1' });
  });
});
