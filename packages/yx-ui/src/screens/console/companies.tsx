import { useMemo, useState } from 'react';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { DataTable, type TableColumn } from '../../components/table';
import { ConsolePage, LIFECYCLE_LABEL, LIFECYCLE_TONE, day, productNames } from './console-kit';
import type { CompanyRow, Lifecycle, LoadState, Product } from './types';

/** "Godavari Agro Pvt Ltd" → "godavari-agro-pvt-ltd". */
export const slugFrom = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');

export interface CompaniesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  companies: CompanyRow[];
  products: Product[];
  canManage: boolean;
  onOpen: (id: string) => void;
  /** Answer 1053: opens the company wizard (PLT-09, Console › Companies › New company). */
  onNew: () => void;
}

/** Console › Companies (P14 §7 tenants list): search, lifecycle filter, open one. Account facts only, never HR data. */
export function CompaniesScreen(props: CompaniesScreenProps) {
  const [search, setSearch] = useState('');
  const [lifecycle, setLifecycle] = useState<Lifecycle | null>(null);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return props.companies.filter((c) => (!lifecycle || c.lifecycle === lifecycle) && (!q || c.name.toLowerCase().includes(q) || c.slug.includes(q)));
  }, [props.companies, search, lifecycle]);

  const columns: TableColumn<CompanyRow>[] = [
    {
      key: 'name',
      header: 'Company',
      value: (c) => c.name,
      render: (c) => (
        <span className="yx-auth__item-main">
          <Text weight="medium">{c.name}</Text>
          <Text tone="secondary" size="sm">{c.slug}</Text>
        </span>
      ),
      hideable: false,
    },
    { key: 'lifecycle', header: 'State', type: 'status', value: (c) => LIFECYCLE_LABEL[c.lifecycle], statusTone: (_v, c) => LIFECYCLE_TONE[c.lifecycle], width: 120 },
    { key: 'products', header: 'Products', value: (c) => productNames(c.products), width: 200, optional: true },
    { key: 'employees', header: 'Employee records', type: 'number', value: (c) => c.employees, width: 150, optional: true },
    { key: 'trial', header: 'Trial ends', value: (c) => (c.lifecycle === 'trial' ? day(c.trialEndsAt) : '—'), width: 130, optional: true },
    { key: 'created', header: 'Created', value: (c) => day(c.createdAt), width: 130, optional: true },
  ];
  const add = <Button variant="primary" onClick={props.onNew}>New company</Button>;
  return (
    <ConsolePage
      crumb="Companies"
      title="Companies"
      description="Every company on YukthiX. Opening one shows its account, never its HR data: for that, ask the company for a support session."
      actions={props.canManage ? add : undefined}
      state={props.state}
      onRetry={props.onRetry}
      what="the companies"
    >
      <DataTable
        label="Companies"
        columns={columns}
        rows={rows}
        getRowId={(c) => c.id}
        rowNoun={['company', 'companies']}
        cardSummary
        filtered={Boolean(search || lifecycle)}
        onClearFilters={() => {
          setSearch('');
          setLifecycle(null);
        }}
        toolbar={
          <div className="yx-console__filters">
            <FormField label="Search companies" hideLabel>
              <TextField value={search} onChange={setSearch} placeholder="Search by name or code" size="sm" />
            </FormField>
            <div className="yx-console__filter">
              <Select<Lifecycle> value={lifecycle} onChange={setLifecycle} clearable placeholder="Any state" size="sm" aria-label="State" options={(Object.keys(LIFECYCLE_LABEL) as Lifecycle[]).map((v) => ({ value: v, label: LIFECYCLE_LABEL[v] }))} />
            </div>
          </div>
        }
        onRowClick={(c) => props.onOpen(c.id)}
        rowButtons={(c) => <Button size="sm" onClick={() => props.onOpen(c.id)}>Open</Button>}
        empty={<EmptyState compact title="No companies yet." description="Create the first one: it starts a 30-day trial." action={props.canManage ? add : undefined} />}
      />
    </ConsolePage>
  );
}
