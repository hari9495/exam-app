import { Test } from '@nestjs/testing';
import { AiApiKeyResolverService } from './ai-api-key-resolver.service';
import { OrgSecretsCryptoService } from './org-secrets-crypto.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AiApiKeyResolverService', () => {
  let service: AiApiKeyResolverService;
  let prisma: { organization: { findUnique: jest.Mock } };
  let cryptoService: { decrypt: jest.Mock };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn() } };
    cryptoService = { decrypt: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiApiKeyResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrgSecretsCryptoService, useValue: cryptoService },
      ],
    }).compile();
    service = moduleRef.get(AiApiKeyResolverService);
  });

  it("returns the org's own decrypted key when configured", async () => {
    prisma.organization.findUnique.mockResolvedValue({ aiApiKeyEncrypted: 'encrypted-blob' });
    cryptoService.decrypt.mockReturnValue('sk-ant-org-own-key');

    const result = await service.resolve('org-1');

    expect(cryptoService.decrypt).toHaveBeenCalledWith('encrypted-blob');
    expect(result).toBe('sk-ant-org-own-key');
  });

  it('falls back to the platform ANTHROPIC_API_KEY when the org has none configured', async () => {
    prisma.organization.findUnique.mockResolvedValue({ aiApiKeyEncrypted: null });
    process.env.ANTHROPIC_API_KEY = 'sk-ant-platform-key';

    const result = await service.resolve('org-1');

    expect(cryptoService.decrypt).not.toHaveBeenCalled();
    expect(result).toBe('sk-ant-platform-key');
  });

  it('throws when neither an org key nor a platform key is available', async () => {
    prisma.organization.findUnique.mockResolvedValue({ aiApiKeyEncrypted: null });
    delete process.env.ANTHROPIC_API_KEY;

    await expect(service.resolve('org-1')).rejects.toThrow(
      'No AI API key configured for this organization, and no platform-wide ANTHROPIC_API_KEY is set',
    );
  });
});
