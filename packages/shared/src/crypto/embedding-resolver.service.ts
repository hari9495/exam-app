import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrgSecretsCryptoService } from './org-secrets-crypto.service';
import { EmbeddingProvider, OpenAiCompatibleEmbeddingProvider } from '../ai/embedding-provider';

/**
 * Thrown when an org has not configured a (generic, OpenAI-compatible) embeddings provider. Distinct
 * class, mirroring AiNotConfiguredError, so callers can tell "not configured" from "provider errored"
 * and keep semantic search inert-but-clear until the org sets a key.
 */
export class EmbeddingNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingNotConfiguredError';
  }
}

export const EMBEDDING_NOT_CONFIGURED_STATUS = 'skipped_no_embedding_config';

@Injectable()
export class EmbeddingResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {}

  async resolve(organizationId: string): Promise<EmbeddingProvider> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { embeddingApiKeyEncrypted: true, embeddingBaseUrl: true, embeddingModel: true },
    });
    if (!org?.embeddingApiKeyEncrypted || !org.embeddingBaseUrl || !org.embeddingModel) {
      throw new EmbeddingNotConfiguredError(
        'No embeddings provider is configured for this organization. Add an embeddings endpoint, model and API key in Settings → Integrations.',
      );
    }
    return new OpenAiCompatibleEmbeddingProvider(
      this.cryptoService.decrypt(org.embeddingApiKeyEncrypted),
      org.embeddingBaseUrl,
      org.embeddingModel,
    );
  }
}
