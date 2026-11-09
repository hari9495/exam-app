import { ConflictException } from '@nestjs/common';
import { assertClearForConfirmation, BGV_BEFORE_CONFIRMATION, openConfirmationChecks } from './bgv-gate';

// Answer 364: the "must be clear before confirmation" gate, by the joining that started the employment.
describe('BGV gate before confirmation', () => {
  const fake = (joinings: { id: string }[], open: number) => {
    const count = jest.fn(async () => open);
    return { tx: { preboarding: { findMany: jest.fn(async () => joinings) }, bgvCheck: { count } } as never, count };
  };

  it('counts only open before-confirmation checks of that employment’s joining (clear, cancelled and proceed pass)', async () => {
    const { tx, count } = fake([{ id: 'pb1' }], 2);
    expect(await openConfirmationChecks(tx, 'o1', 'e1')).toBe(2);
    expect(count).toHaveBeenCalledWith({ where: { organizationId: 'o1', preboardingId: { in: ['pb1'] }, gate: 'before_confirmation', status: { notIn: ['clear', 'cancelled'] }, NOT: { status: 'discrepancy', decision: 'proceed' } } });
  });

  it('an employment with no joining (imported, hired before pre-boarding) has nothing to wait for', async () => {
    const { tx, count } = fake([], 5);
    expect(await openConfirmationChecks(tx, 'o1', 'e1')).toBe(0);
    expect(count).not.toHaveBeenCalled();
  });

  it('refuses with 409 and a clear code while a check is open', async () => {
    const err = await assertClearForConfirmation(fake([{ id: 'pb1' }], 1).tx, 'o1', 'e1').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ statusCode: 409, code: BGV_BEFORE_CONFIRMATION, message: expect.stringMatching(/^A background check must be clear before confirmation/) });
    expect((await assertClearForConfirmation(fake([{ id: 'pb1' }], 3).tx, 'o1', 'e1').catch((e) => e)).getResponse().message).toMatch(/^3 background checks/);
  });

  it('passes once every such check is clear', async () => {
    await expect(assertClearForConfirmation(fake([{ id: 'pb1' }], 0).tx, 'o1', 'e1')).resolves.toBeUndefined();
  });
});
