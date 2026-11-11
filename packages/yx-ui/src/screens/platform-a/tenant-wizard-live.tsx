// PLT-09 Tenant wizard, live in the YukthiX console (C-5, answer 1053): Console › Companies › New company. The steps a
// YukthiX staff member fills to open a company: company details, the default legal entity's basics, the first System
// Admin (who gets one email: the invite to set their password) and the plan's products. The company's own set-up
// (locations, departments, grades, employees) then continues in its Settings › Set-up hub (H-6).
import { useState } from 'react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { DescriptionList, Breadcrumbs, PageHeader } from '../../components/shell';
import { InlineAlert } from '../../components/feedback';
import { FieldRow, FormField, FormSection, type FormErrorItem, useSaveErrors } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Stepper } from '../../components/stepper';
import { useToast } from '../../components/notify';
import { formatINR } from '../../lib/format';
import { slugFrom } from '../console/companies';

export interface WizardProduct {
  code: string;
  name: string;
  unit: string;
  /** The price in force in rupees per unit per month, if any. */
  inr: number | null;
}
export interface WizardInput {
  name: string;
  slug: string;
  legalEntity: { name: string; pan?: string; gstin?: string };
  adminName: string;
  adminEmail: string;
  products: string[];
}
export interface LiveTenantWizard {
  products: WizardProduct[];
  /** Creates the company (the API asks for the security key); resolves with its id. */
  onCreate: (input: WizardInput) => Promise<{ id: string }>;
  onCancel: () => void;
  onOpenCompany: (id: string) => void;
  /** Stories: open on this step, with these values, or as created. */
  defaultStep?: 'company' | 'entity' | 'admin' | 'products';
  defaults?: Partial<Draft>;
  created?: { id: string; name: string; adminEmail: string };
}

type Draft = { name: string; slug: string; leName: string; pan: string; gstin: string; adminName: string; adminEmail: string; products: string[] };

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** The step each field is on (so Continue checks only its own step). */
const STEP_OF: Record<string, 'company' | 'entity' | 'admin' | 'products'> = { 'wz-name': 'company', 'wz-slug': 'company', 'wz-le-name': 'entity', 'wz-pan': 'entity', 'wz-gstin': 'entity', 'wz-admin-name': 'admin', 'wz-admin-email': 'admin', 'wz-products': 'products' };

/** The request body, or what to fix (mirrors the API; the API checks again). */
export function wizardInput(d: Draft): { input: WizardInput | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  if (d.name.trim().length < 2) errors.push({ fieldId: 'wz-name', message: 'Enter the company name' });
  if (!SLUG.test(d.slug)) errors.push({ fieldId: 'wz-slug', message: 'Company code: lowercase letters, digits and hyphens, up to 50' });
  if (d.leName.trim().length < 2) errors.push({ fieldId: 'wz-le-name', message: 'Enter the registered name' });
  if (d.pan && !PAN.test(d.pan)) errors.push({ fieldId: 'wz-pan', message: 'Enter a 10-character PAN like ABCDE1234F' });
  if (d.gstin && !GSTIN.test(d.gstin)) errors.push({ fieldId: 'wz-gstin', message: 'Enter a 15-character GSTIN like 29ABCDE1234F1Z5' });
  else if (d.gstin && d.pan && PAN.test(d.pan) && d.gstin.slice(2, 12) !== d.pan) errors.push({ fieldId: 'wz-gstin', message: 'This GSTIN does not contain the PAN above' });
  if (!d.adminName.trim()) errors.push({ fieldId: 'wz-admin-name', message: "Enter the System Admin's name" });
  if (!EMAIL.test(d.adminEmail.trim())) errors.push({ fieldId: 'wz-admin-email', message: 'Enter a work email such as ramesh@kaverifoods.in' });
  if (!d.products.length) errors.push({ fieldId: 'wz-products', message: 'Choose at least one product' });
  if (errors.length) return { input: null, errors };
  const le = { name: d.leName.trim(), ...(d.pan ? { pan: d.pan } : {}), ...(d.gstin ? { gstin: d.gstin } : {}) };
  return { input: { name: d.name.trim(), slug: d.slug, legalEntity: le, adminName: d.adminName.trim(), adminEmail: d.adminEmail.trim(), products: d.products }, errors };
}

