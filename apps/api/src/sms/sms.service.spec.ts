const mockGetSmsProvider = jest.fn();

jest.mock('./providers', () => ({
  getSmsProvider: (...args: unknown[]) => mockGetSmsProvider(...args),
}));

import { Logger } from '@nestjs/common';
import { SmsService } from './sms.service';

describe('SmsService', () => {
  let service: SmsService;
  let prisma: { organization: { findUnique: jest.Mock } };
  let cryptoService: { decrypt: jest.Mock };
  let adapter: { id: string; validateConfig: jest.Mock; send: jest.Mock };

  const secretConfig = { accountSid: 'AC123', authToken: 'super-secret-token', from: '+15551234567' };

  const configuredOrg = {
    smsEnabled: true,
    smsProvider: 'twilio',
    smsConfigEncrypted: 'encrypted-blob',
  };

  const input = { to: '+15559876543', body: 'Your interview is confirmed', organizationId: 'org-1' };

  beforeEach(() => {
    prisma = { organization: { findUnique: jest.fn() } };
    cryptoService = { decrypt: jest.fn() };
    adapter = { id: 'twilio', validateConfig: jest.fn(), send: jest.fn() };
    mockGetSmsProvider.mockReset();
    mockGetSmsProvider.mockReturnValue(adapter);
    service = new SmsService(prisma as never, cryptoService as never);
  });

  describe('deliverable gate', () => {
    it.each([
      ['smsEnabled is false', { ...configuredOrg, smsEnabled: false }],
      ['smsConfigEncrypted is missing', { ...configuredOrg, smsConfigEncrypted: null }],
      ['the organization does not exist', null],
    ])('returns success:false and never calls decrypt or the adapter when %s', async (_label, org) => {
      prisma.organization.findUnique.mockResolvedValue(org);

      const result = await service.send(input);

      expect(result).toEqual({ success: false });
      expect(cryptoService.decrypt).not.toHaveBeenCalled();
      expect(adapter.send).not.toHaveBeenCalled();
    });

    it('returns success:false and never calls decrypt or the adapter when smsProvider is unknown', async () => {
      mockGetSmsProvider.mockReturnValue(undefined);
      prisma.organization.findUnique.mockResolvedValue({ ...configuredOrg, smsProvider: 'carrier-pigeon' });

      const result = await service.send(input);

      expect(result).toEqual({ success: false });
      expect(cryptoService.decrypt).not.toHaveBeenCalled();
      expect(adapter.send).not.toHaveBeenCalled();
    });

    it('logs SMS_NOT_SENT (and nothing else) when the org is not deliverable', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      prisma.organization.findUnique.mockResolvedValue({ ...configuredOrg, smsEnabled: false });

      const result = await service.send(input);

      expect(result).toEqual({ success: false });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [message] = errorSpy.mock.calls[0];
      expect(message).toEqual(expect.stringContaining('SMS_NOT_SENT'));
      expect(message).not.toEqual(expect.stringContaining('SMS_SEND_FAILED'));

      errorSpy.mockRestore();
    });
  });

  it('queries the organization by id with the expected select', async () => {
    prisma.organization.findUnique.mockResolvedValue(configuredOrg);
    cryptoService.decrypt.mockReturnValue(JSON.stringify(secretConfig));
    adapter.send.mockResolvedValue({ ok: true, status: 201 });

    await service.send(input);

    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      select: { smsEnabled: true, smsProvider: true, smsConfigEncrypted: true },
    });
  });

  it('resolves the adapter by org.smsProvider, decrypts + JSON.parses the config, and dispatches to it', async () => {
    prisma.organization.findUnique.mockResolvedValue(configuredOrg);
    cryptoService.decrypt.mockReturnValue(JSON.stringify(secretConfig));
    adapter.send.mockResolvedValue({ ok: true, status: 201 });

    const result = await service.send(input);

    expect(result).toEqual({ success: true });
    expect(mockGetSmsProvider).toHaveBeenCalledWith('twilio');
    expect(cryptoService.decrypt).toHaveBeenCalledTimes(1);
    expect(cryptoService.decrypt).toHaveBeenCalledWith('encrypted-blob');
    expect(adapter.validateConfig).toHaveBeenCalledWith(secretConfig);
    expect(adapter.send).toHaveBeenCalledWith(secretConfig, { to: input.to, body: input.body });
  });

  it('returns success:false and logs SMS_SEND_FAILED (no secrets) when the adapter reports ok:false', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma.organization.findUnique.mockResolvedValue(configuredOrg);
    cryptoService.decrypt.mockReturnValue(JSON.stringify(secretConfig));
    adapter.send.mockResolvedValue({ ok: false, status: 400 });

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message] = errorSpy.mock.calls[0];
    expect(message).toEqual(expect.stringContaining('SMS_SEND_FAILED'));
    expect(message).toEqual(expect.stringContaining('400'));
    expect(message).toEqual(expect.stringContaining(input.to));
    expect(message).toEqual(expect.stringContaining(input.organizationId));
    expect(message).not.toEqual(expect.stringContaining('super-secret-token'));
    expect(message).not.toEqual(expect.stringContaining('encrypted-blob'));

    errorSpy.mockRestore();
  });

  it('returns success:false and never calls adapter.send when the decrypted config is malformed JSON', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma.organization.findUnique.mockResolvedValue(configuredOrg);
    cryptoService.decrypt.mockReturnValue('not-json{{{');

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
    expect(adapter.send).not.toHaveBeenCalled();
    const messages = errorSpy.mock.calls.map(([m]) => m as string);
    expect(messages.some((m) => m.includes('super-secret-token'))).toBe(false);

    errorSpy.mockRestore();
  });

  it('returns success:false and never calls adapter.send when adapter.validateConfig throws', async () => {
    prisma.organization.findUnique.mockResolvedValue(configuredOrg);
    cryptoService.decrypt.mockReturnValue(JSON.stringify(secretConfig));
    adapter.validateConfig.mockImplementation(() => {
      throw new Error('invalid config');
    });

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it('returns success:false when adapter.send throws (no throw escapes)', async () => {
    prisma.organization.findUnique.mockResolvedValue(configuredOrg);
    cryptoService.decrypt.mockReturnValue(JSON.stringify(secretConfig));
    adapter.send.mockRejectedValue(new Error('network boom'));

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
  });

  it('returns success:false when the organization lookup itself throws', async () => {
    prisma.organization.findUnique.mockRejectedValue(new Error('db down'));

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it('never logs the decrypted config or any secret field value across all paths', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma.organization.findUnique.mockResolvedValue(configuredOrg);
    cryptoService.decrypt.mockReturnValue(JSON.stringify(secretConfig));
    adapter.send.mockResolvedValue({ ok: false, status: 500 });

    await service.send(input);

    const allMessages = errorSpy.mock.calls.map(([m]) => String(m));
    for (const message of allMessages) {
      expect(message).not.toEqual(expect.stringContaining('super-secret-token'));
      expect(message).not.toEqual(expect.stringContaining('encrypted-blob'));
    }

    errorSpy.mockRestore();
  });
});
