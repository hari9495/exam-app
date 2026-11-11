'use client';

import { useRouter } from 'next/navigation';
import { CompaniesScreen, type CompanyRow, type Product } from '@yukthix/ui/console';
import { loadState, useConsole, useConsoleKeys } from '../../../../lib/yx-console';

// Console › Companies (P14 §7).
export default function ConsoleCompaniesPage() {
  const router = useRouter();
  const companies = useConsole<CompanyRow[]>('/companies');
  const products = useConsole<Product[]>('/products');
  const can = useConsoleKeys();
  return (
    <CompaniesScreen
      state={loadState(companies)}
      onRetry={() => void companies.refetch()}
      companies={companies.data ?? []}
      products={products.data ?? []}
      canManage={can('platform.companies.manage')}
      onOpen={(id) => router.push(`/staff/companies/${encodeURIComponent(id)}`)}
      // Answer 1053: New company is the company wizard (PLT-09).
      onNew={() => router.push('/staff/companies/new')}
    />
  );
}
