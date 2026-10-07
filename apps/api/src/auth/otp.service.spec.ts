import { ServiceUnavailableException } from '@nestjs/common';
import { OrgSecretsCryptoService } from '@exam-platform/shared';
import { OtpService, TooManyOtpRequestsException, maskMobile, normaliseMobileNumber, parseOtpIdentifier } from './otp.service';
import { OtpMobileChannel, OtpSmsRequest, OtpSmsResult } from './otp-sender';

// Pure parts and failure modes. The Redis-backed behaviour (single use, attempt limit, expiry,
// cooldown, hourly caps) is proven against real Redis in test/otp-sign-in.e2e-spec.ts.
describe('one-time codes (P12 §3, M04 Q2)', () => {
  describe('parseOtpIdentifier / normaliseMobileNumber', () => {
    it('lower-cases and trims emails', () => {
      expect(parseOtpIdentifier('  Field.Worker@Plant.Example ')).toEqual({ kind: 'email', value: 'field.worker@plant.example' });
    });

    it('normalises Indian mobile numbers written any usual way to E.164', () => {
      for (const raw of ['9876543210', '09876543210', '+91 98765 43210', '+91-98765-43210', '(+91) 98765 43210']) {
        expect(parseOtpIdentifier(raw)).toEqual({ kind: 'mobile', value: '+919876543210' });
      }
      expect(normaliseMobileNumber('+44 7400 123456')).toBe('+447400123456');
    });

    it('rejects garbage, too-short numbers and landlines (a code cannot be texted there)', () => {
      expect(parseOtpIdentifier('hello')).toBeNull();
      expect(parseOtpIdentifier('a@b')).toBeNull();
      expect(parseOtpIdentifier('12345')).toBeNull();
      expect(normaliseMobileNumber('+91 11 2345 6789')).toBeNull(); // Delhi landline
      expect(parseOtpIdentifier(`${'a'.repeat(320)}@x.io`)).toBeNull();
    });

    it('masks all but the country code and the last two digits', () => {
      expect(maskMobile('+919876543210')).toBe('+91••••••••10');
    });
  });

  describe('OtpService', () => {
    const crypto = new OrgSecretsCryptoService();
    const email = { send: jest.fn().mockResolvedValue({ success: true }) };
    let result: OtpSmsResult;
    const sent: OtpSmsRequest[] = [];
    const sms = {
      channels: new Set<OtpMobileChannel>(['sms', 'whatsapp']),
      sent,
      routable: jest.fn(async (_channel: OtpMobileChannel, organizationId: string | null) => organizationId !== 'org-without-sms'),
      send: jest.fn(async (req: OtpSmsRequest): Promise<OtpSmsResult> => {
        sent.push(req);
        return result;
      }),
    };
    beforeAll(() => {
      process.env.ORG_SECRETS_ENCRYPTION_KEY = 'ab'.repeat(32);
    });
    beforeEach(() => {
      sent.length = 0;
      result = { delivered: true };
      email.send.mockClear();
    });
    // The email is rendered (MJML, compiled once per layout) before it is sent.
    const flush = () => new Promise((r) => setTimeout(r, 300));
    const prisma = { organization: { findUnique: jest.fn(async () => ({ name: 'Kaveri <Foods>' })) } };
    const service = (redis: object) => new OtpService(crypto, email as never, sms, redis as never, prisma as never);

    it('fails closed (503) when its store is down: no code is issued, checked or rate-limited', async () => {
      const down = new Proxy({}, { get: () => () => { throw new Error('ECONNREFUSED'); } });
      const otp = service(down);
      await expect(otp.reserveSend('x', '203.0.113.9')).rejects.toThrow(ServiceUnavailableException);
      await expect(otp.check('k', '123456')).rejects.toThrow(ServiceUnavailableException);
      await expect(otp.issue('k', {})).rejects.toThrow(ServiceUnavailableException);
    });

    it('the resend cooldown is a 429 with the seconds left, not a 503', async () => {
      const otp = service({ set: jest.fn().mockResolvedValue(null), ttl: jest.fn().mockResolvedValue(42) });
      const error = await otp.reserveSend('x', null).catch((e) => e);
      expect(error).toBeInstanceOf(TooManyOtpRequestsException);
      expect(error.retryAfterSeconds).toBe(42);
    });

    it('delivers the code alone (no account data) by email or by text', async () => {
      const otp = service({});
      otp.deliver('email', 'a@b.test', '012345', 'sign_in', 'org-1', { userId: 'u-1' });
      otp.deliver('sms', '+919876543210', '012345', 'mfa', 'org-1', { userId: 'u-1' });
      await flush();
      expect(email.send).toHaveBeenCalledTimes(1);
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.test', subject: '012345 is your YukthiX sign-in code', organizationId: 'org-1' }));
      const { html, text } = email.send.mock.calls[0][0];
      expect(html).toContain('012<span>345</span>');
      expect(html).toContain('sign in to Kaveri &lt;Foods&gt;');
      expect(html).not.toContain('<Foods>');
      expect(text).toContain('012345');
      expect(text).toContain('Enter this code to sign in to Kaveri <Foods>. It works once and expires in 5 minutes.');
      expect(sms.sent).toEqual([
        expect.objectContaining({ organizationId: 'org-1', to: '+919876543210', channel: 'sms', code: '012345', purpose: 'verification code', minutes: 5, recipientUserId: 'u-1' }),
      ]);
      expect(sms.sent[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('a code for an address several companies share names none of them', async () => {
      const otp = service({});
      otp.deliver('email', 'a@b.test', '012345', 'sign_in', 'org-1', { userId: 'u-1', nameCompany: false });
      await flush();
      expect(email.send.mock.calls[0][0].text).toContain('Enter this code to sign in to YukthiX.');
      expect(email.send.mock.calls[0][0].text).not.toContain('Kaveri');
    });

    it('a text channel counts as available only where a text could actually go', async () => {
      const otp = service({});
      expect(await otp.channelAvailable('email', 'org-without-sms')).toBe(true);
      // Before any organisation is known: a platform fact only.
      expect(await otp.channelAvailable('sms')).toBe(true);
      expect(await otp.channelAvailable('sms', 'org-1')).toBe(true);
      expect(await otp.channelAvailable('sms', 'org-without-sms')).toBe(false);
    });

    it('a code that cannot go by text goes to the fallback email when the flow allows one (YX-NTF-07)', async () => {
      result = { delivered: false, reason: 'no_approved_template' };
      const otp = service({});
      otp.deliver('sms', '+919876543210', '246810', 'sign_in', 'org-1', { userId: 'u-1', fallbackEmail: 'field@plant.test' });
      await flush();
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'field@plant.test', subject: '246810 is your YukthiX sign-in code' }));
      expect(email.send.mock.calls[0][0].html).toContain('couldn&#39;t send this code by text message');
      expect(email.send.mock.calls[0][0].text).toContain('246810');
    });

    it('no fallback email when the flow has none (second step, number check), or when the text may have arrived', async () => {
      const otp = service({});
      result = { delivered: false, reason: 'all_providers_failed' };
      otp.deliver('sms', '+919876543210', '111111', 'mfa', 'org-1', { userId: 'u-1' });
      otp.deliver('sms', '+919876543210', '222222', 'mobile', 'org-1', { userId: 'u-1', fallbackEmail: null });
      await flush();
      result = { delivered: false, reason: 'outcome_unknown', mayHaveArrived: true };
      otp.deliver('sms', '+919876543210', '333333', 'sign_in', 'org-1', { userId: 'u-1', fallbackEmail: 'field@plant.test' });
      await flush();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('a failed delivery is logged, never thrown at the caller', async () => {
      email.send.mockRejectedValueOnce(new Error('SMTP down'));
      expect(() => service({}).deliver('email', 'a@b.test', '012345', 'sign_in', null, { userId: 'u-1' })).not.toThrow();
      sms.send.mockRejectedValueOnce(new Error('db down'));
      expect(() => service({}).deliver('sms', '+919876543210', '012345', 'sign_in', null, { userId: 'u-1' })).not.toThrow();
      await flush();
    });
  });
});
