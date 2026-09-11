import { BadRequestException } from '@nestjs/common';
import { twilioWhatsappProvider } from './twilio-whatsapp-provider';

describe('twilioWhatsappProvider.validateConfig', () => {
  const validConfig = { accountSid: 'AC123', authToken: 'secret-token', from: '+15551234567' };

  it('accepts a config with all three required fields present', () => {
    expect(() => twilioWhatsappProvider.validateConfig(validConfig)).not.toThrow();
  });

  it('rejects a missing accountSid', () => {
    const { accountSid, ...rest } = validConfig;
    expect(() => twilioWhatsappProvider.validateConfig(rest)).toThrow(BadRequestException);
  });

  it('rejects a blank authToken', () => {
    expect(() => twilioWhatsappProvider.validateConfig({ ...validConfig, authToken: '  ' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects a missing from', () => {
    const { from, ...rest } = validConfig;
    expect(() => twilioWhatsappProvider.validateConfig(rest)).toThrow(BadRequestException);
  });
});

describe('twilioWhatsappProvider.send', () => {
  const config = { accountSid: 'AC123', authToken: 'secret-token', from: '+15551234567' };
  const args = { to: '+15559876543', body: 'Your interview is confirmed' };

  function mockFetch(res: { ok: boolean; status: number }) {
    return jest.fn().mockResolvedValue(res);
  }

  it('maps config + args onto sendTwilioWhatsapp and returns its result', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 201 });

    const result = await twilioWhatsappProvider.send(config, args, fetchImpl as never);

    expect(result).toEqual({ ok: true, status: 201 });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(options.body).toBe(
      new URLSearchParams({ To: `whatsapp:${args.to}`, From: `whatsapp:${config.from}`, Body: args.body }).toString(),
    );
  });

  it('propagates a failed send result', async () => {
    const fetchImpl = mockFetch({ ok: false, status: 500 });
    const result = await twilioWhatsappProvider.send(config, args, fetchImpl as never);
    expect(result).toEqual({ ok: false, status: 500 });
  });
});
