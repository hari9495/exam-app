import { BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { DEFAULT_SECURITY_POLICY, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { BREACHED_PASSWORD_MESSAGE, PasswordPolicyService } from './password-policy.service';

// YX-IAM-08 / Q8: >= 12 (or the company's stricter minimum), <= 128, not breached, argon2id.
describe('PasswordPolicyService', () => {
  const BREACHED = 'password1234';
  const EMOJI = '\u{1F600}';
  const sha1 = (p: string) => createHash('sha1').update(p).digest('hex').toUpperCase();
  let fetchMock: jest.SpyInstance;
  let tx: { tenantSecurityPolicy: { findUnique: jest.Mock }; user: { update: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let email: { send: jest.Mock };
  let service: PasswordPolicyService;

  // A padded HIBP range response: the breached suffix (when asked for its prefix) plus padding rows.
  const rangeFor = (url: string) => {
    const prefix = url.slice(-5);
    const rows = ['0000000000000000000000000000000000A:0', '0000000000000000000000000000000000B:0'];
    if (sha1(BREACHED).startsWith(prefix)) rows.push(`${sha1(BREACHED).slice(5)}:24230577`);
    return rows.join('\r\n');
  };

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => new Response(rangeFor(String(url))));
    tx = { tenantSecurityPolicy: { findUnique: jest.fn().mockResolvedValue(null) }, user: { update: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) };
    audit = { record: jest.fn() };
    email = { send: jest.fn().mockResolvedValue({}) };
    service = new PasswordPolicyService(tenantPrisma as any, audit as any, email as any);
    invalidateTenantSecurityPolicy('org-1');
  });
  afterEach(() => fetchMock.mockRestore());

  describe('hashNewPassword', () => {
    it('accepts a 12-character password and hashes it with argon2id', async () => {
      const result = await service.hashNewPassword('kite-mango-7', null);
      expect(result.passwordRecheckPending).toBe(false);
      expect(result.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(await argon2.verify(result.passwordHash, 'kite-mango-7')).toBe(true);
    });

    it('rejects anything shorter than the 12-character floor, without calling the breach service', async () => {
      await expect(service.hashNewPassword('kite-mango7', null)).rejects.toThrow('at least 12 characters');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("applies the company's stricter minimum", async () => {
      tx.tenantSecurityPolicy.findUnique.mockResolvedValue({ ...DEFAULT_SECURITY_POLICY, passwordMinLength: 16, organizationId: 'org-1' });
      await expect(service.hashNewPassword('kite-mango-tree', 'org-1')).rejects.toThrow('at least 16 characters');
      await expect(service.hashNewPassword('kite-mango-trees', 'org-1')).resolves.toBeDefined();
    });

    it('counts characters, not UTF-16 units (an emoji is one character)', async () => {
      await expect(service.hashNewPassword(EMOJI.repeat(11), null)).rejects.toThrow(BadRequestException);
      await expect(service.hashNewPassword(EMOJI.repeat(12), null)).resolves.toBeDefined();
    });

    it('rejects more than 128 characters', async () => {
      await expect(service.hashNewPassword('a'.repeat(129), null)).rejects.toThrow('at most 128');
    });

    it('rejects a password found in the breach corpus', async () => {
      await expect(service.hashNewPassword(BREACHED, null)).rejects.toThrow(BREACHED_PASSWORD_MESSAGE);
    });

    it('sends only the 5-character SHA-1 prefix, with response padding, never the password or full hash', async () => {
      await service.hashNewPassword('kite-mango-7', null);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1('kite-mango-7').slice(0, 5)}`);
      expect(String(url)).not.toContain('kite');
      expect(String(url)).not.toContain(sha1('kite-mango-7').slice(5));
      expect(init.headers).toEqual(expect.objectContaining({ 'Add-Padding': 'true' }));
      expect(init.signal).toBeDefined(); // bounded by a timeout
    });

    it('does not treat a padding row (count 0) as a match', async () => {
      fetchMock.mockImplementation(async () => new Response(`${sha1('kite-mango-7').slice(5)}:0`));
      await expect(service.hashNewPassword('kite-mango-7', null)).resolves.toEqual(expect.objectContaining({ passwordRecheckPending: false }));
    });

    it.each([
      ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
      ['a timeout', () => Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))],
      ['an HTTP error', () => Promise.resolve(new Response('busy', { status: 503 }))],
    ])('fails open but flags the account for re-check on %s', async (_label, impl) => {
      fetchMock.mockImplementation(impl as never);
      await expect(service.hashNewPassword('kite-mango-7', null)).resolves.toEqual(expect.objectContaining({ passwordRecheckPending: true }));
    });

    it('still enforces length while the breach service is down', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      await expect(service.hashNewPassword('short', null)).rejects.toThrow(BadRequestException);
    });
  });

  // ASVS V2.1.7: the check fails open (an outage must not lock people out of resets), so a
  // lasting outage is an incident -- an error-level alert, not just a warning per request.
  describe('breach-service outage', () => {
    it('alerts (error) once the outage has lasted 15 minutes, not before, and not on every request', async () => {
      const error = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
      jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      const now = jest.spyOn(Date, 'now');
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      now.mockReturnValue(1_000_000);
      expect(await service.isBreached('kite-mango-7')).toBeNull();
      now.mockReturnValue(1_000_000 + 14 * 60_000);
      await service.isBreached('kite-mango-7');
      expect(error).not.toHaveBeenCalled();
      now.mockReturnValue(1_000_000 + 15 * 60_000);
      await service.isBreached('kite-mango-7');
      await service.isBreached('kite-mango-7');
      expect(error).toHaveBeenCalledTimes(1);

      // Recovery resets it.
      fetchMock.mockImplementation(async (url) => new Response(rangeFor(String(url))));
      await service.isBreached('kite-mango-7');
      expect((service as any).unavailableSince).toBeNull();
      now.mockRestore();
    });
  });

  describe('recheckAfterLogin', () => {
    const USER = { id: 'user-1', email: 'u@x.test', organizationId: 'org-1', role: 'recruiter' };

    it('clears the flag when the password is clean, and tells nobody', async () => {
      await service.recheckAfterLogin(USER, 'kite-mango-7');
      expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' }, data: { passwordRecheckPending: false, passwordChangeRequired: false } }));
      expect(email.send).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    // Regression: a breached password found on re-check used to get only an email; it is now
    // marked so the next sign-in must change it (YX-IAM-08, ASVS V2.1.7).
    it('requires a password change at next sign-in, audits and emails the user when the password is breached', async () => {
      await service.recheckAfterLogin(USER, BREACHED);
      expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' }, data: { passwordRecheckPending: false, passwordChangeRequired: true } }));
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        expect.objectContaining({ action: 'password.breached_on_recheck', entityId: 'user-1' }),
      );
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'u@x.test', subject: 'Change your YukthiX password', text: expect.stringContaining('known data breach') }));
    });

    it('keeps the flag while the service is still down, and never throws', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      await expect(service.recheckAfterLogin(USER, BREACHED)).resolves.toBeUndefined();
      expect(tx.user.update).not.toHaveBeenCalled();
      tenantPrisma.forTenant.mockRejectedValue(new Error('db down'));
      fetchMock.mockImplementation(async (url) => new Response(rangeFor(String(url))));
      await expect(service.recheckAfterLogin(USER, BREACHED)).resolves.toBeUndefined();
    });
  });
});
