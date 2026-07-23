import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrgSecretsCryptoService } from './org-secrets-crypto.service';
import { AiProvider } from '../ai/ai-provider';
import { AnthropicProvider } from '../ai/anthropic-provider';
import { OpenAiCompatibleProvider } from '../ai/openai-compatible-provider';

@Injectable()
export class AiApiKeyResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {}

  async resolve(organizationId: string): Promise<AiProvider> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { aiProvider: true, aiApiKeyEncrypted: true, aiBaseUrl: true, aiModelFast: true, aiModelStandard: true },
    });

    if (org?.aiProvider === 'openai-compatible') {
      if (!org.aiApiKeyEncrypted || !org.aiBaseUrl || !org.aiModelFast || !org.aiModelStandard) {
        throw new Error('This organization is configured for an OpenAI-compatible provider but is missing its API key, base URL, or model names');
      }
      return new OpenAiCompatibleProvider(this.cryptoService.decrypt(org.aiApiKeyEncrypted), org.aiBaseUrl, org.aiModelFast, org.aiModelStandard);
    }

    if (org?.aiApiKeyEncrypted) {
      return new AnthropicProvider(this.cryptoService.decrypt(org.aiApiKeyEncrypted));
    }
    const platformKey = process.env.ANTHROPIC_API_KEY;
    if (!platformKey) {
      throw new Error('No AI API key configured for this organization, and no platform-wide ANTHROPIC_API_KEY is set');
    }
    return new AnthropicProvider(platformKey);
  }
}
