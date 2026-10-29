// PAY-51 · Country packs (/yx/payroll/country-packs): a legal entity outside India is paid once its country's pack is
// switched on (the pack's rules in force, its set-up complete). UAE: end-of-service gratuity provision, WPS ids and the
// WPS salary file. US: W-9 per contractor and the 1099-NEC file and recipient copies. One screen: the stories drive it
// with sample data inside the PayFrame; the live page passes the API's data and actions (`live`).
import { useState, type ReactNode } from 'react';
import { FileText, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { DatePicker } from '../../components/date';
import { TextField } from '../../components/inputs';
import { useToast } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { PersonPicker, Select, type PersonOption } from '../../components/select';
import { PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { useRun } from '../org/org-kit';
import { LivePage } from '../time/live/kit';
import { EMPLOYEES, TODAY } from '../_kit/data';
import { FactRow, PayFrame, SectionTitle, StateBlock } from './pay-kit';
import type { LoadState } from './live/types';
import type { SetupEntity } from './live/types-5b';
import type { NecSummary, PackStatus } from './live/types-5i';

type Hit = { id: string; name: string; employeeCode?: string };
type Eosb = { total: string; rows: { employeeId: string; accrued: string; monthly: string }[] };
export type W9Input = { consultantId: string; tinKind: 'SSN' | 'EIN'; tin: string; legalName: string; street: string; city: string; state: string; zip: string; receivedOn: string };
export type WpsIdsInput = { employeeId: string; personId: string; routingCode: string; iban: string };

/** The live page's data and actions (the old CountryPacksScreen props). Every action is checked again by the API. */
export interface LiveCountryPacks {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  status: PackStatus | null;
  nec: NecSummary | null;
  year: number;
  onYear: (y: number) => void;
  /** yyyy-mm-dd, India time: the months offered for the provision and the years for the 1099-NEC. */
  today?: string;
  onSwitchOn: (settings: Record<string, string>) => Promise<unknown>;
  onEosb: (month: string) => Promise<Eosb>;
  onNecFile: () => Promise<unknown>;
  onNecCopy: (consultantId: string) => Promise<unknown>;
  onW9: (x: W9Input) => Promise<unknown>;
  onSearch: (q: string) => Promise<Hit[]>;
  onWpsIds: (x: WpsIdsInput) => Promise<unknown>;
  /** Approved runs of the entity, for its WPS salary file. */
  runs: { id: string; label: string }[];
  onWpsFile: (runId: string) => Promise<unknown>;
}

const DESCRIPTION = "A legal entity outside India is paid once its country's pack is switched on: the pack's rules in force and its set-up complete.";

export type CountryPacksVariant = 'off' | 'uae' | 'us' | 'india';
export type CountryPacksDialog = 'switch-on' | 'wps' | 'w9';

/** PAY-51 · Country packs. */
export function CountryPacksScreen({ live, ...story }: { variant?: CountryPacksVariant; state?: 'ready' | 'loading' | 'error' | 'empty' | 'no-access'; dialog?: CountryPacksDialog; /** The live app's /yx/payroll/country-packs. */ live?: LiveCountryPacks }) {
  return live ? (
    <LivePage title="Country packs" description={DESCRIPTION} state={live.state} onRetry={live.onRetry} what="country packs" grantedBy="your payroll admin">
      <PacksView live={live} />
    </LivePage>
  ) : (
    <SamplePacks {...story} />
  );
}

/* ------------------------------------------------------------------ the screen (stories and live) */

const MONTH_LABEL = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
/** The last six months, newest first, as yyyy-mm. */
const lastMonths = (today: string) =>
  Array.from({ length: 6 }, (_, i) => {
    const x = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1));
    return x.toISOString().slice(0, 7);
  });
const isoDay = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const COUNTRY: Record<string, string> = { AE: 'UAE', US: 'US', IN: 'India' };

