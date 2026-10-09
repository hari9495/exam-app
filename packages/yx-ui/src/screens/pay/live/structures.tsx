import { useEffect, useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { TextArea, TextField } from '../../../components/inputs';
import { Switch } from '../../../components/choice';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { EntityPicker, statuteText } from './setup';
import type { LoadState } from './types';
import type {
  Breakup,
  CompensationInForce,
  CompensationInput,
  ComponentInput,
  ComponentKind,
  EmployeeHit,
  FormulaCheck,
  PayComponent,
  SalaryTemplate,
  SetupEntity,
  StatutoryProfile,
  TemplateVersionInput,
} from './types-5b';

// Salary structures, batch 5b (M03 §7): the component library with its wage flags (PAY-14), templates with safe
// formulas and a sample run (PAY-13), and compensation with its CTC breakup, the statutory profile and the revision
// letter (PAY-12). Presentational: the API checks every call.

const KIND: Record<ComponentKind, string> = {
  earning: 'Earnings',
  deduction: 'Deductions',
  employer: 'Employer contributions',
  reimbursement: 'Reimbursements',
  info: 'Information only',
};
const FLAGS: [keyof PayComponent, string, string][] = [
  ['pfWage', 'PF wage', 'Counts towards the PF wage'],
  ['esiWage', 'ESI wage', 'Counts towards the ESI wage'],
  ['ptWage', 'PT wage', 'Counts towards the professional tax wage'],
  ['gratuityWage', 'Gratuity wage', 'Counts towards the gratuity wage'],
  ['bonusWage', 'Bonus wage', 'Counts towards the bonus wage'],
  ['codeWagePart', 'Code wage', 'Part of the wage under the Code on Wages'],
  ['codeExclusion', 'Code exclusion', 'Excluded from the Code wage (added back above half of pay)'],
  ['taxable', 'Taxable', 'Part of taxable salary'],
  ['prorated', 'Prorated', 'Reduced for days not paid'],
  ['onPayslip', 'On payslip', 'Shown on the payslip'],
  ['inCtc', 'In CTC', 'Part of the cost to company'],
];
const rupees = (v: string) => {
  const [i, f = '00'] = v.split('.');
  const neg = i.startsWith('-');
  const n = neg ? i.slice(1) : i;
  const head = n.slice(0, -3);
  return `${neg ? '−' : ''}₹${head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},` : ''}${n.slice(-3)}.${f.padEnd(2, '0')}`;
};
const blank = (): ComponentInput => ({
  code: '',
  name: '',
  kind: 'earning',
  taxable: true,
  pfWage: false,
  esiWage: false,
  ptWage: false,
  gratuityWage: false,
  bonusWage: false,
  codeWagePart: false,
  codeExclusion: false,
  prorated: true,
  onPayslip: true,
  inCtc: true,
  prorationText: null,
  rounding: 'rupee',
  ledger: null,
  status: 'active',
});

// ------------------------------------------------------------------------------------------ components (PAY-14)

export interface ComponentLibraryLiveProps {
  state: LoadState;
  onRetry?: () => void;
  rows: PayComponent[] | null;
  onSave: (id: string | null, c: ComponentInput) => Promise<unknown>;
  onInstallStarter: () => Promise<{ componentsAdded: number }>;
}

export function ComponentLibraryLiveScreen(p: ComponentLibraryLiveProps) {
  const { busy, error, run } = useRun();
  const [edit, setEdit] = useState<{
    id: string | null;
    statutory: string | null;
    c: ComponentInput;
  } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const kinds = Object.keys(KIND) as ComponentKind[];
  return (
    <LivePage
      title="Component library"
      description="Every earning, deduction and employer contribution. Wage flags, never names, decide what PF, ESI, PT, gratuity and bonus are worked out on. Statutory components take their amounts from the published rules."
      state={p.state}
      onRetry={p.onRetry}
      what="the component library"
      grantedBy="your payroll admin"
      actions={
        <div className="yx-tim-row">
          <Button loading={busy === 'starter'} onClick={() => void run('starter', async () => setDone(`${(await p.onInstallStarter()).componentsAdded} starter components added.`))}>
            Add the India starter set
          </Button>
          <Button variant="primary" onClick={() => setEdit({ id: null, statutory: null, c: blank() })}>
            Add component
          </Button>
        </div>
      }
    >
      {error && (
        <InlineAlert tone="danger" title="Not saved">
          {error}
        </InlineAlert>
      )}
      {done && <InlineAlert tone="success" title={done} />}
      {!p.rows?.length && <EmptyState compact title="No components yet" description="Start from the India starter set and edit it." />}
      {kinds.map((k) => {
        const rows = (p.rows ?? []).filter((r) => r.kind === k);
        if (!rows.length) return null;
        return (
          <Card className="yx-pay-card" key={k} title={KIND[k]}>
            <table className="yx-tim-table" aria-label={KIND[k]}>
              <thead>
                <tr>
                  <th scope="col">Component</th>
                  <th scope="col">Code</th>
                  <th scope="col">Flags set</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="yx-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">
                      {r.name} {r.statutory && <Badge>Statutory</Badge>}
                    </th>
                    <td className="yx-tim-note">{r.code}</td>
                    <td>
                      {FLAGS.filter(([f]) => r[f])
                        .map(([, l]) => l)
                        .join(' · ') || '—'}
                    </td>
                    <td>{r.status === 'active' ? 'Active' : 'Retired'}</td>
                    <td>
                      <Button
                        size="sm"
                        onClick={() =>
                          setEdit({
                            id: r.id,
                            statutory: r.statutory,
                            c: { ...r },
                          })
                        }
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })}
      <Drawer
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.id ? `Edit ${edit.c.name}` : 'Add component'}
        footer={
          <Button
            variant="primary"
            loading={busy === 'save'}
            disabled={!edit?.c.code || !edit?.c.name.trim()}
            onClick={() =>
              edit &&
              void run('save', async () => {
                await p.onSave(edit.id, edit.c);
                setDone(`${edit.c.name} saved.`);
                setEdit(null);
              })
            }
          >
            Save
          </Button>
        }
      >
        {edit && (
          <div className="yx-tim-stack">
            {edit.statutory && <InlineAlert tone="info" title="A statutory component: its amount comes from the published rules. Only its name and whether it shows on the payslip change here." />}
            <FormField id="pc-name" label="Name" required>
              <TextField value={edit.c.name} onChange={(v) => setEdit({ ...edit, c: { ...edit.c, name: v } })} />
            </FormField>
            <FormField id="pc-code" label="Code" helper="Lower-case letters, digits and _. Fixed once a payslip uses it.">
              <TextField
                value={edit.c.code}
                disabled={!!edit.statutory}
                onChange={(v) =>
                  setEdit({
                    ...edit,
                    c: { ...edit.c, code: v.trim().toLowerCase() },
                  })
                }
              />
            </FormField>
            {!edit.id && (
              <FormField id="pc-kind" label="Type">
                <Select
                  value={edit.c.kind}
                  onChange={(v) =>
                    v &&
                    setEdit({
                      ...edit,
                      c: { ...edit.c, kind: v as ComponentKind },
                    })
                  }
                  options={kinds.map((k) => ({ value: k, label: KIND[k] }))}
                />
              </FormField>
            )}
            {FLAGS.map(([f, label, help]) => (
              <Switch
                key={f}
                label={label}
                description={help}
                disabled={!!edit.statutory && f !== 'onPayslip'}
                checked={!!edit.c[f as keyof ComponentInput]}
                onChange={(c) => setEdit({ ...edit, c: { ...edit.c, [f]: c } })}
              />
            ))}
            <FormField id="pc-status" label="Status">
              <Segment
                label="Status"
                value={edit.c.status}
                onChange={(v) => setEdit({ ...edit, c: { ...edit.c, status: v } })}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'retired', label: 'Retired' },
                ]}
              />
            </FormField>
          </div>
        )}
      </Drawer>
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ templates (PAY-13)

export function BreakupTable({ b }: { b: Breakup }) {
  return (
    <div className="yx-tim-stack">
      {b.warnings?.map((w) => (
        <InlineAlert key={w} tone="warning" title={w} />
      ))}
      {b.codeWageAddBack !== '0.00' && <InlineAlert tone="info" title={`Allowances pass half of pay: ${rupees(b.codeWageAddBack)} a month is added back to the Code wage.`} />}
      {b.verify && <p className="yx-tim-note">Some figures use rules marked verify.</p>}
      <table className="yx-tim-table" aria-label="Salary breakup">
        <thead>
          <tr>
            <th scope="col">Line</th>
            <th scope="col">Monthly</th>
            <th scope="col">Yearly</th>
            <th scope="col">Rule</th>
          </tr>
        </thead>
        <tbody>
          {b.lines.map((l) => (
            <tr key={l.code}>
              <th scope="row">{l.name}</th>
              <td>{rupees(l.monthly)}</td>
              <td>{rupees(l.annual)}</td>
              <td className="yx-tim-note">{l.citation ? `${statuteText(l.citation.statute)} ${l.citation.version}${l.citation.verify ? ' (verify)' : ''}` : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Gross a month</th>
            <td>{rupees(b.monthlyGross)}</td>
            <td />
            <td />
          </tr>
          <tr>
            <th scope="row">Cost to company</th>
            <td>{rupees(b.monthlyCtc)}</td>
            <td>{rupees(b.annualCtc)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export interface TemplatesLiveProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  templates: SalaryTemplate[] | null;
  components: PayComponent[] | null;
  today: string;
  onCreate: (name: string, legalEntityId: string | null) => Promise<unknown>;
  onCheck: (text: string, codes: string[]) => Promise<FormulaCheck>;
  onValidate: (v: TemplateVersionInput) => Promise<{ sample: Breakup; codeWageFlag: boolean }>;
  onSaveVersion: (templateId: string, v: TemplateVersionInput) => Promise<unknown>;
}

export function TemplatesLiveScreen(p: TemplatesLiveProps) {
  const { busy, error, run } = useRun();
  const [name, setName] = useState('');
  const [entityId, setEntityId] = useState<string | null>(null);
  const [build, setBuild] = useState<{
    template: SalaryTemplate;
    v: TemplateVersionInput;
  } | null>(null);
  const [checks, setChecks] = useState<Record<number, FormulaCheck>>({});
  const [sample, setSample] = useState<Breakup | null>(null);
  const codes = (p.components ?? []).filter((c) => c.status === 'active');
  const start = (t: SalaryTemplate) => {
    setChecks({});
    setSample(null);
    setBuild({
      template: t,
      v: {
        validFrom: p.today,
        lines: [
          { code: 'basic', formula: 'round(monthly_ctc * 0.4)' },
          { code: 'special', formula: '0' },
        ],
        balancing: 'special',
        employerPfInCtc: true,
        employerEsiInCtc: true,
        gratuityInCtc: false,
        sample: { annualCtc: '600000', state: 'IN-KA', age: 30 },
      },
    });
  };
  const setLine = (i: number, patch: Partial<{ code: string; formula: string }>) =>
    build &&
    (setSample(null),
    setBuild({
      ...build,
      v: {
        ...build.v,
        lines: build.v.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)),
      },
    }));
  const lineCodes = build?.v.lines.map((l) => l.code) ?? [];
  return (
    <LivePage
      title="Salary templates"
      description="How a CTC is split into lines. Formulas are checked as you type; a version is saved only after a test run on a sample employee. Editing makes a new version; past payslips keep theirs."
      state={p.state}
      onRetry={p.onRetry}
      what="salary templates"
      grantedBy="your payroll admin"
    >
      {error && (
        <InlineAlert tone="danger" title="Not saved">
          {error}
        </InlineAlert>
      )}
      <Card className="yx-pay-card" title="New template">
        <div className="yx-tim-row">
          <FormField id="st-name" label="Name">
            <TextField value={name} onChange={setName} />
          </FormField>
          <FormField id="st-entity" label="Legal entity" helper="Leave empty for the whole company.">
            <Select value={entityId} onChange={setEntityId} clearable placeholder="Whole company" options={p.entities.map((e) => ({ value: e.id, label: e.name }))} />
          </FormField>
          <Button variant="primary" disabled={!name.trim()} loading={busy === 'create'} onClick={() => void run('create', async () => (await p.onCreate(name.trim(), entityId), setName('')))}>
            Create
          </Button>
        </div>
      </Card>
      {(p.templates ?? []).map((t) => (
        <Card className="yx-pay-card"
          key={t.id}
          title={t.name}
          actions={
            <Button size="sm" onClick={() => start(t)}>
              New version
            </Button>
          }
        >
          <p className="yx-tim-note">{t.legalEntityId ? p.entities.find((e) => e.id === t.legalEntityId)?.name : 'Whole company'}</p>
          {t.versions.length ? (
            <ul>
              {t.versions.map((v) => (
                <li key={v.id}>
                  Version {v.version} from {dateText(v.validFrom)} {v.codeWageFlag && <Badge tone="warning">Code wage add-back</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No versions yet" />
          )}
        </Card>
      ))}
      <Drawer
        open={!!build}
        onOpenChange={(o) => !o && setBuild(null)}
        title={build ? `${build.template.name}: new version` : ''}
        size="lg"
        footer={
          <div className="yx-tim-row">
            <Button loading={busy === 'test'} onClick={() => build && void run('test', async () => setSample((await p.onValidate(build.v)).sample))}>
              Test on the sample
            </Button>
            <Button
              variant="primary"
              disabled={!sample}
              title={!sample ? 'Test it on the sample first' : undefined}
              loading={busy === 'savev'}
              onClick={() =>
                build &&
                void run('savev', async () => {
                  await p.onSaveVersion(build.template.id, build.v);
                  setBuild(null);
                })
              }
            >
              Save version
            </Button>
          </div>
        }
      >
        {build && (
          <div className="yx-tim-stack">
            <FormField id="tv-from" label="From">
              <TextField type="date" value={build.v.validFrom} onChange={(v) => setBuild({ ...build, v: { ...build.v, validFrom: v } })} />
            </FormField>
            <Card className="yx-pay-card"
              title="Lines"
              actions={
                <Button
                  size="sm"
                  onClick={() =>
                    setBuild({
                      ...build,
                      v: {
                        ...build.v,
                        lines: [...build.v.lines, { code: '', formula: '' }],
                      },
                    })
                  }
                >
                  Add line
                </Button>
              }
            >
              {build.v.lines.map((l, i) => (
                <div key={i} className="yx-tim-row">
                  <FormField id={`tl-code-${i}`} label="Component">
                    <Select
                      value={l.code || null}
                      onChange={(v) => setLine(i, { code: v ?? '' })}
                      options={codes.map((c) => ({
                        value: c.code,
                        label: c.name,
                      }))}
                    />
                  </FormField>
                  <FormField
                    id={`tl-f-${i}`}
                    label="Formula"
                    error={checks[i] && !checks[i].ok ? checks[i].message : undefined}
                    helper={checks[i]?.ok ? `Uses: ${[...(checks[i].uses ?? []), ...(checks[i].statutory ?? []).map((s) => `${s}()`)].join(', ') || 'nothing else'}` : undefined}
                  >
                    <TextField
                      value={l.formula}
                      onChange={(v) => setLine(i, { formula: v })}
                      onBlur={() => l.formula && void p.onCheck(l.formula, lineCodes).then((r) => setChecks((c) => ({ ...c, [i]: r })))}
                    />
                  </FormField>
                  <Button
                    size="sm"
                    onClick={() =>
                      setBuild({
                        ...build,
                        v: {
                          ...build.v,
                          lines: build.v.lines.filter((_, j) => j !== i),
                        },
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </Card>
            <FormField id="tv-bal" label="Balancing line" helper="Takes what is left of the CTC.">
              <Select
                value={build.v.balancing}
                onChange={(v) => v && setBuild({ ...build, v: { ...build.v, balancing: v } })}
                options={build.v.lines
                  .filter((l) => l.code)
                  .map((l) => ({
                    value: l.code,
                    label: codes.find((c) => c.code === l.code)?.name ?? l.code,
                  }))}
              />
            </FormField>
            <Switch label="Employer PF inside the CTC" checked={build.v.employerPfInCtc} onChange={(c) => setBuild({ ...build, v: { ...build.v, employerPfInCtc: c } })} />
            <Switch label="Employer ESI inside the CTC" checked={build.v.employerEsiInCtc} onChange={(c) => setBuild({ ...build, v: { ...build.v, employerEsiInCtc: c } })} />
            <Switch label="Gratuity inside the CTC" checked={build.v.gratuityInCtc} onChange={(c) => setBuild({ ...build, v: { ...build.v, gratuityInCtc: c } })} />
            <Card className="yx-pay-card" title="Sample employee">
              <div className="yx-tim-row">
                <FormField id="tv-ctc" label="Annual CTC">
                  <TextField
                    prefix="₹"
                    value={build.v.sample.annualCtc}
                    onChange={(v) => (
                      setSample(null),
                      setBuild({
                        ...build,
                        v: {
                          ...build.v,
                          sample: {
                            ...build.v.sample,
                            annualCtc: v.replace(/[^\d.]/g, ''),
                          },
                        },
                      })
                    )}
                  />
                </FormField>
                <FormField id="tv-state" label="State">
                  <TextField
                    value={build.v.sample.state}
                    onChange={(v) =>
                      setBuild({
                        ...build,
                        v: {
                          ...build.v,
                          sample: {
                            ...build.v.sample,
                            state: v.trim().toUpperCase(),
                          },
                        },
                      })
                    }
                  />
                </FormField>
                <FormField id="tv-age" label="Age">
                  <TextField
                    type="number"
                    value={String(build.v.sample.age)}
                    onChange={(v) =>
                      setBuild({
                        ...build,
                        v: {
                          ...build.v,
                          sample: { ...build.v.sample, age: Number(v) },
                        },
                      })
                    }
                  />
                </FormField>
              </div>
            </Card>
            {sample && <BreakupTable b={sample} />}
          </div>
        )}
      </Drawer>
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ compensation (PAY-12)

export interface CompensationLiveProps {
  onSearch: (q: string) => Promise<EmployeeHit[]>;
  employee: EmployeeHit | null;
  onEmployee: (e: EmployeeHit | null) => void;
  state: LoadState;
  onRetry?: () => void;
  current: CompensationInForce | null;
  templates: SalaryTemplate[] | null;
  today: string;
  onPreview: (c: CompensationInput) => Promise<Breakup>;
  onSubmit: (c: CompensationInput & { reason: string }) => Promise<{ changeId: string; status: string }>;
  onLetter: (changeId: string, signatory: string) => Promise<{ referenceNo: string }>;
  profile: StatutoryProfile | null;
  onSaveProfile: (p: { validFrom: string; pf: 'yes' | 'no'; esi: 'yes' | 'no' | 'by_wage'; vpfPercent?: string; reason: string }) => Promise<unknown>;
}

export function CompensationLiveScreen(p: CompensationLiveProps) {
  const { busy, error, run } = useRun();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<EmployeeHit[]>([]);
  const [form, setForm] = useState<CompensationInput>({
    effectiveDate: p.today,
    templateVersionId: '',
    entryMode: 'ctc',
    annualCtc: '',
  });
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<Breakup | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [signatory, setSignatory] = useState('');
  const [prof, setProf] = useState<{
    validFrom: string;
    pf: 'yes' | 'no';
    esi: 'yes' | 'no' | 'by_wage';
    vpfPercent: string;
    reason: string;
  }>({
    validFrom: p.today,
    pf: 'yes',
    esi: 'by_wage',
    vpfPercent: '0',
    reason: '',
  });
  useEffect(() => (setPreview(null), setDone(null)), [p.employee]);
  const versions = (p.templates ?? []).flatMap((t) =>
    t.versions.map((v) => ({
      value: v.id,
      label: `${t.name} · version ${v.version} (from ${dateText(v.validFrom)})`,
    })),
  );
  const currentProfile = p.profile?.history.find((h) => !h.validTo) ?? null;
  return (
    <LivePage title="Compensation" description="A new or revised salary is a dated change that someone else approves. Its breakup is kept with it." state="ready" what="compensation">
      <Card className="yx-pay-card" title="Person">
        <div className="yx-tim-row">
          <FormField id="cp-q" label="Find a person">
            <TextField value={q} onChange={setQ} placeholder="Name" />
          </FormField>
          <Button loading={busy === 'search'} onClick={() => void run('search', async () => setHits(await p.onSearch(q)))}>
            Search
          </Button>
        </div>
        {hits.map((h) => (
          <Button key={h.id} size="sm" variant={p.employee?.id === h.id ? 'primary' : 'secondary'} onClick={() => p.onEmployee(h)}>
            {h.name}
            {h.employeeCode ? ` (${h.employeeCode})` : ''}
          </Button>
        ))}
      </Card>
      {error && (
        <InlineAlert tone="danger" title="That didn’t work">
          {error}
        </InlineAlert>
      )}
      {done && <InlineAlert tone="success" title={done} />}
      {p.employee && (
        <>
          {p.state === 'loading' && (
            <p className="yx-tim-note" aria-busy="true">
              Loading {p.employee.name}’s pay…
            </p>
          )}
          {p.state === 'error' && (
            <InlineAlert
              tone="danger"
              title="We couldn’t load this person’s pay."
              actions={
                p.onRetry && (
                  <Button size="sm" onClick={p.onRetry}>
                    Try again
                  </Button>
                )
              }
            />
          )}
          {p.state === 'no-access' && <InlineAlert tone="warning" title="You can’t see this person’s pay. Your payroll admin grants it." />}
          {p.state === 'ready' && (
            <>
              <Card className="yx-pay-card" title="Salary in force">
                {p.current ? (
                  <>
                    <p>
                      {rupees(p.current.annualCtc)} a year from {dateText(p.current.validFrom)}
                      {p.current.package ? '' : ' (no breakup: set before payroll)'}
                    </p>
                    {p.current.lines.length > 0 && (
                      <table className="yx-tim-table" aria-label="Lines in force">
                        <tbody>
                          {p.current.lines.map((l, i) => (
                            <tr key={`${l.code}-${i}`}>
                              <th scope="row">{l.name}</th>
                              <td>{rupees(l.monthly)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {p.current.package && !p.current.package.letterDocumentId && (
                      <div className="yx-tim-row">
                        <FormField id="cp-sign" label="Letter signed by">
                          <TextField value={signatory} onChange={setSignatory} />
                        </FormField>
                        <Button
                          disabled={signatory.trim().length < 2}
                          loading={busy === 'letter'}
                          onClick={() => void run('letter', async () => setDone(`Revision letter ${(await p.onLetter(p.current!.changeId, signatory.trim())).referenceNo} issued.`))}
                        >
                          Issue the revision letter
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState compact title="No salary yet" />
                )}
              </Card>
              <Card className="yx-pay-card" title="New or revised salary">
                <div className="yx-tim-row">
                  <FormField id="cp-date" label="From">
                    <TextField type="date" value={form.effectiveDate} onChange={(v) => (setPreview(null), setForm({ ...form, effectiveDate: v }))} />
                  </FormField>
                  <FormField id="cp-tpl" label="Template">
                    <Select value={form.templateVersionId || null} onChange={(v) => (setPreview(null), setForm({ ...form, templateVersionId: v ?? '' }))} options={versions} />
                  </FormField>
                  <FormField id="cp-mode" label="Enter">
                    <Segment
                      label="Entry"
                      value={form.entryMode}
                      onChange={(v) => (setPreview(null), setForm({ ...form, entryMode: v }))}
                      options={[
                        { value: 'ctc', label: 'Annual CTC' },
                        { value: 'fixed', label: 'Monthly amounts' },
                      ]}
                    />
                  </FormField>
                </div>
                {form.entryMode === 'ctc' ? (
                  <FormField id="cp-ctc" label="Annual CTC" className="yx-pay-narrow">
                    <TextField
                      prefix="₹"
                      value={form.annualCtc ?? ''}
                      onChange={(v) => (
                        setPreview(null),
                        setForm({
                          ...form,
                          annualCtc: v.replace(/[^\d.]/g, ''),
                        })
                      )}
                    />
                  </FormField>
                ) : (
                  <FormField id="cp-fixed" label="Monthly amounts" helper="One per line: code = amount, for example basic = 30000">
                    <TextArea
                      rows={4}
                      value={Object.entries(form.fixed ?? {})
                        .map(([k, v]) => `${k} = ${v}`)
                        .join('\n')}
                      onChange={(t) => (
                        setPreview(null),
                        setForm({
                          ...form,
                          fixed: Object.fromEntries(
                            t
                              .split('\n')
                              .map((l) => l.split('=').map((x) => x.trim()))
                              .filter(([k, v]) => k && v),
                          ),
                        })
                      )}
                    />
                  </FormField>
                )}
                <Button disabled={!form.templateVersionId} loading={busy === 'preview'} onClick={() => void run('preview', async () => setPreview(await p.onPreview(form)))}>
                  Work out the breakup
                </Button>
                {preview && (
                  <>
                    <BreakupTable b={preview} />
                    <FormField id="cp-reason" label="Reason" required>
                      <TextField value={reason} onChange={setReason} />
                    </FormField>
                    <Button
                      variant="primary"
                      disabled={reason.trim().length < 3}
                      loading={busy === 'submit'}
                      onClick={() =>
                        void run('submit', async () => {
                          await p.onSubmit({ ...form, reason: reason.trim() });
                          setDone('Sent for approval. It takes effect once someone else approves it.');
                          setPreview(null);
                          setReason('');
                        })
                      }
                    >
                      Send for approval
                    </Button>
                  </>
                )}
              </Card>
              {p.profile && (
                <Card className="yx-pay-card" title="Statutory profile">
                  <p className="yx-tim-note">
                    By law for this kind of employment: PF {p.profile.defaults['IN.PF']}, ESI {p.profile.defaults['IN.ESI'] === 'by_wage' ? 'by the wage limit' : p.profile.defaults['IN.ESI']}. Only
                    what the law leaves open can differ.
                  </p>
                  {currentProfile && (
                    <p>
                      Since {dateText(currentProfile.validFrom)}: PF {currentProfile.pf === 'yes' ? 'member' : 'not a member'}, voluntary PF {currentProfile.vpfPercent}%, ESI{' '}
                      {currentProfile.esi === 'by_wage' ? 'by the wage limit' : currentProfile.esi}.
                    </p>
                  )}
                  <div className="yx-tim-row">
                    <FormField id="sp-from" label="From">
                      <TextField type="date" value={prof.validFrom} onChange={(v) => setProf({ ...prof, validFrom: v })} />
                    </FormField>
                    <FormField id="sp-pf" label="PF member">
                      <Segment
                        label="PF member"
                        value={prof.pf}
                        onChange={(v) => setProf({ ...prof, pf: v })}
                        options={[
                          { value: 'yes', label: 'Yes' },
                          { value: 'no', label: 'No' },
                        ]}
                      />
                    </FormField>
                    <FormField id="sp-esi" label="ESI">
                      <Segment
                        label="ESI"
                        value={prof.esi}
                        onChange={(v) => setProf({ ...prof, esi: v })}
                        options={[
                          { value: 'by_wage', label: 'By wage limit' },
                          { value: 'yes', label: 'Yes' },
                          { value: 'no', label: 'No' },
                        ]}
                      />
                    </FormField>
                    <FormField id="sp-vpf" label="Voluntary PF %">
                      <TextField value={prof.vpfPercent} onChange={(v) => setProf({ ...prof, vpfPercent: v })} />
                    </FormField>
                  </div>
                  <FormField id="sp-reason" label="Reason" required>
                    <TextField value={prof.reason} onChange={(v) => setProf({ ...prof, reason: v })} />
                  </FormField>
                  <Button
                    variant="primary"
                    disabled={prof.reason.trim().length < 5}
                    loading={busy === 'profile'}
                    onClick={() =>
                      void run(
                        'profile',
                        async () => (
                          await p.onSaveProfile({
                            ...prof,
                            reason: prof.reason.trim(),
                          }),
                          setDone('Statutory profile saved.')
                        ),
                      )
                    }
                  >
                    Save statutory profile
                  </Button>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </LivePage>
  );
}
