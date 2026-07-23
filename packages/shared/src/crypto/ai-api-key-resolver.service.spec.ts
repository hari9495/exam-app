import { Test } from '@nestjs/testing';
import { AiApiKeyResolverService } from './ai-api-key-resolver.service';
import { OrgSecretsCryptoService } from './org-secrets-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnthropicProvider } from '../ai/anthropic-provider';
import { OpenAiCompatibleProvider } from '../ai/openai-compatible-provider';

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

  it("returns an AnthropicProvider using the org's own decrypted key when configured", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      aiProvider: 'anthropic',
      aiApiKeyEncrypted: 'encrypted-blob',
      aiBaseUrl: null,
      aiModelFast: null,
      aiModelStandard: null,
    });
    cryptoService.decrypt.mockReturnValue('sk-ant-org-own-key');

    const result = await service.resolve('org-1');

    expect(cryptoService.decrypt).toHaveBeenCalledWith('encrypted-blob');
    expect(result).toBeInstanceOf(AnthropicProvider);
  });

  it('falls back to an AnthropicProvider using the platform ANTHROPIC_API_KEY when the org has none configured', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      aiProvider: 'anthropic',
      aiApiKeyEncrypted: null,
      aiBaseUrl: null,
      aiModelFast: null,
      aiModelStandard: null,
    });
    process.env.ANTHROPIC_API_KEY = 'sk-ant-platform-key';

    const result = await service.resolve('org-1');

    expect(cryptoService.decrypt).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(AnthropicProvider);
  });

  it('throws when neither an org key nor a platform key is available for the anthropic provider', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      aiProvider: 'anthropic',
      aiApiKeyEncrypted: null,
      aiBaseUrl: null,
      aiModelFast: null,
      aiModelStandard: null,
    });
    delete process.env.ANTHROPIC_API_KEY;

    await expect(service.resolve('org-1')).rejects.toThrow(
      'No AI API key configured for this organization, and no platform-wide ANTHROPIC_API_KEY is set',
    );
  });

  it('returns an OpenAiCompatibleProvider using the org\'s own base URL and models when configured', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      aiProvider: 'openai-compatible',
      aiApiKeyEncrypted: 'encrypted-blob',
      aiBaseUrl: 'https://example.openai.azure.com/openai/v1',
      aiModelFast: 'gpt-fast',
      aiModelStandard: 'gpt-standard',
    });
    cryptoService.decrypt.mockReturnValue('azure-key');

    const result = await service.resolve('org-1');

    expect(cryptoService.decrypt).toHaveBeenCalledWith('encrypted-blob');
    expect(result).toBeInstanceOf(OpenAiCompatibleProvider);
  });

  it('throws when the org is configured for openai-compatible but is missing required fields', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      aiProvider: 'openai-compatible',
      aiApiKeyEncrypted: 'encrypted-blob',
      aiBaseUrl: null,
      aiModelFast: 'gpt-fast',
      aiModelStandard: 'gpt-standard',
    });
    cryptoService.decrypt.mockReturnValue('azure-key');

    await expect(service.resolve('org-1')).rejects.toThrow(
      'This organization is configured for an OpenAI-compatible provider but is missing its API key, base URL, or model names',
    );
  });
});