function PacksView({ live, dialog }: { live: LiveCountryPacks; dialog?: CountryPacksDialog }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const today = live.today ?? new Date().toISOString().slice(0, 10);
  const s = live.status;
  const [switching, setSwitching] = useState(dialog === 'switch-on');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [month, setMonth] = useState<string | null>(null);
  const [eosb, setEosb] = useState<Eosb | null>(null);
  const [wpsRun, setWpsRun] = useState<string | null>(null);
  const [wps, setWps] = useState(dialog === 'wps');
  const [w9, setW9] = useState<{ consultantId: string; name: string } | null>(dialog === 'w9' && live.nec ? (live.nec.rows.find((r) => !r.w9) ?? null) : null);
  const value = (k: string) => settings[k] ?? s?.settings[k] ?? '';
  const switchCheck = useTooEarly((s?.manifest?.settings ?? []).filter((x) => !new RegExp(`^(?:${x.pattern})$`).test(value(x.key).trim())).map((x) => ({ fieldId: `cp-${x.key}`, message: `${x.label}: check the format.` })));
  const eosbCheck = useTooEarly(month ? [] : [{ fieldId: 'cp-month', message: 'Choose the month.' }]);
  const wpsCheck = useTooEarly(wpsRun ? [] : [{ fieldId: 'cp-run', message: 'Choose an approved payroll.' }]);
  const on = !!s?.needed && s.switchedOn;
  const thisYear = Number(today.slice(0, 4));
  const necCols: TableColumn<NecSummary['rows'][number]>[] = [
    { key: 'name', header: 'Contractor', value: (r) => r.name },
    { key: 'paid', header: 'Paid in the year', value: (r) => Number(r.paid), render: (r) => `$${Number(r.paid).toLocaleString('en-US')}` },
    { key: 'form', header: '1099-NEC', type: 'status', value: (r) => (r.due ? 'Form due' : `Below $${live.nec?.threshold ?? ''}`), statusTone: (_v, r) => (r.due ? 'info' : 'neutral') },
    { key: 'w9', header: 'W-9', value: (r) => (r.w9 ? (r.tin ?? 'On file') : 'Missing'), render: (r) => (r.w9 ? (r.tin ?? 'On file') : <Badge tone="warning">Missing</Badge>) },
  ];
  return (
    <div className="yx-pay-stack">
      <div className="yx-pay-row">
        <FormField id="pay-entity" label="Legal entity">
          <Select value={live.entityId} onChange={live.onEntity} placeholder="Choose a legal entity" options={live.entities.map((e) => ({ value: e.id, label: e.name }))} />
        </FormField>
      </div>
      {error && (
        <InlineAlert tone="danger" title="That did not go through">
          {error}
        </InlineAlert>
      )}
      {!live.entityId ? (
        <EmptyState title="No legal entity chosen" description="A country pack is switched on per legal entity. Choose one above." />
      ) : !s ? (
        <StateBlock state="loading">{null}</StateBlock>
      ) : !s.needed ? (
        <InlineAlert tone="info" title="India">
          Indian legal entities use the India rules; there is nothing to switch on.
        </InlineAlert>
      ) : (
        <section className="yx-pay-panel" aria-label="Country pack">
          <SectionTitle
            actions={
              s.manifest && (
                <Button variant={on ? undefined : 'primary'} onClick={() => setSwitching(true)}>
                  {on ? 'Edit set-up' : 'Switch on'}
                </Button>
              )
            }
          >
            {COUNTRY[s.country] ?? s.country} pack{s.manifest ? ` · ${s.manifest.version}` : ''} {on ? <Badge tone="success">Switched on</Badge> : <Badge tone="warning">Not switched on</Badge>}
          </SectionTitle>
          {s.manifest && <FactRow items={[{ label: 'Currency', value: s.manifest.currency }, { label: 'Needs', value: s.manifest.requires.join(', ') || 'Nothing else' }]} />}
          {!s.manifest && <InlineAlert tone="warning" title="No pack for this country yet">Payroll for this entity can't run until a pack is published for {COUNTRY[s.country] ?? s.country}.</InlineAlert>}
          {s.missing.length > 0 && (
            <InlineAlert tone="warning" title="Before it can be switched on">
              <ul>
                {s.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </InlineAlert>
          )}
        </section>
      )}
      {on && s?.country === 'AE' && (
        <>
          <section className="yx-pay-panel" aria-label="End-of-service gratuity provision">
            <SectionTitle>End-of-service gratuity provision</SectionTitle>
            <div className="yx-pay-row">
              <FormField id="cp-month" label="Month" required error={eosbCheck.errorOf('cp-month')}>
                <Select id="cp-month" value={month} onChange={setMonth} placeholder="Choose a month" options={lastMonths(today).map((m) => ({ value: m, label: MONTH_LABEL(m) }))} />
              </FormField>
              <Button
                loading={busy === 'eosb'}
                onClick={() => {
                  if (eosbCheck.stop()) return;
                  void run('eosb', async () => setEosb(await live.onEosb(month!)));
                }}
              >
                Work out the provision
              </Button>
            </div>
            {eosb && month && (
              <FactRow
                items={[
                  { label: `Provision for ${MONTH_LABEL(month)}`, value: `${eosb.total} AED` },
                  { label: 'People', value: String(eosb.rows.length) },
                ]}
              />
            )}
          </section>
          <section className="yx-pay-panel" aria-label="WPS salary file">
            <SectionTitle
              actions={
                <Button icon={Plus} onClick={() => setWps(true)}>
                  Record WPS ids
                </Button>
              }
            >
              WPS salary file
            </SectionTitle>
            <div className="yx-pay-row">
              <FormField id="cp-run" label="Approved payroll" required error={wpsCheck.errorOf('cp-run')}>
                <Select id="cp-run" value={wpsRun} onChange={setWpsRun} placeholder={live.runs.length ? 'Choose a payroll' : 'No approved payroll yet'} options={live.runs.map((x) => ({ value: x.id, label: x.label }))} />
              </FormField>
              <Button
                variant="primary"
                icon={FileText}
                loading={busy === 'wps'}
                onClick={() => {
                  if (wpsCheck.stop()) return;
                  void run('wps', async () => {
                    await live.onWpsFile(wpsRun!);
                    toast({ tone: 'success', title: 'WPS file made. Someone else releases it from Payroll files.' });
                  });
                }}
              >
                Make the WPS file
              </Button>
            </div>
            <p className="yx-pay-note">The file is released from Payroll files by someone other than its maker, then sent to the WPS agent.</p>
          </section>
        </>
      )}
      {on && s?.country === 'US' && (
        <section className="yx-pay-panel" aria-label="1099-NEC">
          <SectionTitle
            actions={
              <Button
                variant="primary"
                icon={FileText}
                loading={busy === 'nec'}
                onClick={() =>
                  void run('nec', async () => {
                    await live.onNecFile();
                    toast({ tone: 'success', title: `1099-NEC file for ${live.year} downloaded.` });
                  })
                }
              >
                Make the 1099-NEC file
              </Button>
            }
          >
            1099-NEC
          </SectionTitle>
          <FormField label="Calendar year">
            <Segment label="Calendar year" value={String(live.year)} onChange={(y) => live.onYear(Number(y))} options={[thisYear - 2, thisYear - 1, thisYear].map((y) => ({ value: String(y), label: String(y) }))} />
          </FormField>
          <DataTable
            label="Contractors paid"
            columns={necCols}
            rows={live.nec?.rows ?? []}
            state={live.nec ? 'ready' : 'loading'}
            getRowId={(r) => r.consultantId}
            rowButtons={(r) =>
              !r.w9 ? (
                <Button size="sm" onClick={() => setW9({ consultantId: r.consultantId, name: r.name })}>
                  Record W-9
                </Button>
              ) : r.due ? (
                <Button size="sm" loading={busy === r.consultantId} onClick={() => void run(r.consultantId, () => live.onNecCopy(r.consultantId))}>
                  Recipient copy
                </Button>
              ) : null
            }
            empty={<EmptyState title="No contractors paid this year" description="Consultants paid by this entity show here with what they were paid." />}
          />
        </section>
      )}
      {s?.manifest && (
        <ConfirmDialog
          open={switching}
          onOpenChange={(o) => {
            setSwitching(o);
            if (!o) switchCheck.reset();
          }}
          title={on ? `${COUNTRY[s.country] ?? s.country} pack set-up` : `Switch on the ${COUNTRY[s.country] ?? s.country} pack?`}
          consequence={on ? 'Changes apply from the next payroll.' : `Payroll for this entity then follows the ${s.manifest.version} rules.`}
          confirmLabel={on ? 'Save set-up' : 'Switch on'}
          onConfirm={async () => {
            if (switchCheck.stop()) return false;
            await live.onSwitchOn({ ...s.settings, ...Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, v.trim()])) });
            toast({ tone: 'success', title: on ? 'Set-up saved.' : `${COUNTRY[s.country] ?? s.country} pack switched on.` });
          }}
        >
          <div className="yx-pay-stack">
            {s.manifest.settings.map((x) => (
              <FormField key={x.key} id={`cp-${x.key}`} label={x.label} required error={switchCheck.errorOf(`cp-${x.key}`)}>
                <TextField value={value(x.key)} onChange={(v) => setSettings({ ...settings, [x.key]: v })} />
              </FormField>
            ))}
          </div>
        </ConfirmDialog>
      )}
      {wps && <WpsDrawer onSearch={live.onSearch} onClose={() => setWps(false)} onSave={live.onWpsIds} />}
      {w9 && <W9Drawer who={w9} onClose={() => setW9(null)} onSave={live.onW9} />}
    </div>
  );
}

