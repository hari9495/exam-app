import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { InternalController } from './internal.controller';
import { IntegrationEventsService } from '../integrations/integration-events.service';
import { DispatchWebhookDto } from './dto/dispatch-webhook.dto';

describe('InternalController', () => {
  let controller: InternalController;
  let integrationEvents: { emit: jest.Mock };

  beforeEach(async () => {
    integrationEvents = { emit: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [InternalController],
      providers: [{ provide: IntegrationEventsService, useValue: integrationEvents }],
    }).compile();
    controller = moduleRef.get(InternalController);
  });

  it('delegates to IntegrationEventsService.emit with the request body fields', async () => {
    await controller.dispatch({ organizationId: 'org-1', eventType: 'attempt.settled', data: { attemptId: 'attempt-1' } });

    expect(integrationEvents.emit).toHaveBeenCalledWith('org-1', 'attempt.settled', { attemptId: 'attempt-1' });
  });
});

describe('DispatchWebhookDto', () => {
  function errorsFor(payload: Record<string, unknown>): string[] {
    const dto = plainToInstance(DispatchWebhookDto, payload);
    return validateSync(dto).flatMap((error) => Object.values(error.constraints ?? {}));
  }

  it.each(['attempt.submitted', 'attempt.settled', 'integrity.flagged'])(
    'accepts eventType %p',
    (eventType) => {
      expect(errorsFor({ organizationId: 'org-1', eventType, data: {} })).toEqual([]);
    },
  );

  it('rejects an unknown eventType', () => {
    expect(errorsFor({ organizationId: 'org-1', eventType: 'foo.bar', data: {} }).length).toBeGreaterThan(0);
  });
});
