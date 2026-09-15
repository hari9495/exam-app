import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

// Thin Stripe REST client over global fetch -- the `stripe` SDK is deliberately NOT a dependency
// (matches the house style: outbound webhooks are HMAC-signed with node's own `crypto`, AI calls go
// over fetch). Only the handful of endpoints self-serve checkout needs are wrapped. Inert until
// STRIPE_SECRET_KEY is set: every call first assertConfigured()s, and the controllers surface that
// as a 503 rather than crashing -- same inert-until-configured stance as the AI/Sentry features.
const STRIPE_API_BASE = 'https://api.stripe.com';
// Pin the API version so Stripe can't change response shapes under us on their rolling default.
const STRIPE_API_VERSION = '2024-06-20';
// Reject webhook events whose signed timestamp is older than this (replay protection). Stripe's own
// libraries default to 5 minutes.
const WEBHOOK_TOLERANCE_SECONDS = 300;

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
}
export interface StripePortalSession {
  url: string;
}
export interface StripeInvoice {
  id: string;
  number: string | null;
  status: string | null;
  amount_paid: number;
  currency: string;
  created: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}
// Only the fields the webhook handler reads. Stripe events carry much more; this is intentionally partial.
export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

// Flatten a nested params object into Stripe's form-encoded bracket notation, e.g.
// { line_items: [{ price: 'x', quantity: 1 }] } -> line_items[0][price]=x&line_items[0][quantity]=1.
function toFormBody(params: Record<string, unknown>, prefix = ''): string[] {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const field = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          pairs.push(...toFormBody(item as Record<string, unknown>, `${field}[${i}]`));
        } else {
          pairs.push(`${encodeURIComponent(`${field}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof value === 'object') {
      pairs.push(...toFormBody(value as Record<string, unknown>, field));
    } else {
      pairs.push(`${encodeURIComponent(field)}=${encodeURIComponent(String(value))}`);
    }
  }
  return pairs;
}

@Injectable()
export class StripeClient {
  private readonly logger = new Logger(StripeClient.name);
  private readonly secretKey = process.env.STRIPE_SECRET_KEY;
  private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  isConfigured(): boolean {
    return Boolean(this.secretKey);
  }

  private assertConfigured(): void {
    if (!this.secretKey) {
      throw new ServiceUnavailableException('Billing is not configured (STRIPE_SECRET_KEY unset)');
    }
  }

  private async request<T>(method: 'GET' | 'POST', path: string, params?: Record<string, unknown>): Promise<T> {
    this.assertConfigured();
    const isGet = method === 'GET';
    const body = params ? toFormBody(params).join('&') : undefined;
    const url = isGet && body ? `${STRIPE_API_BASE}${path}?${body}` : `${STRIPE_API_BASE}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Stripe-Version': STRIPE_API_VERSION,
        ...(isGet ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }),
      },
      body: isGet ? undefined : body,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = (json.error as { message?: string } | undefined)?.message ?? `Stripe ${method} ${path} failed (${res.status})`;
      this.logger.error(`Stripe API error: ${err}`);
      throw new ServiceUnavailableException(`Payment provider error: ${err}`);
    }
    return json as T;
  }

  createCustomer(input: { name: string; email?: string; organizationId: string }): Promise<{ id: string }> {
    return this.request('POST', '/v1/customers', {
      name: input.name,
      ...(input.email ? { email: input.email } : {}),
      metadata: { organizationId: input.organizationId },
    });
  }

  createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    organizationId: string;
    planId: string;
  }): Promise<StripeCheckoutSession> {
    return this.request('POST', '/v1/checkout/sessions', {
      mode: 'subscription',
      customer: input.customerId,
      client_reference_id: input.organizationId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      line_items: [{ price: input.priceId, quantity: 1 }],
      // Stamp the org + target plan onto the subscription so subscription.* webhooks (which don't
      // carry the checkout session) can still resolve the org and the plan it should land on.
      subscription_data: { metadata: { organizationId: input.organizationId, planId: input.planId } },
      metadata: { organizationId: input.organizationId, planId: input.planId },
    });
  }

  createBillingPortalSession(input: { customerId: string; returnUrl: string }): Promise<StripePortalSession> {
    return this.request('POST', '/v1/billing_portal/sessions', {
      customer: input.customerId,
      return_url: input.returnUrl,
    });
  }

  async listInvoices(input: { customerId: string; limit?: number }): Promise<StripeInvoice[]> {
    const res = await this.request<{ data: StripeInvoice[] }>('GET', '/v1/invoices', {
      customer: input.customerId,
      limit: input.limit ?? 24,
    });
    return res.data ?? [];
  }

  // Verify the Stripe-Signature header over the raw body and parse the event. Mirrors Stripe's own
  // constructEvent: HMAC-SHA256 of `${timestamp}.${rawBody}` with the endpoint secret, constant-time
  // compared against any v1 signature in the header, plus a timestamp-tolerance replay guard.
  constructEvent(payload: Buffer, signatureHeader: string | undefined): StripeEvent {
    if (!this.webhookSecret) {
      throw new ServiceUnavailableException('Billing webhook is not configured (STRIPE_WEBHOOK_SECRET unset)');
    }
    if (!signatureHeader) throw new Error('Missing Stripe-Signature header');

    let timestamp = '';
    const v1Signatures: string[] = [];
    for (const part of signatureHeader.split(',')) {
      const [key, value] = part.split('=');
      if (key === 't') timestamp = value;
      else if (key === 'v1' && value) v1Signatures.push(value);
    }
    if (!timestamp || v1Signatures.length === 0) throw new Error('Malformed Stripe-Signature header');

    const signedPayload = `${timestamp}.${payload.toString('utf8')}`;
    const expected = createHmac('sha256', this.webhookSecret).update(signedPayload).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const matched = v1Signatures.some((sig) => {
      const sigBuf = Buffer.from(sig, 'hex');
      return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
    });
    if (!matched) throw new Error('Stripe signature verification failed');

    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(ageSeconds) || ageSeconds > WEBHOOK_TOLERANCE_SECONDS) {
      throw new Error('Stripe event timestamp outside tolerance');
    }
    return JSON.parse(payload.toString('utf8')) as StripeEvent;
  }
}