function SaveDrawer({ title, subtitle, onClose, onSave, stop, children }: { title: string; subtitle: string; onClose: () => void; onSave: () => Promise<unknown>; stop: () => boolean; children: ReactNode }) {
  const { busy, error, run } = useRun();
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (stop()) return;
              void run('save', async () => {
                await onSave();
                onClose();
              });
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="yx-pay-stack">
        {error && (
          <InlineAlert tone="danger" title="That did not go through">
            {error}
          </InlineAlert>
        )}
        {children}
      </div>
    </Drawer>
  );
}

function W9Drawer({ who, onClose, onSave }: { who: { consultantId: string; name: string }; onClose: () => void; onSave: (x: W9Input) => Promise<unknown> }) {
  const { toast } = useToast();
  const [x, setX] = useState({ tinKind: 'SSN' as 'SSN' | 'EIN', tin: '', legalName: who.name, street: '', city: '', state: '', zip: '' });
  const [on, setOn] = useState<Date | null>(null);
  const check = useTooEarly([
    ...(!/^\d{9}$/.test(x.tin) ? [{ fieldId: 'w9-tin', message: 'The TIN is 9 digits (no dashes).' }] : []),
    ...(x.legalName.trim().length < 2 ? [{ fieldId: 'w9-name', message: 'The legal name on the W-9.' }] : []),
    ...(x.street.trim().length < 3 ? [{ fieldId: 'w9-street', message: 'The street address.' }] : []),
    ...(x.city.trim().length < 2 ? [{ fieldId: 'w9-city', message: 'The city.' }] : []),
    ...(!/^[A-Za-z]{2}$/.test(x.state) ? [{ fieldId: 'w9-state', message: 'The state: 2 letters, like NY.' }] : []),
    ...(!/^\d{5}(-\d{4})?$/.test(x.zip) ? [{ fieldId: 'w9-zip', message: 'The ZIP: 5 digits, or 5+4.' }] : []),
    ...(!on ? [{ fieldId: 'w9-on', message: 'The day the W-9 was received.' }] : []),
  ]);
  const f = (id: string, label: string, k: 'tin' | 'legalName' | 'street' | 'city' | 'state' | 'zip', max: number) => (
    <FormField id={id} label={label} required error={check.errorOf(id)}>
      <TextField value={x[k]} onChange={(v) => setX({ ...x, [k]: v })} maxLength={max} inputMode={k === 'tin' || k === 'zip' ? 'numeric' : undefined} />
    </FormField>
  );
  return (
    <SaveDrawer
      title={`W-9 for ${who.name}`}
      subtitle="The TIN is stored encrypted; only the last four show."
      onClose={onClose}
      stop={check.stop}
      onSave={async () => {
        await onSave({ consultantId: who.consultantId, ...x, legalName: x.legalName.trim(), street: x.street.trim(), city: x.city.trim(), state: x.state.toUpperCase(), receivedOn: isoDay(on!) });
        toast({ tone: 'success', title: `W-9 saved for ${who.name}.` });
      }}
    >
      <FormField label="TIN type">
        <Segment label="TIN type" value={x.tinKind} onChange={(tinKind) => setX({ ...x, tinKind })} options={[{ value: 'SSN', label: 'SSN' }, { value: 'EIN', label: 'EIN' }]} />
      </FormField>
      {f('w9-tin', 'TIN', 'tin', 9)}
      {f('w9-name', 'Legal name', 'legalName', 200)}
      {f('w9-street', 'Street', 'street', 200)}
      <FieldRow>
        {f('w9-city', 'City', 'city', 100)}
        {f('w9-state', 'State', 'state', 2)}
        {f('w9-zip', 'ZIP', 'zip', 10)}
      </FieldRow>
      <FormField id="w9-on" label="Received on" required error={check.errorOf('w9-on')}>
        <DatePicker id="w9-on" value={on} onChange={setOn} />
      </FormField>
    </SaveDrawer>
  );
}

