import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { BillingModule } from '../billing/billing.module';
import { AiInvocationService } from './ai-invocation.service';
import { JobDescriptionClient } from './clients/job-description.client';
import { OfferLetterClient } from './clients/offer-letter.client';
import { OutreachEmailClient } from './clients/outreach-email.client';
import { FunnelNarrativeClient } from './clients/funnel-narrative.client';
import { AiDraftingService } from './ai-drafting.service';
import { AiDraftingController } from './ai-drafting.controller';

@Module({
  // CryptoModule -> AiApiKeyResolverService; BillingModule -> QuotaService (both imported explicitly,
  // mirroring JobsModule / InterviewsModule). TenantPrismaService is global.
  imports: [CryptoModule, BillingModule],
  controllers: [AiDraftingController],
  providers: [
    AiInvocationService,
    AiDraftingService,
    JobDescriptionClient,
    OfferLetterClient,
    OutreachEmailClient,
    FunnelNarrativeClient,
  ],
  exports: [AiInvocationService],
})
export class AiModule {}
