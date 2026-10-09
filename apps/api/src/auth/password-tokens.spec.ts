import { createHash } from 'crypto';
import { issuePasswordToken } from './password-tokens';

// Founder decision, 8 Oct 2026: welcome/invite links work 72 hours, reset links 15 minutes.
describe('issuePasswordToken', () => {
  const db = () => ({ passwordResetToken: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } });
  const lifetime = (d: ReturnType<typeof db>) => {
    const { data } = d.passwordResetToken.create.mock.calls[0][0];
    return data.expiresAt.getTime() - d.passwordResetToken.updateMany.mock.calls[0][0].data.usedAt.getTime();
  };

  it('gives a set-up (welcome/invite) link 72 hours and a reset link 15 minutes', async () => {
    const setup = db();
    await issuePasswordToken(setup as never, 'u1', 'setup');
    expect(lifetime(setup)).toBe(72 * 3_600_000);
    const reset = db();
    await issuePasswordToken(reset as never, 'u1', 'reset');
    expect(lifetime(reset)).toBe(15 * 60_000);
  });

  it('stores only the hash and retires every earlier unused link for the person first', async () => {
    const d = db();
    const raw = await issuePasswordToken(d as never, 'u1', 'setup');
    expect(d.passwordResetToken.create.mock.calls[0][0].data.tokenHash).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(JSON.stringify(d.passwordResetToken.create.mock.calls)).not.toContain(raw);
    expect(d.passwordResetToken.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', usedAt: null }, data: { usedAt: expect.any(Date) } });
    expect(d.passwordResetToken.updateMany.mock.invocationCallOrder[0]).toBeLessThan(d.passwordResetToken.create.mock.invocationCallOrder[0]);
  });
});
