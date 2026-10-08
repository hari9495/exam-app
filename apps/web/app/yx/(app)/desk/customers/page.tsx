'use client';

import { useEffect, useState } from 'react';
import { CustomersScreen, type CustomerAccount, type CustomerAccountRow, type DeskSummary, type Product } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Service desk › Customers (SD-1.21, SD-1.22, SD-1.28): companies, their people and plans, products, and which
// companies an agent may work on. Changed with desk.customer.manage; agents on Customer support desks may read.
export default function YxDeskCustomersPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const perms = useYxPermissions();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(h);
  }, [search]);
  const accounts = useDesk<CustomerAccountRow[]>(`/customers/accounts${q ? `?search=${encodeURIComponent(q)}` : ''}`, { keepPrevious: true });
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (!selected && accounts.data?.length) setSelected(accounts.data[0].id);
  }, [accounts.data, selected]);
  const account = useDesk<CustomerAccount>(selected ? `/customers/accounts/${selected}` : null);
  const products = useDesk<Product[]>('/customers/products');
  const desks = useDesk<DeskSummary[]>('/desks');
  const write = useDeskWrite();
  const id = selected ? encodeURIComponent(selected) : '';
  return (
    <CustomersScreen
      state={deskState(accounts)}
      onRetry={() => void accounts.refetch()}
      canManage={perms.has('desk.customer.manage')}
      accounts={accounts.data ?? []}
      search={search}
      onSearch={setSearch}
      selectedId={selected}
      onSelect={setSelected}
      account={account.data ?? null}
      products={products.data ?? []}
      desks={desks.data ?? []}
      onCreateAccount={async (input) => {
        const a = await write<{ id: string }>('/customers/accounts', 'POST', input);
        setSelected(a.id);
      }}
      onUpdateAccount={async (a, change) => {
        await write(`/customers/accounts/${encodeURIComponent(a.id)}`, 'PATCH', { version: a.version, ...change });
      }}
      onAddContact={async (input) => {
        await write(`/customers/accounts/${id}/contacts`, 'POST', input);
      }}
      onUpdateContact={async (contactId, change) => {
        await write(`/customers/contacts/${encodeURIComponent(contactId)}`, 'PATCH', change);
      }}
      onAddPlan={async (input) => {
        await write(`/customers/accounts/${id}/entitlements`, 'POST', input);
      }}
      onEndPlan={async (entitlementId, validTo) => {
        await write(`/customers/entitlements/${encodeURIComponent(entitlementId)}/end`, 'POST', { validTo });
      }}
      onSaveProduct={async (productId, input) => {
        await write(productId ? `/customers/products/${encodeURIComponent(productId)}` : '/customers/products', productId ? 'PATCH' : 'POST', input);
      }}
      onSearchUsers={(s) => apiFetch(`/desk/users?search=${encodeURIComponent(s)}`, {}, token)}
      onLoadAgentAccounts={(userId) => apiFetch(`/desk/customers/agents/${encodeURIComponent(userId)}/accounts`, {}, token) as Promise<string[]>}
      onSetAgentAccounts={async (userId, accountIds) => {
        await write(`/customers/agents/${encodeURIComponent(userId)}/accounts`, 'PUT', { accountIds });
      }}
    />
  );
}