function WpsDrawer({ onSearch, onClose, onSave }: { onSearch: (q: string) => Promise<Hit[]>; onClose: () => void; onSave: (x: WpsIdsInput) => Promise<unknown> }) {
  const { toast } = useToast();
  const [hits, setHits] = useState<PersonOption[]>([]);
  const [who, setWho] = useState<string | null>(null);
  const [x, setX] = useState({ personId: '', routingCode: '', iban: '' });
  const check = useTooEarly([
    ...(!who ? [{ fieldId: 'wp-who', message: 'Choose the person.' }] : []),
    ...(!/^\d{14}$/.test(x.personId) ? [{ fieldId: 'wp-pid', message: 'The person id from the labour card: 14 digits.' }] : []),
    ...(!/^\d{9}$/.test(x.routingCode) ? [{ fieldId: 'wp-route', message: 'The bank routing code: 9 digits.' }] : []),
    ...(!/^AE\d{21}$/.test(x.iban.toUpperCase()) ? [{ fieldId: 'wp-iban', message: 'A UAE IBAN: AE and 21 digits.' }] : []),
  ]);
  return (
    <SaveDrawer
      title="WPS ids"
      subtitle="The IBAN is stored encrypted."
      onClose={onClose}
      stop={check.stop}
      onSave={async () => {
        await onSave({ employeeId: who!, ...x, iban: x.iban.toUpperCase() });
        toast({ tone: 'success', title: `WPS ids saved for ${hits.find((h) => h.id === who)?.name ?? 'the person'}.` });
      }}
    >
      <FormField id="wp-who" label="Person" required error={check.errorOf('wp-who')}>
        <PersonPicker id="wp-who" people={hits} value={who} onChange={setWho} onSearchChange={(q) => void (q.trim().length >= 2 && onSearch(q.trim()).then((r) => setHits([...hits.filter((h) => h.id === who), ...r.filter((h) => h.id !== who).map((h) => ({ id: h.id, name: h.name, role: h.employeeCode }))])))} />
      </FormField>
      <FormField id="wp-pid" label="Person id" required error={check.errorOf('wp-pid')}>
        <TextField value={x.personId} onChange={(personId) => setX({ ...x, personId })} inputMode="numeric" maxLength={14} />
      </FormField>
      <FieldRow>
        <FormField id="wp-route" label="Routing code" required error={check.errorOf('wp-route')}>
          <TextField value={x.routingCode} onChange={(routingCode) => setX({ ...x, routingCode })} inputMode="numeric" maxLength={9} />
        </FormField>
        <FormField id="wp-iban" label="IBAN" required error={check.errorOf('wp-iban')}>
          <TextField value={x.iban} onChange={(iban) => setX({ ...x, iban })} maxLength={23} />
        </FormField>
      </FieldRow>
    </SaveDrawer>
  );
}

