import { Module } from '@nestjs/common';
import { OrgSecretsCryptoService } from './org-secrets-crypto.service';
import { AiApiKeyResolverService } from './ai-api-key-resolver.service';
import { EmbeddingResolverService } from './embedding-resolver.service';

@Module({
  providers: [OrgSecretsCryptoService, AiApiKeyResolverService, EmbeddingResolverService],
  exports: [OrgSecretsCryptoService, AiApiKeyResolverService, EmbeddingResolverService],
})
export class CryptoModule {}
