import { BillingCheckoutService } from './billing-checkout.service';
import type { StripeEvent } from './stripe.client';

describe('BillingCheckoutService.handleWebhookEvent', () => {
  function make() {
    const prisma = {
      organization: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      plan: { findFirst: jest.fn() },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new BillingCheckoutService({} as any, {} as any, prisma as any, audit as any);
    return { service, prisma, audit };
  }

  it('checkout.session.completed activates the org on the chosen plan', async () => {
    const { service, prisma } = make();
    const event: StripeEvent = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_1', subscription: 'sub_1', metadata: { organizationId: 'org-1', planId: 'plan-1' } } },
    };
    await service.handleWebhookEvent(event);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', planId: 'plan-1', billingStatus: 'active' },
    });
  });

  it('subscription.updated maps status and re-points the plan by price (portal plan change)', async () => {
    const { service, prisma } = make();
    prisma.plan.findFirst.mockResolvedValue({ id: 'plan-2' }); // price_2 -> plan-2
    const event: StripeEvent = {
      id: 'evt_2',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { organizationId: 'org-1' }, items: { data: [{ price: { id: 'price_2' } }] } } },
    };
    await service.handleWebhookEvent(event);
    expect(prisma.plan.findFirst).toHaveBeenCalledWith({ where: { stripePriceId: 'price_2' }, select: { id: true } });
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { stripeSubscriptionId: 'sub_1', planId: 'plan-2', billingStatus: 'active' },
    });
  });

  it('subscription.updated with past_due sets billingStatus past_due', async () => {
    const { service, prisma } = make();
    prisma.plan.findFirst.mockResolvedValue(null);
    const event: StripeEvent = {
      id: 'evt_3',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'past_due', metadata: { organizationId: 'org-1' }, items: { data: [] } } },
    };
    await service.handleWebhookEvent(event);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { stripeSubscriptionId: 'sub_1', billingStatus: 'past_due' },
    });
  });

  it('resolves the org by stripeCustomerId when metadata is absent', async () => {
    const { service, prisma } = make();
    prisma.organization.findFirst.mockResolvedValue({ id: 'org-9' });
    prisma.plan.findFirst.mockResolvedValue(null);
    const event: StripeEvent = {
      id: 'evt_4',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_9', customer: 'cus_9', status: 'active', items: { data: [] } } },
    };
    await service.handleWebhookEvent(event);
    expect(prisma.organization.findFirst).toHaveBeenCalledWith({ where: { stripeCustomerId: 'cus_9' }, select: { id: true } });
    expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-9' }, data: expect.objectContaining({ billingStatus: 'active' }) });
  });

  it('subscription.deleted cancels and downgrades to the trial plan', async () => {
    const { service, prisma } = make();
    prisma.plan.findFirst.mockResolvedValue({ id: 'trial-id' }); // name: 'trial'
    const event: StripeEvent = {
      id: 'evt_5',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', customer: 'cus_1', metadata: { organizationId: 'org-1' } } },
    };
    await service.handleWebhookEvent(event);
    expect(prisma.plan.findFirst).toHaveBeenCalledWith({ where: { name: 'trial' }, select: { id: true } });
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { billingStatus: 'canceled', stripeSubscriptionId: null, planId: 'trial-id' },
    });
  });

  it('ignores unhandled event types and events with no resolvable org', async () => {
    const { service, prisma } = make();
    prisma.organization.findFirst.mockResolvedValue(null);
    await service.handleWebhookEvent({ id: 'e', type: 'invoice.paid', data: { object: {} } });
    await service.handleWebhookEvent({ id: 'e', type: 'customer.subscription.updated', data: { object: { id: 's', status: 'active', items: { data: [] } } } });
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });
});
