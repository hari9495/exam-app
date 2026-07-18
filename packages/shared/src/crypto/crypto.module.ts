import { Module } from '@nestjs/common';
import { OrgSecretsCryptoService } from './org-secrets-crypto.service';
import { AiApiKeyResolverService } from './ai-api-key-resolver.service';

@Module({
  providers: [OrgSecretsCryptoService, AiApiKeyResolverService],
  exports: [OrgSecretsCryptoService, AiApiKeyResolverService],
})
export class CryptoModule {}
