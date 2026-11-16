import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService, AuditService } from '@exam-platform/shared';
import { StripeClient, StripeEvent, StripeInvoice } from './stripe.client';

const SUPER_ADMIN: TenantContext = { organizationId: null, isSuperAdmin: true };

// Maps a Stripe subscription.status onto our Organization.billingStatus. Anything we don't
// explicitly recognise leaves the current status untouched (returns null).
function mapBillingStatus(stripeStatus: string): string | null {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return null; // incomplete, paused, etc. -- don't flip our status on a transient state
  }
}

export interface InvoiceView {
  id: string;
  number: string | null;
  status: string | null;
  amountPaid: number;
  currency: string;
  createdAt: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

@Injectable()
export class BillingCheckoutService {
  private readonly logger = new Logger(BillingCheckoutService.name);

  constructor(
    private readonly stripe: StripeClient,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listInvoices(context: TenantContext): Promise<InvoiceView[]> {
    const orgId = context.organizationId as string;
    const org = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.organization.findFirst({ where: { id: orgId }, select: { stripeCustomerId: true } }),
    );
    if (!org?.stripeCustomerId) return []; // never subscribed -> no invoices, not an error
    const invoices = await this.stripe.listInvoices({ customerId: org.stripeCustomerId });
    return invoices.map((i: StripeInvoice) => ({
      id: i.id,
      number: i.number,
      status: i.status,
      amountPaid: i.amount_paid,
      currency: i.currency,
      createdAt: new Date(i.created * 1000).toISOString(),
      hostedInvoiceUrl: i.hosted_invoice_url,
      invoicePdf: i.invoice_pdf,
    }));
  }

  // Fulfillment. Idempotent (state is set from the event's current values, so a Stripe retry is a
  // no-op). Runs outside any request/tenant context, so it resolves + writes the org via the base
  // client keyed by the Stripe customer/subscription metadata.
  async handleWebhookEvent(event: StripeEvent): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as { customer?: string; subscription?: string; metadata?: Record<string, string>; client_reference_id?: string };
        const orgId = session.metadata?.organizationId ?? session.client_reference_id;
        if (!orgId) return this.warnMissing(event, 'organizationId');
        await this.applyToOrg(orgId, {
          stripeCustomerId: session.customer ?? undefined,
          stripeSubscriptionId: session.subscription ?? undefined,
          planId: session.metadata?.planId,
          billingStatus: 'active',
        });
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as { id: string; customer?: string; status: string; metadata?: Record<string, string>; items?: { data?: { price?: { id?: string } }[] } };
        const orgId = await this.resolveOrgId(sub.metadata?.organizationId, sub.customer);
        if (!orgId) return this.warnMissing(event, 'org (by metadata/customer)');
        const priceId = sub.items?.data?.[0]?.price?.id;
        const planId = priceId ? (await this.prisma.plan.findFirst({ where: { stripePriceId: priceId }, select: { id: true } }))?.id : undefined;
        await this.applyToOrg(orgId, {
          stripeSubscriptionId: sub.id,
          planId, // plan change made in the Billing Portal lands here
          billingStatus: mapBillingStatus(sub.status) ?? undefined,
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as { id: string; customer?: string; metadata?: Record<string, string> };
        const orgId = await this.resolveOrgId(sub.metadata?.organizationId, sub.customer);
        if (!orgId) return this.warnMissing(event, 'org (by metadata/customer)');
        const trial = await this.prisma.plan.findFirst({ where: { name: 'trial' }, select: { id: true } });
        await this.applyToOrg(orgId, {
          billingStatus: 'canceled',
          stripeSubscriptionId: null,
          planId: trial?.id, // downgrade to trial so quotas re-apply; keep customer id for reactivation
        });
        break;
      }
      default:
        // Unhandled event types are acknowledged (200) so Stripe stops retrying them.
        break;
    }
  }

  private async resolveOrgId(metadataOrgId: string | undefined, customerId: string | undefined): Promise<string | undefined> {
    if (metadataOrgId) return metadataOrgId;
    if (!customerId) return undefined;
    const org = await this.prisma.organization.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } });
    return org?.id;
  }

  private async applyToOrg(
    orgId: string,
    patch: { stripeCustomerId?: string; stripeSubscriptionId?: string | null; planId?: string; billingStatus?: string },
  ): Promise<void> {
    const data: Record<string, unknown> = {};
    if (patch.stripeCustomerId !== undefined) data.stripeCustomerId = patch.stripeCustomerId;
    if (patch.stripeSubscriptionId !== undefined) data.stripeSubscriptionId = patch.stripeSubscriptionId;
    if (patch.planId !== undefined) data.planId = patch.planId;
    if (patch.billingStatus !== undefined) data.billingStatus = patch.billingStatus;
    if (Object.keys(data).length === 0) return;
    await this.prisma.organization.update({ where: { id: orgId }, data });
    await this.audit.record(SUPER_ADMIN, { actorUserId: null, action: 'billing.subscription_synced', entityType: 'organization', entityId: orgId, metadata: data });
    this.logger.log(`Billing synced for org ${orgId}: ${JSON.stringify(data)}`);
  }

  private warnMissing(event: StripeEvent, what: string): void {
    this.logger.warn(`Stripe ${event.type} (${event.id}) could not resolve ${what}; skipping`);
  }
}
