import { createHmac } from 'crypto';
import { StripeClient } from './stripe.client';

function signature(payload: string, secret: string, ts: number): string {
  const v1 = createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
  return `t=${ts},v1=${v1}`;
}

describe('StripeClient.constructEvent', () => {
  const secret = 'whsec_test';
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: secret };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { customer: 'cus_1' } } });

  it('accepts a valid signature and parses the event', () => {
    const ts = Math.floor(Date.now() / 1000);
    const event = new StripeClient().constructEvent(Buffer.from(body), signature(body, secret, ts));
    expect(event.type).toBe('checkout.session.completed');
    expect((event.data.object as { customer: string }).customer).toBe('cus_1');
  });

  it('rejects a body that was tampered with after signing', () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = signature(body, secret, ts);
    expect(() => new StripeClient().constructEvent(Buffer.from(`${body} `), header)).toThrow(/verification failed/);
  });

  it('rejects a signature made with the wrong secret', () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(() => new StripeClient().constructEvent(Buffer.from(body), signature(body, 'whsec_wrong', ts))).toThrow(/verification failed/);
  });

  it('rejects a missing signature header', () => {
    expect(() => new StripeClient().constructEvent(Buffer.from(body), undefined)).toThrow(/Missing Stripe-Signature/);
  });

  it('rejects an event whose timestamp is outside the replay tolerance', () => {
    const ts = Math.floor(Date.now() / 1000) - 10_000;
    expect(() => new StripeClient().constructEvent(Buffer.from(body), signature(body, secret, ts))).toThrow(/tolerance/);
  });

  it('throws when the webhook secret is not configured', () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() => new StripeClient().constructEvent(Buffer.from(body), 't=1,v1=abc')).toThrow(/not configured/);
  });

  it('isConfigured reflects STRIPE_SECRET_KEY presence', () => {
    expect(new StripeClient().isConfigured()).toBe(true);
    delete process.env.STRIPE_SECRET_KEY;
    expect(new StripeClient().isConfigured()).toBe(false);
  });
});
