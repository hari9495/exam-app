import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { OrgUsage, BillingInvoice } from '../types';

export function useOrgUsage() {
  const { accessToken } = useAuth();
  return useQuery<OrgUsage>({
    queryKey: ['billing', 'usage'],
    queryFn: () => apiFetch('/organizations/billing/usage', {}, accessToken ?? undefined),
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
