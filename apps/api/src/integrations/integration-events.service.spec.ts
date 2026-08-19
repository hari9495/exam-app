import { IntegrationEventsService } from './integration-events.service';

describe('IntegrationEventsService.emit', () => {
  let webhooks: { enqueue: jest.Mock };
  let queue: { add: jest.Mock };
  let tx: any;
  let prisma: any;

  beforeEach(() => {
    webhooks = { enqueue: jest.fn() };
    queue = { add: jest.fn() };
    tx = {
      orgIntegration: { findMany: jest.fn() },
      integrationDelivery: { create: jest.fn(async ({ data }: any) => ({ id: 'del-' + data.integrationId, ...data })) },
    };
    prisma = { forTenant: jest.fn(async (_c: unknown, fn: any) => fn(tx)) };
  });

  const svc = () => new IntegrationEventsService(prisma, webhooks as any, queue as any);

  it('always calls the existing webhook enqueue', async () => {
    tx.orgIntegration.findMany.mockResolvedValue([]);
    await svc().emit('o1', 'attempt.settled', { subject: 'A', linkPath: '/x' });
    expect(webhooks.enqueue).toHaveBeenCalledWith('o1', 'attempt.settled', { subject: 'A', linkPath: '/x' });
  });

  it('enqueues one delivery per active integration subscribed to the event', async () => {
    tx.orgIntegration.findMany.mockResolvedValue([
      { id: 'i1', events: JSON.stringify(['attempt.settled', 'invitation.created']) },
      { id: 'i2', events: JSON.stringify(['invitation.created']) },       // not subscribed
      { id: 'i3', events: JSON.stringify(['attempt.settled']) },
    ]);
    await svc().emit('o1', 'attempt.settled', { subject: 'A', linkPath: '/x' });
    // findMany already filters status:'active'; event-subset filtered in code
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith('deliver', expect.objectContaining({ deliveryId: 'del-i1', eventType: 'attempt.settled' }), expect.objectContaining({ attempts: 3 }));
    expect(queue.add).toHaveBeenCalledWith('deliver', expect.objectContaining({ deliveryId: 'del-i3' }), expect.anything());
  });

  it('no active integrations -> no delivery jobs, webhook still fires', async () => {
    tx.orgIntegration.findMany.mockResolvedValue([]);
    await svc().emit('o1', 'candidate.applied', { subject: 'A', linkPath: '/x' });
    expect(queue.add).not.toHaveBeenCalled();
    expect(webhooks.enqueue).toHaveBeenCalled();
  });
});