export function LiveTenantWizardScreen({ live }: { live: LiveTenantWizard }) {
  const [d, setD] = useState<Draft>({ name: '', slug: '', leName: '', pan: '', gstin: '', adminName: '', adminEmail: '', products: live.products.length === 1 ? [live.products[0]!.code] : [], ...live.defaults });
  const [touched, setTouched] = useState({ slug: Boolean(live.defaults?.slug), le: Boolean(live.defaults?.leName) });
  const [step, setStep] = useState<string>(live.defaultStep ?? 'company');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [created, setCreated] = useState(live.created ?? null);
  const { toast } = useToast();
  const { input, errors } = wizardInput(d);
  const shown = useSaveErrors(errors);
  const { errorOf } = shown;
  const set = (patch: Partial<Draft>) =>
    setD((x) => {
      const next = { ...x, ...patch };
      if (patch.name !== undefined && !touched.slug) next.slug = slugFrom(patch.name);
      if (patch.name !== undefined && !touched.le) next.leName = patch.name;
      return next;
    });
  const stepErrors = (id: string) => errors.filter((e) => STEP_OF[e.fieldId] === id);
  const reveal = (list: FormErrorItem[]) => {
    shown.reveal();
    if (list[0]) setTimeout(() => document.getElementById(list[0]!.fieldId)?.focus(), 0);
  };
  const productName = (code: string) => live.products.find((p) => p.code === code)?.name ?? code;
  const header = <PageHeader breadcrumbs={<Breadcrumbs items={[{ label: 'Console' }, { label: 'Companies' }, { label: 'New company' }]} />} title="New company" description="Opens the company in a 30-day trial and invites its first System Admin. Their own set-up continues in the company's Settings › Set-up hub." />;
  if (created)
    return (
      <div className="yx-auth__page">
        {header}
        <InlineAlert
          tone="success"
          title={`${created.name} is ready`}
          actions={
            <>
              <Button size="sm" variant="primary" onClick={() => live.onOpenCompany(created.id)}>
                Open the company
              </Button>
              <Button size="sm" onClick={live.onCancel}>
                All companies
              </Button>
            </>
          }
        >
          {created.adminEmail} gets one email: an invite to set their password. Once signed in, they finish set-up in Settings › Set-up hub (locations, departments, grades and employees).
        </InlineAlert>
      </div>
    );
  return (
    <div className="yx-auth__page">
      {header}
      {failed && <InlineAlert tone="danger" title="The company was not created">{failed}</InlineAlert>}
      <Stepper
        title="New company"
        layout="horizontal"
        current={step}
        onCurrentChange={setStep}
        onContinue={(id) => {
          const list = stepErrors(id);
          if (list.length) {
            reveal(list);
            return false;
          }
          return true;
        }}
        review={{ title: 'Review', description: 'Check everything before you create the company.', note: <p className="yx-plt-p">Creating it asks for your security key. The System Admin gets the invite at once.</p> }}
        finishLabel="Create company"
        finishing={busy}
        onFinish={() => {
          if (!input) {
            reveal(errors);
            setStep(STEP_OF[errors[0]!.fieldId]!);
            return;
          }
          setBusy(true);
          setFailed(null);
          live
            .onCreate(input)
            .then(({ id }) => {
              setCreated({ id, name: input.name, adminEmail: input.adminEmail });
              toast({ tone: 'success', title: 'Company created', description: `${input.adminEmail} gets the invite.` });
            })
            .catch((e: unknown) => setFailed(e instanceof Error && e.message ? e.message : 'That did not go through. Try again.'))
            .finally(() => setBusy(false));
        }}
        steps={[
          {
            id: 'company',
            title: 'Company details',
            description: 'Name and company code',
            content: (
              <FormSection title="Company details">
                <FormField id="wz-name" label="Company name" required error={errorOf('wz-name')}>
                  <TextField value={d.name} onChange={(name) => set({ name })} maxLength={200} />
                </FormField>
                <FieldRow>
                  <FormField id="wz-slug" label="Company code" required helper="People type it when they sign in. It cannot change later." error={errorOf('wz-slug')}>
                    <TextField value={d.slug} onChange={(slug) => (setTouched((t) => ({ ...t, slug: true })), set({ slug: slug.toLowerCase().trim() }))} maxLength={50} />
                  </FormField>
                  <FormField label="Data region" helper="Fixed after sign-up.">
                    <TextField value="India (IN)" readOnly />
                  </FormField>
                </FieldRow>
              </FormSection>
            ),
            summary: <DescriptionList items={[{ label: 'Company', value: d.name || '—' }, { label: 'Company code', value: d.slug || '—' }, { label: 'Region', value: 'India (IN)' }]} />,
          },
          {
            id: 'entity',
            title: 'Legal entity',
            description: 'The default employer',
            content: (
              <FormSection title="Legal entity" description="The company that employs people. The System Admin can add more entities and their addresses later.">
                <FormField id="wz-le-name" label="Registered name" required error={errorOf('wz-le-name')}>
                  <TextField value={d.leName} onChange={(leName) => (setTouched((t) => ({ ...t, le: true })), set({ leName }))} maxLength={200} />
                </FormField>
                <FieldRow>
                  <FormField id="wz-pan" label="PAN" optional error={errorOf('wz-pan')}>
                    <TextField value={d.pan} onChange={(pan) => set({ pan: pan.toUpperCase().trim() })} maxLength={10} />
                  </FormField>
                  <FormField id="wz-gstin" label="GSTIN" optional error={errorOf('wz-gstin')}>
                    <TextField value={d.gstin} onChange={(gstin) => set({ gstin: gstin.toUpperCase().trim() })} maxLength={15} />
                  </FormField>
                </FieldRow>
              </FormSection>
            ),
            summary: <DescriptionList items={[{ label: 'Registered name', value: d.leName || '—' }, { label: 'PAN', value: d.pan || 'Later' }, { label: 'GSTIN', value: d.gstin || 'Later' }]} />,
          },
          {
            id: 'admin',
            title: 'First System Admin',
            description: 'Gets the invite',
            content: (
              <FormSection title="First System Admin" description="They get one email: an invite to set their password. Nothing else is shared or sent.">
                <FieldRow>
                  <FormField id="wz-admin-name" label="Name" required error={errorOf('wz-admin-name')}>
                    <TextField value={d.adminName} onChange={(adminName) => set({ adminName })} maxLength={120} />
                  </FormField>
                  <FormField id="wz-admin-email" label="Work email" required error={errorOf('wz-admin-email')}>
                    <TextField type="email" value={d.adminEmail} onChange={(adminEmail) => set({ adminEmail })} maxLength={320} />
                  </FormField>
                </FieldRow>
              </FormSection>
            ),
            summary: <DescriptionList items={[{ label: 'System Admin', value: d.adminName ? `${d.adminName} · ${d.adminEmail}` : '—' }]} />,
          },
          {
            id: 'products',
            title: 'Plan and products',
            description: '30-day trial',
            content: (
              <FormSection title="Plan and products" description="One plan per product, every feature included. The company starts a 30-day trial.">
                <FormField label="Products" required error={errorOf('wz-products')}>
                  <div id="wz-products" tabIndex={-1} className="yx-auth__stack" role="group" aria-label="Products">
                    {live.products.map((p) => (
                      <Checkbox
                        key={p.code}
                        id={`wz-product-${p.code}`}
                        label={p.name}
                        description={p.inr !== null ? `${formatINR(p.inr)} per ${p.unit} per month after the trial, before GST` : undefined}
                        checked={d.products.includes(p.code)}
                        onChange={(on) => set({ products: on ? [...d.products, p.code] : d.products.filter((x) => x !== p.code) })}
                      />
                    ))}
                  </div>
                </FormField>
              </FormSection>
            ),
            summary: <DescriptionList items={[{ label: 'Products', value: d.products.map(productName).join(', ') || '—' }, { label: 'Plan', value: '30-day trial' }]} />,
          },
        ]}
      />
    </div>
  );
}