/* ------------------------------------------------------------------ sample (stories) */

const SAMPLE_ENTITIES: SetupEntity[] = [
  { id: 'ae', name: 'Kaveri Foods FZE (Dubai)', shortName: 'KF FZE', keys: [] },
  { id: 'us', name: 'Kaveri Foods Inc (Delaware)', shortName: 'KF Inc', keys: [] },
  { id: 'in', name: 'Kaveri Foods Pvt Ltd', shortName: 'KF', keys: [] },
];
const UAE_STATUS = (on: boolean): PackStatus => ({
  country: 'AE',
  needed: true,
  switchedOn: on,
  manifest: {
    version: 'UAE 2026-v1',
    currency: 'AED',
    requires: ['MOL establishment id', 'WPS agent routing code'],
    settings: [
      { key: 'molEstablishmentId', label: 'MOL establishment id', pattern: '\\d{13}' },
      { key: 'agentRoutingCode', label: 'WPS agent routing code', pattern: '\\d{9}' },
    ],
  },
  missing: on ? [] : ['MOL establishment id', 'WPS agent routing code'],
  settings: on ? { molEstablishmentId: '1000123456789', agentRoutingCode: '803320101' } : {},
});
const US_STATUS: PackStatus = { country: 'US', needed: true, switchedOn: true, manifest: { version: 'US 2026-v1', currency: 'USD', requires: ['Employer EIN'], settings: [{ key: 'ein', label: 'Employer EIN', pattern: '\\d{9}' }] }, missing: [], settings: { ein: '981234567' } };
const NEC: NecSummary = {
  year: 2025,
  threshold: '600',
  rows: [
    { consultantId: 'c1', name: 'Hudson Data Labs LLC', paid: '18400', due: true, w9: true, tin: '•••••4417' },
    { consultantId: 'c2', name: 'Maria Lopez', paid: '7200', due: true, w9: false, tin: null },
    { consultantId: 'c3', name: 'Brooklyn Print Co', paid: '450', due: false, w9: true, tin: '•••••0932' },
  ],
};
const SAMPLE_TODAY = TODAY.toISOString().slice(0, 10);

