import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrgSecretsCryptoService } from './org-secrets-crypto.service';

@Injectable()
export class AiApiKeyResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {}

  async resolve(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { aiApiKeyEncrypted: true },
    });
    if (org?.aiApiKeyEncrypted) {
      return this.cryptoService.decrypt(org.aiApiKeyEncrypted);
    }
    const platformKey = process.env.ANTHROPIC_API_KEY;
    if (!platformKey) {
      throw new Error('No AI API key configured for this organization, and no platform-wide ANTHROPIC_API_KEY is set');
    }
    return platformKey;
  }
}
