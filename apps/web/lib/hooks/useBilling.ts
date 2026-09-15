import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { OrgUsage, PurchasablePlan, BillingInvoice } from '../types';

export function useOrgUsage() {
  const { accessToken } = useAuth();
  return useQuery<OrgUsage>({
    queryKey: ['billing', 'usage'],
    queryFn: () => apiFetch('/organizations/billing/usage', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

// The public, purchasable plans for the self-serve picker. Empty when Stripe isn't configured
// (no plan carries a Stripe price) — the page then hides its upgrade controls.
export function usePurchasablePlans() {
  const { accessToken } = useAuth();
  return useQuery<PurchasablePlan[]>({
    queryKey: ['billing', 'plans'],
    queryFn: () => apiFetch('/organizations/billing/plans', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useBillingInvoices() {
  const { accessToken } = useAuth();
  return useQuery<BillingInvoice[]>({
    queryKey: ['billing', 'invoices'],
    queryFn: () => apiFetch('/organizations/billing/invoices', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

// Both of these return a Stripe-hosted URL the caller redirects the browser to.
export function useStartCheckout() {
  const { accessToken } = useAuth();
  return useMutation<{ url: string }, Error, { planId: string }>({
    mutationFn: (body) => apiFetch('/organizations/billing/checkout', { method: 'POST', body: JSON.stringify(body) }, accessToken ?? undefined),
  });
}

export function useOpenBillingPortal() {
  const { accessToken } = useAuth();
  return useMutation<{ url: string }, Error, void>({
    mutationFn: () => apiFetch('/organizations/billing/portal', { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
  });
}
