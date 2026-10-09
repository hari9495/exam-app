'use client';

import { useRouter } from 'next/navigation';
import { CompaniesScreen, type CompanyRow, type NewCompany, type Product } from '@yukthix/ui/console';
import { loadState, useConsole, useConsoleKeys, useConsoleWrite } from '../../../../lib/yx-console';

// Console › Companies (P14 §7).
export default function ConsoleCompaniesPage() {
  const router = useRouter();
  const companies = useConsole<CompanyRow[]>('/companies');
  const products = useConsole<Product[]>('/products');
  const can = useConsoleKeys();
  const write = useConsoleWrite();
  return (
    <CompaniesScreen
      state={loadState(companies)}
      onRetry={() => void companies.refetch()}
      companies={companies.data ?? []}
      products={products.data ?? []}
      canManage={can('platform.companies.manage')}
      onOpen={(id) => router.push(`/staff/companies/${encodeURIComponent(id)}`)}
      onCreate={async (input: NewCompany) => {
        const { id } = await write<{ id: string }>('/companies', 'POST', input);
        router.push(`/staff/companies/${encodeURIComponent(id)}`);
      }}
    />
  );
}
