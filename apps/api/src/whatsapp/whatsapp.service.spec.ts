import { Test } from '@nestjs/testing';
import { PrismaService, OrgSecretsCryptoService } from '@exam-platform/shared';
import { WhatsappService } from './whatsapp.service';
import { getWhatsappProvider } from './providers';

jest.mock('./providers', () => ({
  getWhatsappProvider: jest.fn(),
}));

const mockGetWhatsappProvider = getWhatsappProvider as jest.Mock;

describe('WhatsappService', () => {
  let service: WhatsappService;
  let prisma: { organization: { findUnique: jest.Mock } };
  let cryptoService: { decrypt: jest.Mock };
  let adapter: { validateConfig: jest.Mock; send: jest.Mock };
  let errorSpy: jest.SpyInstance;

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn() } };
    cryptoService = { decrypt: jest.fn() };
    adapter = { validateConfig: jest.fn(), send: jest.fn() };
    mockGetWhatsappProvider.mockReset();
    mockGetWhatsappProvider.mockReturnValue(adapter);

    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrgSecretsCryptoService, useValue: cryptoService },
      ],
    }).compile();

    service = moduleRef.get(WhatsappService);
    errorSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const input = { to: '+15551234567', body: 'hello there this is a long body', organizationId: 'org-1' };

  it('returns success:false and does not call decrypt or adapter when whatsappEnabled is false', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      whatsappEnabled: false,
      whatsappProvider: 'twilio',
      whatsappConfigEncrypted: 'ciphertext',
    });

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
    expect(cryptoService.decrypt).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('WHATSAPP_NOT_SENT'));
  });

  it('returns success:false and does not call adapter when whatsappConfigEncrypted is null', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      whatsappEnabled: true,
      whatsappProvider: 'twilio',
      whatsappConfigEncrypted: null,
    });

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
    expect(cryptoService.decrypt).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('WHATSAPP_NOT_SENT'));
  });

  it('returns success:false and does not call adapter when provider is unknown', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      whatsappEnabled: true,
      whatsappProvider: 'bogus',
      whatsappConfigEncrypted: 'ciphertext',
    });
    mockGetWhatsappProvider.mockReturnValue(undefined);

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
    expect(cryptoService.decrypt).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('WHATSAPP_NOT_SENT'));
  });

  it('decrypts + parses config and dispatches to the adapter when configured', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      whatsappEnabled: true,
      whatsappProvider: 'twilio',
      whatsappConfigEncrypted: 'ciphertext',
    });
    cryptoService.decrypt.mockReturnValue('{"accountSid":"AC1","authToken":"tok","fromNumber":"+1999"}');
    adapter.send.mockResolvedValue({ ok: true, status: 200 });

    const result = await service.send(input);

    expect(cryptoService.decrypt).toHaveBeenCalledTimes(1);
    expect(cryptoService.decrypt).toHaveBeenCalledWith('ciphertext');
    expect(adapter.validateConfig).toHaveBeenCalledWith({ accountSid: 'AC1', authToken: 'tok', fromNumber: '+1999' });
    expect(adapter.send).toHaveBeenCalledWith(
      { accountSid: 'AC1', authToken: 'tok', fromNumber: '+1999' },
      { to: input.to, body: input.body },
    );
    expect(result).toEqual({ success: true });
  });

  it('returns success:false and logs WHATSAPP_SEND_FAILED when the adapter rejects the message', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      whatsappEnabled: true,
      whatsappProvider: 'twilio',
      whatsappConfigEncrypted: 'ciphertext',
    });
    cryptoService.decrypt.mockReturnValue('{"accountSid":"AC1"}');
    adapter.send.mockResolvedValue({ ok: false, status: 400 });

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('WHATSAPP_SEND_FAILED'));
  });

  it('returns success:false without throwing when the decrypted config is malformed JSON, and does not call the adapter', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      whatsappEnabled: true,
      whatsappProvider: 'twilio',
      whatsappConfigEncrypted: 'ciphertext',
    });
    cryptoService.decrypt.mockReturnValue('not-json{{{');

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
    expect(adapter.validateConfig).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('WHATSAPP_NOT_SENT'));
  });

  it('returns success:false without throwing when adapter.validateConfig throws, and does not call adapter.send', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      whatsappEnabled: true,
      whatsappProvider: 'twilio',
      whatsappConfigEncrypted: 'ciphertext',
    });
    cryptoService.decrypt.mockReturnValue('{"accountSid":"AC1"}');
    adapter.validateConfig.mockImplementation(() => {
      throw new Error('invalid config');
    });

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
    expect(adapter.send).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('WHATSAPP_NOT_SENT'));
  });

  it('returns success:false without throwing when adapter.send throws', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      whatsappEnabled: true,
      whatsappProvider: 'twilio',
      whatsappConfigEncrypted: 'ciphertext',
    });
    cryptoService.decrypt.mockReturnValue('{"accountSid":"AC1"}');
    adapter.send.mockRejectedValue(new Error('network exploded'));

    const result = await service.send(input);

    expect(result).toEqual({ success: false });
  });

  it('never logs the decrypted config or a secret placed inside it', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      whatsappEnabled: true,
      whatsappProvider: 'twilio',
      whatsappConfigEncrypted: 'ciphertext',
    });
    const secret = 'super-secret-auth-token-xyz';
    cryptoService.decrypt.mockReturnValue(`{"authToken":"${secret}"}`);
    adapter.send.mockResolvedValue({ ok: false, status: 401 });

    await service.send(input);

    for (const call of errorSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(secret);
    }
  });

  it('selects only the three whatsapp columns from the organization', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      whatsappEnabled: false,
      whatsappProvider: 'twilio',
      whatsappConfigEncrypted: null,
    });

    await service.send(input);

    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: input.organizationId },
      select: { whatsappEnabled: true, whatsappProvider: true, whatsappConfigEncrypted: true },
    });
  });
});
