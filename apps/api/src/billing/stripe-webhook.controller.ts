import { BadRequestException, Controller, Headers, HttpCode, Logger, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { StripeClient } from './stripe.client';
import { BillingCheckoutService } from './billing-checkout.service';

// Public, UNAUTHENTICATED endpoint -- Stripe calls it. Security is the signature check in
// constructEvent (HMAC of the raw body with STRIPE_WEBHOOK_SECRET), not a JWT. main.ts mounts
// express.raw on this exact path (before the global express.json) so req.body is the raw Buffer the
// signature is computed over; parsing it first would break verification.
@Controller('billing/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripe: StripeClient,
    private readonly checkout: BillingCheckoutService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: Request, @Headers('stripe-signature') signature?: string): Promise<{ received: true }> {
    let event;
    try {
      event = this.stripe.constructEvent(req.body as Buffer, signature);
    } catch (e) {
      // A bad signature is a client error; returning 4xx tells Stripe not to keep retrying a
      // payload it can't fix (a genuine transient failure below returns 5xx so Stripe retries).
      throw new BadRequestException(`Webhook signature verification failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
    await this.checkout.handleWebhookEvent(event);
    return { received: true };
  }
}
