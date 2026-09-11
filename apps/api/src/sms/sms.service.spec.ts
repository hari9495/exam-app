const mockSendTwilioSms = jest.fn();

jest.mock('./twilio-transport', () => ({
  sendTwilioSms: (...args: unknown[]) => mockSendTwilioSms(...args),
}));

import { Logger } from '@nestjs/common';
import { SmsService } from './sms.service';

describe('SmsService', () => {
  let service: SmsService;
  let prisma: { organization: { findUnique: jest.Mock } };
  let cryptoService: { decrypt: jest.Mock };

  const configuredOrg = {
    smsEnabled: true,
    smsAccountSid: 'AC123',
    smsAuthTokenEncrypted: 'encrypted-blob',
    smsFromNumber: '+15551234567',
  };

  beforeEach(() => {
    mockSendTwilioSms.mockReset();
    prisma = { organization: { findUnique: jest.fn() } };
    cryptoService = { decrypt: jest.fn() };
    service = new SmsService(prisma as never, cryptoService as never);
  });

  const input = { to: '+15559876543', body: 'Your interview is confirmed', organizationId: 'org-1' };

  describe('deliverable gate', () => {
    it.each([
      ['smsEnabled is false', { ...configuredOrg, smsEnabled: false }],
      ['smsAccountSid is missing', { ...configuredOrg, smsAccountSid: null }],
      ['smsAuthTokenEncrypted is missing', { ...configuredOrg, smsAuthTokenEncrypted: null }],
      ['smsFromNumber is missing', { ...configuredOrg, smsFromNumber: null }],
      ['the organization does not exist', null],
    ])('returns success:false and never calls the transport or decrypt when %s', async (_label, org) => {
      prisma.organization.findUnique.mockResolvedValue(org);

      const result = await service.send(input);

      expect(result).toEqual({ success: false });
      expect(mockSendTwilioSms).not.toHaveBeenCalled();
      expect(cryptoService.decrypt).not.toHaveBeenCalled();
    });
  });

  it('queries the organization by id with the expected select', async () => {
    prisma.organization.findUnique.mockResolvedValue(configuredOrg);
    mockSendTwilioSms.mockResolvedValue({ ok: true, status: 201 });
    cryptoService.decrypt.mockReturnValue('decrypted-token');

    await service.send(input);

    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      select: { smsEnabled: true, smsAccountSid: true, smsAuthTokenEncrypted: true, smsFromNumber: true },
    });
  });

  it('decrypts the token and sends via the transport when fully configured, returning success:true on ok', async () => {
    prisma.organization.findUnique.mockResolvedValue(configuredOrg);
    cryptoService.decrypt.mockReturnValue('decrypted-token');
    mockSendTwilioSms.mockResolvedValue({ ok: true, status: 201 });

    const result = await service.send(input);

    expect(result).toEqual({ success: true });
    expect(cryptoService.decrypt).toHaveBeenCalledTimes(1);
    expect(cryptoService.decrypt).toHaveBeenCalledWith('encrypted-blob');
    expect(mockSendTwilioSms).toHaveBeenCalledWith({
      accountSid: 'AC123',
      authToken: 'decrypted-token',
      from: '+15551234567',
      to: input.to,
      body: input.body,
    });
  });

  it('returns success:false when the transport reports ok:false', async () => {
    prisma.organization.findUnique.mockResolvedValue(configuredOrg);
    cryptoService.decrypt.mockReturnValue('decrypted-token');
    mockSendTwilioSms.mockResolvedValue({ ok: false, status: 500 });

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
  });

  it('logs SMS_SEND_FAILED with org/to/status (no secrets) when Twilio rejects the send, distinct from the gate log', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma.organization.findUnique.mockResolvedValue(configuredOrg);
    cryptoService.decrypt.mockReturnValue('decrypted-token');
    mockSendTwilioSms.mockResolvedValue({ ok: false, status: 400 });

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message] = errorSpy.mock.calls[0];
    expect(message).toEqual(expect.stringContaining('SMS_SEND_FAILED'));
    expect(message).toEqual(expect.stringContaining('400'));
    expect(message).toEqual(expect.stringContaining(input.to));
    expect(message).toEqual(expect.stringContaining(input.organizationId));
    expect(message).not.toEqual(expect.stringContaining('decrypted-token'));
    expect(message).not.toEqual(expect.stringContaining('encrypted-blob'));
    expect(message).not.toEqual(expect.stringContaining('SMS_NOT_SENT'));

    errorSpy.mockRestore();
  });

  it('still logs the unconfigured SMS_NOT_SENT gate message and never the SMS_SEND_FAILED transport message', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma.organization.findUnique.mockResolvedValue({ ...configuredOrg, smsEnabled: false });

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message] = errorSpy.mock.calls[0];
    expect(message).toEqual(expect.stringContaining('SMS_NOT_SENT'));
    expect(message).not.toEqual(expect.stringContaining('SMS_SEND_FAILED'));
    expect(mockSendTwilioSms).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('returns success:false when the transport call throws', async () => {
    prisma.organization.findUnique.mockResolvedValue(configuredOrg);
    cryptoService.decrypt.mockReturnValue('decrypted-token');
    mockSendTwilioSms.mockRejectedValue(new Error('boom'));

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
  });

  it('returns success:false when the organization lookup itself throws', async () => {
    prisma.organization.findUnique.mockRejectedValue(new Error('db down'));

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
    expect(mockSendTwilioSms).not.toHaveBeenCalled();
  });
});
