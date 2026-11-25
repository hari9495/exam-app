import { INVALID_CREDENTIALS, inactiveAccountError, pausedMessage } from './paused-access';

// TIM-39 Suspend at sign-in: a running block-leave pause names its last day; anything else stays "deactivated".
describe('inactiveAccountError', () => {
  const plan = jest.fn();
  const tp = { forTenant: jest.fn(async (_c: unknown, fn: (tx: unknown) => unknown) => fn({ employee: { findFirst: async () => ({ id: 'e1' }) }, blockLeavePlan: { findFirst: plan } })) } as never;
  const now = new Date('2026-11-03T06:00:00Z');

  it('paused for a block running today: the paused message with the last day', async () => {
    plan.mockResolvedValueOnce({ toOn: new Date('2026-11-07T00:00:00Z') });
    const e = await inactiveAccountError(tp, { id: 'u1', organizationId: 'o1', status: 'paused' }, now);
    expect(e.message).toBe('Your access is paused for block leave until 7 Nov 2026. Ask HR if you need access sooner.');
    expect(plan).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ accessPause: 'scheduled', fromOn: { lte: new Date('2026-11-03T00:00:00Z') }, toOn: { gte: new Date('2026-11-03T00:00:00Z') } }) }));
  });

  it('paused with no running block, deactivated, or no company: "deactivated"', async () => {
    plan.mockResolvedValueOnce(null);
    expect((await inactiveAccountError(tp, { id: 'u1', organizationId: 'o1', status: 'paused' }, now)).message).toBe(INVALID_CREDENTIALS);
    expect((await inactiveAccountError(tp, { id: 'u1', organizationId: 'o1', status: 'deactivated' }, now)).message).toBe(INVALID_CREDENTIALS);
    expect((await inactiveAccountError(tp, { id: 'u1', organizationId: null, status: 'paused' }, now)).message).toBe(INVALID_CREDENTIALS);
  });

  it('formats the day as "3 Nov 2026"', () => expect(pausedMessage(new Date('2026-11-03T00:00:00Z'))).toContain('until 3 Nov 2026.'));
});
