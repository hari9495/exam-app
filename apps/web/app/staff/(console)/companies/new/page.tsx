'use client';

import { useRouter } from 'next/navigation';
import { ConsolePage, TenantWizardScreen, type Product, type WizardProduct } from '@yukthix/ui/console';
import { loadState, todayIst, useConsole, useConsoleWrite } from '../../../../../lib/yx-console';

// Console › Companies › New company (C-5, answer 1053): the PLT-09 company wizard. Creating the company is a step-up
// action (the API asks for the security key; apiFetch asks the staff member, then resends) and is audited. The first
// System Admin gets one email: the invite to set their password.
export default function ConsoleNewCompanyPage() {
  const router = useRouter();
  const products = useConsole<Product[]>('/products');
  const write = useConsoleWrite();
  const today = todayIst();
  const priceNow = (p: Product) => p.prices.filter((x) => x.currency === 'INR' && x.validFrom <= today).sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]?.unitPrice ?? null;
  const list: WizardProduct[] = (products.data ?? []).map((p) => ({ code: p.code, name: p.name, unit: p.unit, inr: priceNow(p) }));
  const state = loadState(products);
  // Loading or a failure. Staff without the companies key never see New company, and the API refuses them anyway.
  if (state !== 'ready') return <ConsolePage crumb="New company" title="New company" state={state} onRetry={() => void products.refetch()} what="the products">{null}</ConsolePage>;
  return (
    <TenantWizardScreen
      live={{
        products: list,
        onCreate: (input) => write<{ id: string }>('/companies', 'POST', input),
        onCancel: () => router.push('/staff/companies'),
        onOpenCompany: (id) => router.push(`/staff/companies/${encodeURIComponent(id)}`),
      }}
    />
  );
}
