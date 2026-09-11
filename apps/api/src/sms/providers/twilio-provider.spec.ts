import { BadRequestException } from '@nestjs/common';
import { twilioProvider } from './twilio-provider';

describe('twilioProvider.validateConfig', () => {
  const validConfig = { accountSid: 'AC123', authToken: 'secret-token', from: '+15551234567' };

  it('accepts a config with all three fields present', () => {
    expect(() => twilioProvider.validateConfig(validConfig)).not.toThrow();
  });

  it('rejects a missing accountSid', () => {
    const { accountSid, ...rest } = validConfig;
    expect(() => twilioProvider.validateConfig(rest)).toThrow(BadRequestException);
  });

  it('rejects a blank accountSid', () => {
    expect(() => twilioProvider.validateConfig({ ...validConfig, accountSid: '  ' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects a missing authToken', () => {
    const { authToken, ...rest } = validConfig;
    expect(() => twilioProvider.validateConfig(rest)).toThrow(BadRequestException);
  });

  it('rejects a blank authToken', () => {
    expect(() => twilioProvider.validateConfig({ ...validConfig, authToken: '' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects a missing from', () => {
    const { from, ...rest } = validConfig;
    expect(() => twilioProvider.validateConfig(rest)).toThrow(BadRequestException);
  });

  it('rejects a blank from', () => {
    expect(() => twilioProvider.validateConfig({ ...validConfig, from: '   ' })).toThrow(
      BadRequestException,
    );
  });
});

describe('twilioProvider.send', () => {
  const config = { accountSid: 'AC123', authToken: 'secret-token', from: '+15551234567' };
  const args = { to: '+15559876543', body: 'Your interview is confirmed' };

  function mockFetch(res: { ok: boolean; status: number }) {
    return jest.fn().mockResolvedValue(res);
  }

  it('maps config + args onto sendTwilioSms and returns its result', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 201 });

    const result = await twilioProvider.send(config, args, fetchImpl as never);

    expect(result).toEqual({ ok: true, status: 201 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(options.headers.Authorization).toBe(
      `Basic ${Buffer.from('AC123:secret-token').toString('base64')}`,
    );
    expect(options.body).toBe(
      new URLSearchParams({ To: args.to, From: config.from, Body: args.body }).toString(),
    );
  });

  it('propagates a failed send result', async () => {
    const fetchImpl = mockFetch({ ok: false, status: 500 });
    const result = await twilioProvider.send(config, args, fetchImpl as never);
    expect(result).toEqual({ ok: false, status: 500 });
  });
});