function SamplePacks({ variant = 'off', state = 'ready', dialog }: { variant?: CountryPacksVariant; state?: 'ready' | 'loading' | 'error' | 'empty' | 'no-access'; dialog?: CountryPacksDialog }) {
  const first = variant === 'us' ? 'us' : variant === 'india' ? 'in' : 'ae';
  const [entityId, setEntityId] = useState<string | null>(state === 'empty' ? null : first);
  const [on, setOn] = useState(variant === 'uae');
  const [year, setYear] = useState(2025);
  const nap = () => new Promise((r) => setTimeout(r, 400));
  const live: LiveCountryPacks = {
    state: 'ready',
    entities: SAMPLE_ENTITIES,
    entityId,
    onEntity: setEntityId,
    status: entityId === 'us' ? US_STATUS : entityId === 'in' ? { country: 'IN', needed: false, switchedOn: false, manifest: null, missing: [], settings: {} } : UAE_STATUS(on),
    nec: year === 2025 ? NEC : { ...NEC, year, rows: [] },
    year,
    onYear: setYear,
    today: SAMPLE_TODAY,
    onSwitchOn: async () => {
      await nap();
      setOn(true);
    },
    onEosb: async () => {
      await nap();
      return { total: '41,860.00', rows: Array.from({ length: 23 }, (_, i) => ({ employeeId: `e${i}`, accrued: '0', monthly: '0' })) };
    },
    onNecFile: nap,
    onNecCopy: nap,
    onW9: nap,
    onSearch: async (q) => EMPLOYEES.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6).map((e) => ({ id: e.id, name: e.name, employeeCode: e.code })),
    onWpsIds: nap,
    runs: [
      { id: 'r9', label: 'Payroll · 2026-09' },
      { id: 'r8', label: 'Payroll · 2026-08' },
    ],
    onWpsFile: nap,
  };
  return (
    <PayFrame page="payments">
      <PageHeader title="Country packs" description={DESCRIPTION} />
      {state === 'no-access' ? (
        <NoAccessState grantedBy="your payroll admin" what="country packs" />
      ) : state === 'loading' || state === 'error' ? (
        <StateBlock state={state} rows={6}>
          {null}
        </StateBlock>
      ) : (
        <PacksView live={live} dialog={dialog} />
      )}
    </PayFrame>
  );
}
