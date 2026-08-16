import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrgSecretsCryptoService } from './org-secrets-crypto.service';
import { AiProvider } from '../ai/ai-provider';
import { AnthropicProvider } from '../ai/anthropic-provider';
import { OpenAiCompatibleProvider } from '../ai/openai-compatible-provider';

/**
 * Thrown when no usable AI configuration exists for an organization. A distinct class, not a
 * message, so callers can tell "this org has not configured AI" apart from "the AI provider
 * errored" without string-matching.
 *
 * The distinction is user-visible: an entire 104-candidate hiring round at one org settled
 * with every AI insight and proctoring analysis recorded as a bare `failed`, and the report
 * told recruiters "Generation failed. This is usually temporary -- try again" with a Retry
 * button -- for a condition that is neither temporary nor fixable by retrying. Recruiters
 * were steered away from the actual fix (configure a key in org settings). Callers should
 * record AI_NOT_CONFIGURED_STATUS for this class and a real failure status for anything else.
 */
export class AiNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiNotConfiguredError';
  }
}

/** Status value enrichers persist when analysis was skipped for want of an AI key. */
export const AI_NOT_CONFIGURED_STATUS = 'skipped_no_ai_key';

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
        throw new AiNotConfiguredError('This organization is configured for an OpenAI-compatible provider but is missing its API key, base URL, or model names');
      }
      return new OpenAiCompatibleProvider(this.cryptoService.decrypt(org.aiApiKeyEncrypted), org.aiBaseUrl, org.aiModelFast, org.aiModelStandard);
    }

    if (org?.aiApiKeyEncrypted) {
      return new AnthropicProvider(this.cryptoService.decrypt(org.aiApiKeyEncrypted));
    }
    const platformKey = process.env.ANTHROPIC_API_KEY;
    if (!platformKey) {
      throw new AiNotConfiguredError('No AI API key configured for this organization, and no platform-wide ANTHROPIC_API_KEY is set');
    }
    return new AnthropicProvider(platformKey);
  }
}
