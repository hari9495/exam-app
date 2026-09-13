import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService, AiApiKeyResolverService, AiNotConfiguredError, AiProvider } from '@exam-platform/shared';
import { QuotaService } from '../billing/quota.service';

export interface AiInvokeOptions {
  // Tag written to AiCreditUsage.source so spend is attributable per feature.
  source: string;
  // Optional entity this call is about (UUID column); null when there is no single subject.
  sourceId?: string | null;
  credits?: number;
}

/**
 * Shared plumbing for a synchronous, interactive AI call: resolve the org's provider, enforce the
 * hard AI-credit quota, run the caller's generation, then record the spend. Centralises the
 * "AI not configured" -> friendly 400 mapping so every drafting feature behaves identically and
 * stays inert (a clear, actionable error) until an org sets a key.
 *
 * Batch/slow work (résumé parse, candidate fit, question generation) still goes through the AiJob
 * queue -- this is only for request-time calls the user is waiting on.
 */
@Injectable()
export class AiInvocationService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
    private readonly quota: QuotaService,
  ) {}

  async run<T>(context: TenantContext, opts: AiInvokeOptions, fn: (provider: AiProvider) => Promise<T>): Promise<T> {
    const organizationId = context.organizationId as string;
    const provider = await this.resolveProvider(organizationId);
    await this.quota.assertWithinLimit(context, 'ai_credits');
    const result = await fn(provider);
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.aiCreditUsage.create({
        data: { organizationId, source: opts.source, credits: opts.credits ?? 1, sourceId: opts.sourceId ?? null },
      }),
    );
    return result;
  }

  private async resolveProvider(organizationId: string): Promise<AiProvider> {
    try {
      return await this.aiApiKeyResolver.resolve(organizationId);
    } catch (error) {
      if (error instanceof AiNotConfiguredError) {
        throw new BadRequestException('AI is not configured for your organization. Add an API key in Settings → Integrations.');
      }
      throw error;
    }
  }
}
