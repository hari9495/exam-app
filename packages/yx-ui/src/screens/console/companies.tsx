import { useMemo, useState } from 'react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { EmptyState } from '../../components/feedback';
import { FormField, FormSection, type FormErrorItem, useSaveErrors } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { DataTable, type TableColumn } from '../../components/table';
import { EditorDrawer, useRun } from '../org/org-kit';
import { ConsolePage, LIFECYCLE_LABEL, LIFECYCLE_TONE, day, productNames } from './console-kit';
import type { CompanyRow, Lifecycle, LoadState, NewCompany, Product } from './types';

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "Godavari Agro Pvt Ltd" → "godavari-agro-pvt-ltd". */
export const slugFrom = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');

/** The request body, or what to fix. Mirrors the API's checks; the API checks again. */
export function companyInput(d: NewCompany): { input: NewCompany | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  if (d.name.trim().length < 2) errors.push({ fieldId: 'co-name', message: 'Enter the company name' });
  if (!SLUG.test(d.slug)) errors.push({ fieldId: 'co-slug', message: 'Company code: lowercase letters, digits and hyphens, up to 50' });
  if (!d.adminName.trim()) errors.push({ fieldId: 'co-admin-name', message: "Enter the System Admin's name" });
  if (!EMAIL.test(d.adminEmail.trim())) errors.push({ fieldId: 'co-admin-email', message: 'Enter a work email such as ramesh@kaverifoods.in' });
  if (!d.products.length) errors.push({ fieldId: 'co-products', message: 'Choose at least one product' });
  return errors.length ? { input: null, errors } : { input: { name: d.name.trim(), slug: d.slug, adminName: d.adminName.trim(), adminEmail: d.adminEmail.trim(), products: d.products }, errors };
}

function NewCompanyDrawer({ products, onClose, onCreate }: { products: Product[]; onClose: () => void; onCreate: (input: NewCompany) => Promise<void> }) {
  const [draft, setDraft] = useState<NewCompany>({ name: '', slug: '', adminName: '', adminEmail: '', products: [] });
  const [slugTouched, setSlugTouched] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const set = (patch: Partial<NewCompany>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const { input, errors } = companyInput(draft);
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  const save = () => {
    if (!input) return saveErrors.reveal();
    void run('save', () => onCreate(input)).then((ok) => ok && onClose());
  };
  return (
    <EditorDrawer open onClose={onClose} dirty={dirty} title="New company" subtitle="Starts a 30-day trial" errors={saveErrors.shownErrors} saving={busy === 'save'} failed={error} saveLabel="Create company" onSave={save}>
      <FormSection title="Company">
        <FormField id="co-name" label="Company name" required error={errorOf('co-name')}>
          <TextField value={draft.name} onChange={(name) => set({ name, ...(slugTouched ? {} : { slug: slugFrom(name) }) })} maxLength={200} />
        </FormField>
        <FormField id="co-slug" label="Company code" required helper="People type this when they sign in. It cannot be changed later." error={errorOf('co-slug')}>
          <TextField
            value={draft.slug}
            onChange={(slug) => {
              setSlugTouched(true);
              set({ slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 50) });
            }}
          />
        </FormField>
        <FormField id="co-products" label="Products" required error={errorOf('co-products')}>
          <div className="yx-auth__stack">
            {products.map((p) => (
              <Checkbox
                key={p.code}
                label={p.name}
                description={`Billed per ${p.unit}`}
                checked={draft.products.includes(p.code)}
                onChange={(on) => set({ products: on ? [...draft.products, p.code] : draft.products.filter((c) => c !== p.code) })}
              />
            ))}
          </div>
        </FormField>
      </FormSection>
      <FormSection title="First System Admin" description="Gets an email to set a password. They can add the other admins.">
        <FormField id="co-admin-name" label="Name" required error={errorOf('co-admin-name')}>
          <TextField value={draft.adminName} onChange={(adminName) => set({ adminName })} maxLength={120} />
        </FormField>
        <FormField id="co-admin-email" label="Work email" required error={errorOf('co-admin-email')}>
          <TextField type="email" value={draft.adminEmail} onChange={(adminEmail) => set({ adminEmail })} maxLength={320} autoComplete="off" />
        </FormField>
      </FormSection>
    </EditorDrawer>
  );
}

export interface CompaniesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  companies: CompanyRow[];
  products: Product[];
  canManage: boolean;
  onOpen: (id: string) => void;
  /** Resolves with the new company's id. */
  onCreate: (input: NewCompany) => Promise<void>;
}

/** Console › Companies (P14 §7 tenants list): search, lifecycle filter, open one. Account facts only, never HR data. */
export function CompaniesScreen(props: CompaniesScreenProps) {
  const [creating, setCreating] = useState<number | null>(null);
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
  const add = <Button variant="primary" onClick={() => setCreating(Date.now())}>New company</Button>;
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
      {creating && <NewCompanyDrawer key={creating} products={props.products} onClose={() => setCreating(null)} onCreate={props.onCreate} />}
    </ConsolePage>
  );
}
