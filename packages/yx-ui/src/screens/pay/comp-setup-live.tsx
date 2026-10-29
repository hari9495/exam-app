// PAY-12 (+ PAY-42), PAY-13, PAY-14 and PAY-15, live: the designed screens of comp-setup.tsx with the API's data.
// Same headers, panels, tables, drawers and dialogs as the design; no PayFrame (the app shell gives the menu).
// Presentational: the API checks every call (keys, entity scope, maker is not checker).
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Lock, Plus } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { ErrorSummary, FieldRow, FormField, FormSection, useTooEarly } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { ConfirmDialog } from '../../components/overlay';
import { Icon } from '../../components/foundations';
import { useToast } from '../../components/notify';
import { PayslipDocument, type PayslipData, type PayslipOptions } from '../../components/print';
import { ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { useNarrow } from '../../components/stepper';
import { DataTable, tableToCsv, type TableColumn } from '../../components/table';
import { formatDate } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { FactRow, SectionTitle } from './pay-kit';
import { EntityPicker, statuteText } from './live/setup';
import type { LoadState } from './live/types';
import type {
  Breakup,
  CompensationInForce,
  CompensationInput,
  ComponentInput,
  ComponentKind,
  EmployeeHit,
  FormulaCheck,
  LayoutBlock,
  PayComponent,
  PayslipLayouts,
  SalaryTemplate,
  SetupEntity,
  StatutoryProfile,
  TemplateVersionInput,
} from './live/types-5b';

/* ================================================================== shared */

/** Exact rupees from the API's decimal text: "₹7,26,000.00". */
export const rupees = (v: string) => {
  const [i, f = '00'] = v.split('.');
  const neg = i.startsWith('-');
  const n = neg ? i.slice(1) : i;
  const head = n.slice(0, -3);
  return `${neg ? '−' : ''}₹${head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},` : ''}${n.slice(-3)}.${f.padEnd(2, '0')}`;
};
const signedRupees = (n: number) => (n === 0 ? 'No change' : `${n > 0 ? '+' : '−'}${rupees(Math.abs(n).toFixed(2))}`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`);
const dateText = (s: string) => formatDate(day(s));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const GRANTED_BY = 'your payroll admin';

/** A live page's load states around a designed screen part: loading, error with retry, no access. */
function Gate({ state, onRetry, what, children }: { state: LoadState; onRetry?: () => void; what: string; children: ReactNode }) {
  if (state === 'loading')
    return (
      <div className="yx-pay-stack" role="status" aria-busy="true" aria-label={`Loading ${what}`}>
        <Skeleton height={96} />
        <Skeleton height={240} />
      </div>
    );
  if (state === 'error') return <ErrorState title={`We couldn't load ${what}.`} description="Nothing has changed. Try again in a moment." onRetry={onRetry} />;
  if (state === 'no-access') return <NoAccessState grantedBy={GRANTED_BY} what={what} />;
  return <>{children}</>;
}

/** A worked-out breakup (preview, sample run): the lines, the rule each statutory line cites, and its checks. */
export function BreakupTable({ b, caption = 'Salary breakup' }: { b: Breakup; caption?: string }) {
  return (
    <div className="yx-pay-stack">
      {b.warnings?.map((w) => <InlineAlert key={w} tone="warning" title={w} />)}
      {b.codeWageAddBack !== '0.00' ? (
        <InlineAlert tone="info" title="Code wage add-back">
          Allowances pass half of pay: {rupees(b.codeWageAddBack)} a month is added back to PF and ESI wage.
        </InlineAlert>
      ) : (
        !b.warnings?.length && <InlineAlert tone="success">Minimum wage and Code wage checks pass.</InlineAlert>
      )}
      {b.verify && <p className="yx-pay-note">Some figures use rules marked verify.</p>}
      <div className="yx-scroll-x" tabIndex={0} role="region" aria-label={`${caption}, scrolls sideways on small screens`}>
        <table className="yx-pay-table" aria-label={caption}>
          <thead>
            <tr>
              <th scope="col">Component</th>
              <th scope="col" data-num>Monthly</th>
              <th scope="col" data-num>Annual</th>
              <th scope="col">Rule</th>
            </tr>
          </thead>
          <tbody>
            {b.lines.map((l) => (
              <tr key={l.code}>
                <th scope="row">{l.name}</th>
                <td data-num>{rupees(l.monthly)}</td>
                <td data-num>{rupees(l.annual)}</td>
                <td className="yx-pay-note">{l.citation ? `${statuteText(l.citation.statute)} ${l.citation.version}${l.citation.verify ? ' (verify)' : ''}` : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Gross a month</th>
              <td data-num>{rupees(b.monthlyGross)}</td>
              <td />
              <td />
            </tr>
            <tr>
              <th scope="row">Cost to company</th>
              <td data-num>{rupees(b.monthlyCtc)}</td>
              <td data-num>{rupees(b.annualCtc)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ================================================================== PAY-12 Compensation + PAY-42 Suggest split */

export interface SplitSuggestion {
  templateVersionId: string;
  template: string;
  monthlyGross?: string;
  takeHomeBeforeTax?: string;
  codeWageAddBack?: string;
  belowMinimumWage?: boolean;
  problem?: string;
}

export interface LiveCompensation {
  onSearch: (q: string) => Promise<EmployeeHit[]>;
  employee: EmployeeHit | null;
  onEmployee: (e: EmployeeHit | null) => void;
  state: LoadState;
  onRetry?: () => void;
  current: CompensationInForce | null;
  templates: SalaryTemplate[] | null;
  today: string;
  onPreview: (c: CompensationInput) => Promise<Breakup>;
  /** Changing pay: HR with the salary grant and the job-change right (founder 21 Oct 2026). Without it, no new salary. */
  onSubmit?: (c: CompensationInput & { reason: string }) => Promise<{ changeId: string; status: string }>;
  onLetter: (changeId: string, signatory: string) => Promise<{ referenceNo: string }>;
  profile: StatutoryProfile | null;
  onSaveProfile: (p: { validFrom: string; pf: 'yes' | 'no'; esi: 'yes' | 'no' | 'by_wage'; vpfPercent?: string; reason: string }) => Promise<unknown>;
  /** PAY-42: the same CTC worked out with every template the person can use (nothing is kept). */
  onSuggest?: (annualCtc: string, effectiveDate: string) => Promise<SplitSuggestion[]>;
}

/** PAY-42 · Suggest split, live: each template the person can use, side by side; ones that fail a check are not offered. */
export function LiveSuggestSplitDrawer({ open, onOpenChange, suggestions, annualCtc, onUse }: { open: boolean; onOpenChange: (o: boolean) => void; suggestions: SplitSuggestion[]; annualCtc: string; onUse: (s: SplitSuggestion) => void }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const offered = suggestions.filter((s) => !s.problem && !s.belowMinimumWage);
  const hidden = suggestions.filter((s) => s.problem || s.belowMinimumWage);
  const pick = offered.find((s) => s.templateVersionId === chosen);
  const early = useTooEarly(!pick ? [{ fieldId: 'split-choice', message: 'Choose an option.' }] : []);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Suggest split"
      subtitle={`Annual CTC ${rupees(Number(annualCtc).toFixed(2))} · every template this person can use`}
      size="full"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (early.stop() || !pick) return;
              onUse(pick);
              onOpenChange(false);
            }}
          >
            Use {pick?.template ?? 'option'}
          </Button>
        </>
      }
    >
      <div className="yx-pay-stack">
        <p className="yx-pay-muted">
          Every option passes company CTC rules, the Code wage 50% rule, state minimum wage and PF / ESI limits. {plural(hidden.length, 'option')} failed a check and {hidden.length === 1 ? 'is' : 'are'} not offered. Nothing is saved until you send the revision.
        </p>
        {offered.length ? (
          <div className="yx-pay-scroll">
            <table className="yx-pay-table" aria-label="Splits suggested">
              <thead>
                <tr>
                  <th scope="col">Monthly</th>
                  {offered.map((o) => (
                    <th key={o.templateVersionId} scope="col" data-num>
                      {o.template}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Gross</th>
                  {offered.map((o) => <td key={o.templateVersionId} data-num>{o.monthlyGross ? rupees(o.monthlyGross) : '—'}</td>)}
                </tr>
                <tr>
                  <th scope="row">Take-home before tax</th>
                  {offered.map((o) => <td key={o.templateVersionId} data-num>{o.takeHomeBeforeTax ? rupees(o.takeHomeBeforeTax) : '—'}</td>)}
                </tr>
                <tr>
                  <th scope="row">Added back to Code wage</th>
                  {offered.map((o) => <td key={o.templateVersionId} data-num>{o.codeWageAddBack ? rupees(o.codeWageAddBack) : '—'}</td>)}
                </tr>
                <tr>
                  <th scope="row">Law checks</th>
                  {offered.map((o) => (
                    <td key={o.templateVersionId}>
                      <Badge tone="success">Passes all</Badge>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact title="No template passes the checks for this CTC" description="Change the CTC, or ask your payroll admin to add a template." />
        )}
        {offered.length > 0 && (
          <FormField id="split-choice" label="Choose an option" error={early.errorOf('split-choice')}>
            <RadioGroup orientation="horizontal" value={chosen ?? undefined} onChange={setChosen} options={offered.map((o) => ({ value: o.templateVersionId, label: o.template }))} />
          </FormField>
        )}
        {hidden.map((o) => (
          <p key={o.templateVersionId} className="yx-pay-note">
            Not offered: {o.template}. {o.problem ?? 'Below the minimum wage'}.
          </p>
        ))}
      </div>
    </Drawer>
  );
}

type ProfileForm = { validFrom: string; pf: 'yes' | 'no'; esi: 'yes' | 'no' | 'by_wage'; vpfPercent: string; reason: string };

export function LiveCompensationScreen({ live: p }: { live: LiveCompensation }) {
  const { toast } = useToast();
  const { busy, error, run, clearError } = useRun();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<EmployeeHit[] | null>(null);
  const [revise, setRevise] = useState(false);
  const [split, setSplit] = useState<SplitSuggestion[] | null>(null);
  const blankForm = (): CompensationInput => ({ effectiveDate: p.today, templateVersionId: '', entryMode: 'ctc', annualCtc: '' });
  const [form, setForm] = useState<CompensationInput>(blankForm);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<Breakup | null>(null);
  const [signatory, setSignatory] = useState('');
  const [prof, setProf] = useState<ProfileForm>({ validFrom: p.today, pf: 'yes', esi: 'by_wage', vpfPercent: '0', reason: '' });
  const ctcOk = form.entryMode === 'fixed' || /^\d{1,12}(\.\d{1,2})?$/.test(form.annualCtc ?? '');
  const searchEarly = useTooEarly(q.trim().length < 2 ? [{ fieldId: 'cp-q', message: 'Type at least 2 letters of the name.' }] : []);
  const letterEarly = useTooEarly(signatory.trim().length < 2 ? [{ fieldId: 'cp-sign', message: 'Give the name of the person who signs the letter.' }] : []);
  const formErrors = [
    ...(!form.effectiveDate ? [{ fieldId: 'cp-date', message: 'Choose the date it starts.' }] : []),
    ...(!form.templateVersionId ? [{ fieldId: 'cp-tpl', message: 'Choose the salary template.' }] : []),
    ...(!ctcOk ? [{ fieldId: 'cp-ctc', message: 'Give the annual CTC in rupees, for example 726000.' }] : []),
    ...(form.entryMode === 'fixed' && !Object.keys(form.fixed ?? {}).length ? [{ fieldId: 'cp-fixed', message: 'Give at least one amount, for example basic = 30000.' }] : []),
  ];
  const previewEarly = useTooEarly(formErrors);
  const suggestEarly = useTooEarly(form.entryMode === 'ctc' && !ctcOk ? [{ fieldId: 'cp-ctc', message: 'Give the annual CTC in rupees, for example 726000.' }] : []);
  const submitEarly = useTooEarly([...formErrors, ...(reason.trim().length < 3 ? [{ fieldId: 'cp-reason', message: 'Say why (at least 3 letters).' }] : [])]);
  const profileEarly = useTooEarly(prof.reason.trim().length < 5 ? [{ fieldId: 'sp-reason', message: 'Say why (at least 5 letters).' }] : []);
  // A new person: nothing worked out for the last one carries over.
  useEffect(() => {
    setPreview(null);
    setRevise(false);
    setForm(blankForm());
  }, [p.employee]); // eslint-disable-line react-hooks/exhaustive-deps
  const versions = (p.templates ?? []).flatMap((t) => t.versions.map((v) => ({ value: v.id, label: `${t.name} · version ${v.version} (from ${dateText(v.validFrom)})` })));
  const change = (patch: Partial<CompensationInput>) => {
    setPreview(null);
    setForm((f) => ({ ...f, ...patch }));
  };
  const cur = p.current;
  const backdated = !!form.effectiveDate && form.effectiveDate < p.today;
  const ctcDiff = cur && form.annualCtc ? Number(form.annualCtc) - Number(cur.annualCtc) : null;
  const pct = ctcDiff !== null && cur && Number(cur.annualCtc) ? Math.round((ctcDiff / Number(cur.annualCtc)) * 1000) / 10 : null;
  const grossDiff = preview && cur?.package ? Number(preview.monthlyGross) - Number(cur.package.monthlyGross) : null;
  const profileNow = p.profile?.history.find((h) => !h.validTo) ?? null;
  const workOut = () => run('preview', async () => setPreview(await p.onPreview(form)));
  return (
    <div className="yx-pay-stack">
      <PageHeader title="Compensation" description="A new or revised salary is a dated change that someone else approves. Its breakup is kept with it." />
      <section className="yx-pay-panel" aria-label="Find a person">
        <FieldRow>
          <FormField id="cp-q" label="Find a person" error={searchEarly.errorOf('cp-q')}>
            <TextField value={q} onChange={setQ} placeholder="Name or employee code" />
          </FormField>
          <div className="yx-pay-row" style={{ alignSelf: 'end' }}>
            <Button loading={busy === 'search'} onClick={() => !searchEarly.stop() && void run('search', async () => setHits(await p.onSearch(q.trim())))}>
              Search
            </Button>
          </div>
        </FieldRow>
        {hits && !hits.length && <p className="yx-pay-note">No one found with that name.</p>}
        {!!hits?.length && (
          <div className="yx-pay-row" role="group" aria-label="People found">
            {hits.map((h) => (
              <Button key={h.id} size="sm" variant={p.employee?.id === h.id ? 'primary' : 'secondary'} aria-pressed={p.employee?.id === h.id} onClick={() => p.onEmployee(h)}>
                {h.name}
                {h.employeeCode ? ` (${h.employeeCode})` : ''}
              </Button>
            ))}
          </div>
        )}
      </section>
      {error && !revise && (
        <InlineAlert tone="danger" title="That didn’t work">
          {error}
        </InlineAlert>
      )}
      {!p.employee ? (
        <EmptyState title="Find a person to see their pay" description="Search by name, then choose the person." />
      ) : (
        <Gate state={p.state} onRetry={p.onRetry} what={`${p.employee.name}’s pay`}>
          <ObjectHeader
            name={p.employee.name}
            person
            photoUrl={null}
            secondary={p.employee.employeeCode}
            facts={
              cur
                ? [
                    { label: 'Annual CTC', value: rupees(cur.annualCtc) },
                    { label: 'Pay basis', value: cur.package?.entryMode === 'fixed' ? 'Fixed amounts' : 'Annual CTC' },
                    { label: 'Effective', value: dateText(cur.validFrom) },
                    ...(cur.package ? [{ label: 'Monthly gross', value: rupees(cur.package.monthlyGross) }] : []),
                  ]
                : []
            }
            actions={
              p.onSubmit && (
                <Button
                  variant="primary"
                  onClick={() => {
                    clearError();
                    setRevise(true);
                  }}
                >
                  {cur ? 'Revise compensation' : 'Set salary'}
                </Button>
              )
            }
          />
          <Tabs defaultValue="comp">
            <TabsList aria-label="Pay">
              <TabsTrigger value="comp">Compensation</TabsTrigger>
              {p.profile && <TabsTrigger value="statutory">Statutory profile</TabsTrigger>}
            </TabsList>
            <TabsContent value="comp">
              {!cur ? (
                <EmptyState title="No salary yet" description={p.onSubmit ? 'Press Set salary to give this person a salary. Someone else approves it.' : 'HR sets the salary; it shows here once approved.'} />
              ) : (
                <div className="yx-pay-split">
                  <div className="yx-pay-stack">
                    {cur.lines.length ? (
                      <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Current breakup, scrolls sideways on small screens">
                        <table className="yx-pay-table" aria-label="Lines in force">
                          <caption>Current breakup</caption>
                          <thead>
                            <tr>
                              <th scope="col">Component</th>
                              <th scope="col" data-num>Annual</th>
                              <th scope="col" data-num>Monthly</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cur.lines.map((l, i) => (
                              <tr key={`${l.code}-${i}`}>
                                <th scope="row">{l.name ?? l.code}</th>
                                <td data-num>{rupees(l.annual)}</td>
                                <td data-num>{rupees(l.monthly)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <th scope="row">Cost to company</th>
                              <td data-num>{rupees(cur.annualCtc)}</td>
                              <td data-num>{rupees((Number(cur.annualCtc) / 12).toFixed(2))}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <InlineAlert tone="warning" title="No breakup yet">
                        {rupees(cur.annualCtc)} a year from {dateText(cur.validFrom)}. Set a breakup before payroll runs.
                      </InlineAlert>
                    )}
                  </div>
                  <section className="yx-pay-panel" aria-label="Revision letter">
                    <SectionTitle>Revision letter</SectionTitle>
                    {cur.package?.letterDocumentId ? (
                      <p className="yx-pay-muted">The revision letter for this salary is issued. It is in the person’s documents.</p>
                    ) : cur.package ? (
                      <>
                        <FormField id="cp-sign" label="Letter signed by" required error={letterEarly.errorOf('cp-sign')}>
                          <TextField value={signatory} onChange={setSignatory} />
                        </FormField>
                        <div>
                          <Button
                            loading={busy === 'letter'}
                            onClick={() =>
                              !letterEarly.stop() &&
                              void run('letter', async () => {
                                const r = await p.onLetter(cur.changeId, signatory.trim());
                                toast({ tone: 'success', title: `Revision letter ${r.referenceNo} issued.` });
                              })
                            }
                          >
                            Issue the revision letter
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="yx-pay-muted">A letter is issued once the salary has a breakup.</p>
                    )}
                  </section>
                </div>
              )}
            </TabsContent>
            {p.profile && (
              <TabsContent value="statutory">
                <section className="yx-pay-panel" aria-label="Statutory profile">
                  <SectionTitle>Statutory profile</SectionTitle>
                  <p className="yx-pay-muted">
                    By law for this kind of employment: PF {p.profile.defaults['IN.PF']}, ESI {p.profile.defaults['IN.ESI'] === 'by_wage' ? 'by the wage limit' : p.profile.defaults['IN.ESI']}. Only what the law leaves open can differ.
                  </p>
                  {profileNow && (
                    <FactRow
                      items={[
                        { label: 'Since', value: dateText(profileNow.validFrom) },
                        { label: 'PF', value: profileNow.pf === 'yes' ? 'Member' : 'Not a member' },
                        { label: 'Voluntary PF', value: `${profileNow.vpfPercent}%` },
                        { label: 'ESI', value: profileNow.esi === 'by_wage' ? 'By the wage limit' : profileNow.esi === 'yes' ? 'Yes' : 'No' },
                      ]}
                    />
                  )}
                  <FieldRow>
                    <FormField id="sp-from" label="From" required>
                      <DatePicker value={day(prof.validFrom)} onChange={(v) => v && setProf({ ...prof, validFrom: iso(v) })} />
                    </FormField>
                    <FormField id="sp-vpf" label="Voluntary PF %">
                      <TextField value={prof.vpfPercent} onChange={(v) => setProf({ ...prof, vpfPercent: v })} />
                    </FormField>
                  </FieldRow>
                  <FormField id="sp-pf" label="PF member">
                    <Segment label="PF member" value={prof.pf} onChange={(v) => setProf({ ...prof, pf: v })} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
                  </FormField>
                  <FormField id="sp-esi" label="ESI">
                    <Segment label="ESI" value={prof.esi} onChange={(v) => setProf({ ...prof, esi: v })} options={[{ value: 'by_wage', label: 'By wage limit' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
                  </FormField>
                  <FormField id="sp-reason" label="Reason" required error={profileEarly.errorOf('sp-reason')}>
                    <TextField value={prof.reason} onChange={(v) => setProf({ ...prof, reason: v })} />
                  </FormField>
                  <div>
                    <Button
                      variant="primary"
                      loading={busy === 'profile'}
                      onClick={() =>
                        !profileEarly.stop() &&
                        void run('profile', async () => {
                          await p.onSaveProfile({ ...prof, reason: prof.reason.trim() });
                          toast({ tone: 'success', title: 'Statutory profile saved.' });
                          setProf((x) => ({ ...x, reason: '' }));
                        })
                      }
                    >
                      Save statutory profile
                    </Button>
                  </div>
                </section>
              </TabsContent>
            )}
          </Tabs>
        </Gate>
      )}
      {p.onSubmit && p.employee && (
        <Drawer
          open={revise}
          onOpenChange={setRevise}
          title={cur ? 'Revise compensation' : 'Set salary'}
          subtitle="Goes through approval. Someone else approves it; the current salary stays until then."
          size="lg"
          footer={
            <>
              <Button onClick={() => setRevise(false)}>Cancel</Button>
              {p.onSuggest && form.entryMode === 'ctc' && (
                <Button loading={busy === 'suggest'} onClick={() => !suggestEarly.stop() && void run('suggest', async () => setSplit(await p.onSuggest!(form.annualCtc!, form.effectiveDate)))}>
                  Suggest split
                </Button>
              )}
              <Button loading={busy === 'preview'} onClick={() => !previewEarly.stop() && void workOut()}>
                Work out the breakup
              </Button>
              <Button
                variant="primary"
                loading={busy === 'submit'}
                onClick={() => {
                  if (previewEarly.stop()) return;
                  // The breakup is seen before it is sent: the first press works it out.
                  if (!preview) return void workOut();
                  if (submitEarly.stop()) return;
                  void run('submit', async () => {
                    await p.onSubmit!({ ...form, reason: reason.trim() });
                    toast({ tone: 'success', title: 'Sent for approval. It takes effect once someone else approves it.' });
                    setRevise(false);
                    setPreview(null);
                    setReason('');
                    submitEarly.reset();
                  });
                }}
              >
                Send for approval
              </Button>
            </>
          }
        >
          <div className="yx-pay-split">
            <div className="yx-pay-stack">
              {error && (
                <InlineAlert tone="danger" title="That didn’t work">
                  {error}
                </InlineAlert>
              )}
              <FieldRow>
                <FormField id="cp-date" label="Effective from" required error={submitEarly.errorOf('cp-date') ?? previewEarly.errorOf('cp-date')} helper={backdated ? 'Back-dated: arrears are paid in the next run; past payslips are never changed.' : undefined}>
                  <DatePicker value={form.effectiveDate ? day(form.effectiveDate) : null} onChange={(v) => change({ effectiveDate: v ? iso(v) : '' })} min={cur ? day(cur.validFrom) : undefined} required />
                </FormField>
                <FormField id="cp-reason" label="Reason" required error={submitEarly.errorOf('cp-reason')}>
                  <TextField value={reason} onChange={setReason} placeholder="Promotion, annual review" />
                </FormField>
              </FieldRow>
              <FormField id="cp-mode" label="Pay basis" required>
                <Segment label="Pay basis" value={form.entryMode} onChange={(v) => change({ entryMode: v })} options={[{ value: 'ctc', label: 'Annual CTC' }, { value: 'fixed', label: 'Fixed amounts' }]} />
              </FormField>
              {form.entryMode === 'ctc' ? (
                <FormField id="cp-ctc" label="New annual CTC" required helper={cur ? `Current ${rupees(cur.annualCtc)}` : undefined} error={submitEarly.errorOf('cp-ctc') ?? previewEarly.errorOf('cp-ctc') ?? suggestEarly.errorOf('cp-ctc')}>
                  <CurrencyField value={form.annualCtc ? Number(form.annualCtc) : null} onChange={(v) => change({ annualCtc: v === null ? '' : String(v) })} />
                </FormField>
              ) : (
                <FormField id="cp-fixed" label="Monthly amounts" required helper="One per line: code = amount, for example basic = 30000" error={submitEarly.errorOf('cp-fixed') ?? previewEarly.errorOf('cp-fixed')}>
                  <TextArea
                    rows={4}
                    value={Object.entries(form.fixed ?? {}).map(([k, v]) => `${k} = ${v}`).join('\n')}
                    onChange={(t) => change({ fixed: Object.fromEntries(t.split('\n').map((l) => l.split('=').map((x) => x.trim())).filter(([k, v]) => k && v)) })}
                  />
                </FormField>
              )}
              <FormField id="cp-tpl" label="Salary template" required error={submitEarly.errorOf('cp-tpl') ?? previewEarly.errorOf('cp-tpl')}>
                <Select value={form.templateVersionId || null} onChange={(v) => change({ templateVersionId: v ?? '' })} options={versions} placeholder="Choose a template" />
              </FormField>
            </div>
            <aside className="yx-pay-panel" aria-label="Effect">
              <SectionTitle>Effect</SectionTitle>
              <FactRow
                items={[
                  { label: 'Change', value: ctcDiff !== null ? `${signedRupees(ctcDiff)} a year${ctcDiff && pct !== null ? ` (${pct > 0 ? '+' : '−'}${Math.abs(pct)}%)` : ''}` : '—' },
                  { label: 'Monthly gross change', value: grossDiff !== null ? signedRupees(grossDiff) : '—' },
                ]}
              />
              {preview ? <BreakupTable b={preview} /> : <p className="yx-pay-note">Press Work out the breakup to see the lines and the minimum wage and Code wage checks.</p>}
              {backdated && <p className="yx-pay-note">PF on arrears is attributed to the months they relate to; supplementary ECRs are raised for months already filed.</p>}
            </aside>
          </div>
        </Drawer>
      )}
      {split && (
        <LiveSuggestSplitDrawer
          open={!!split}
          onOpenChange={(o) => !o && setSplit(null)}
          suggestions={split}
          annualCtc={form.annualCtc ?? '0'}
          onUse={(s) => change({ templateVersionId: s.templateVersionId })}
        />
      )}
    </div>
  );
}

/* ================================================================== PAY-13 Template builder */

export interface LiveTemplates {
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

const FUNCTIONS = ['monthly_ctc', 'ctc', 'payable_days', 'period_days', 'pf_wage', 'pf_employer(', 'pf_employee(', 'esi_employee(', 'metro', 'if(', 'min(', 'max(', 'round('];
const firstVersion = (today: string): TemplateVersionInput => ({
  validFrom: today,
  lines: [
    { code: 'basic', formula: 'round(monthly_ctc * 0.4)' },
    { code: 'special', formula: '0' },
  ],
  balancing: 'special',
  employerPfInCtc: true,
  employerEsiInCtc: true,
  gratuityInCtc: false,
  sample: { annualCtc: '600000', state: 'IN-KA', age: 30 },
});

export function LiveTemplateBuilderScreen({ live: p }: { live: LiveTemplates }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [v, setV] = useState<TemplateVersionInput>(() => firstVersion(p.today));
  const [sel, setSel] = useState(0);
  const [checks, setChecks] = useState<Record<number, FormulaCheck>>({});
  const [sample, setSample] = useState<{ sample: Breakup; codeWageFlag: boolean } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [entityId, setEntityId] = useState<string | null>(null);
  const templates = p.templates ?? [];
  useEffect(() => {
    if (!templateId && templates.length) setTemplateId(templates[0].id);
  }, [templates, templateId]);
  const t = templates.find((x) => x.id === templateId) ?? null;
  const last = t?.versions.length ? Math.max(...t.versions.map((x) => x.version)) : 0;
  const codes = (p.components ?? []).filter((c) => c.status === 'active');
  const nameOf = (code: string) => codes.find((c) => c.code === code)?.name ?? (code || 'New line');
  const line = v.lines[sel] ?? v.lines[0];
  const edit = (next: TemplateVersionInput) => {
    setSample(null);
    setV(next);
  };
  const setLine = (i: number, patch: Partial<{ code: string; formula: string }>) => edit({ ...v, lines: v.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= v.lines.length) return;
    const lines = [...v.lines];
    [lines[i], lines[j]] = [lines[j], lines[i]];
    setChecks({});
    edit({ ...v, lines });
    setSel(j);
  };
  const formulaErrors = v.lines.flatMap((l, i) => [
    ...(!l.code ? [{ fieldId: `tl-code-${i}`, message: `Line ${i + 1}: choose its component.` }] : []),
    ...(!l.formula.trim() ? [{ fieldId: `tl-f-${i}`, message: `${nameOf(l.code)}: give a formula.` }] : []),
    ...(checks[i] && !checks[i].ok ? [{ fieldId: `tl-f-${i}`, message: `${nameOf(l.code)}: ${checks[i].message}` }] : []),
  ]);
  const publishEarly = useTooEarly([...formulaErrors, ...(!v.validFrom ? [{ fieldId: 'tv-from', message: 'Choose the date it starts.' }] : []), ...(!v.lines.some((l) => l.code === v.balancing) ? [{ fieldId: 'tv-bal', message: 'Choose the line that takes what is left of the CTC.' }] : [])]);
  const createEarly = useTooEarly(!name.trim() ? [{ fieldId: 'st-name', message: 'Name the template.' }] : []);
  const lineCodes = v.lines.map((l) => l.code);
  const token = /[a-z_]+$/i.exec(line?.formula ?? '')?.[0] ?? '';
  const words = [...new Set([...lineCodes.filter(Boolean), ...FUNCTIONS])];
  const matches = token ? words.filter((s) => s.startsWith(token) && s !== token) : [];
  const insert = (s: string) => setLine(sel, { formula: line.formula.slice(0, line.formula.length - token.length) + s });
  const check = (i: number) => {
    const l = v.lines[i];
    if (l?.formula) void p.onCheck(l.formula, lineCodes).then((r) => setChecks((c) => ({ ...c, [i]: r })));
  };
  const test = () => run('test', async () => setSample(await p.onValidate(v)));
  return (
    <div className="yx-pay-stack">
      <PageHeader
        title={t?.name ?? 'Salary templates'}
        description={t ? `${t.legalEntityId ? (p.entities.find((e) => e.id === t.legalEntityId)?.name ?? '') : 'Whole company'} · editing makes version ${last + 1}; payslips already made keep ${last ? `version ${last}` : 'their version'}.` : 'How a CTC is split into lines. A version is saved only after a test run on a sample employee.'}
        status={t ? <Badge tone="warning">{`Draft of version ${last + 1}`}</Badge> : undefined}
        actions={
          p.state === 'ready' && (
            <>
              {templates.length > 0 && (
                <Select size="sm" aria-label="Template" value={templateId} onChange={(id) => (setTemplateId(id), setChecks({}), setSel(0), edit(firstVersion(p.today)))} options={templates.map((x) => ({ value: x.id, label: x.name }))} />
              )}
              <Button icon={Plus} onClick={() => setCreating(true)}>
                New template
              </Button>
              {t && (
                <Button
                  variant="primary"
                  loading={busy === 'test' || busy === 'save'}
                  onClick={() => {
                    if (publishEarly.stop()) return;
                    // "Validate": a version is published only after its formulas have worked out a real breakup.
                    if (sample) return setConfirm(true);
                    void test().then((ok) => ok && setConfirm(true));
                  }}
                >
                  Validate and publish
                </Button>
              )}
            </>
          )
        }
      />
      <Gate state={p.state} onRetry={p.onRetry} what="salary templates">
        {error && (
          <InlineAlert tone="danger" title="That didn’t work">
            {error}
          </InlineAlert>
        )}
        {!t ? (
          <EmptyState title="No salary templates yet" description="Create a template, then add its lines and test it on a sample employee." action={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New template</Button>} />
        ) : (
          <>
            {formulaErrors.some((e) => publishEarly.errorOf(e.fieldId)) && <ErrorSummary title="Fix these before publishing" errors={formulaErrors} />}
            {t.versions.length > 0 && (
              <p className="yx-pay-note">
                Versions: {t.versions.map((x) => `${x.version} from ${dateText(x.validFrom)}${x.codeWageFlag ? ' (Code wage add-back)' : ''}`).join(' · ')}
              </p>
            )}
            <div className="yx-pay-grid">
              <section data-span="4" className="yx-pay-panel" aria-label="Components in order">
                <SectionTitle actions={<Button size="sm" icon={Plus} onClick={() => (edit({ ...v, lines: [...v.lines, { code: '', formula: '' }] }), setSel(v.lines.length))}>Add component</Button>}>Components, in calculation order</SectionTitle>
                <ol className="yx-pay-cards">
                  {v.lines.map((l, i) => (
                    <li key={i} data-selected={i === sel || undefined}>
                      <div className="yx-pay-cards__row">
                        <button type="button" className="yx-pay-why__row" onClick={() => setSel(i)} aria-pressed={i === sel}>
                          <span>
                            {nameOf(l.code)} <span className="yx-pay-mono">{l.code}</span> {checks[i] && !checks[i].ok ? <Badge tone="danger">Error</Badge> : l.code === v.balancing ? <Badge>Balancing</Badge> : null}
                          </span>
                        </button>
                        <IconButton icon={ArrowUp} label={`Move ${nameOf(l.code)} up`} size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
                        <IconButton icon={ArrowDown} label={`Move ${nameOf(l.code)} down`} size="sm" disabled={i === v.lines.length - 1} onClick={() => move(i, 1)} />
                      </div>
                    </li>
                  ))}
                </ol>
                <FormSection title="This version">
                  <FormField id="tv-from" label="From" required error={publishEarly.errorOf('tv-from')}>
                    <DatePicker value={v.validFrom ? day(v.validFrom) : null} onChange={(d) => edit({ ...v, validFrom: d ? iso(d) : '' })} />
                  </FormField>
                  <FormField id="tv-bal" label="Balancing line" helper="Takes what is left of the CTC." error={publishEarly.errorOf('tv-bal')}>
                    <Select value={v.balancing || null} onChange={(b) => edit({ ...v, balancing: b ?? '' })} options={v.lines.filter((l) => l.code).map((l) => ({ value: l.code, label: nameOf(l.code) }))} />
                  </FormField>
                  <Switch label="Employer PF inside the CTC" checked={v.employerPfInCtc} onChange={(c) => edit({ ...v, employerPfInCtc: c })} />
                  <Switch label="Employer ESI inside the CTC" checked={v.employerEsiInCtc} onChange={(c) => edit({ ...v, employerEsiInCtc: c })} />
                  <Switch label="Gratuity inside the CTC" checked={v.gratuityInCtc} onChange={(c) => edit({ ...v, gratuityInCtc: c })} />
                </FormSection>
              </section>
              <section data-span="4" className="yx-pay-panel" aria-label="Formula">
                <SectionTitle>{nameOf(line?.code ?? '')}</SectionTitle>
                {line && (
                  <>
                    <FormField id={`tl-code-${sel}`} label="Component" required error={publishEarly.errorOf(`tl-code-${sel}`)}>
                      <Select value={line.code || null} onChange={(c) => setLine(sel, { code: c ?? '' })} options={codes.map((c) => ({ value: c.code, label: c.name }))} />
                    </FormField>
                    <FormField
                      id={`tl-f-${sel}`}
                      label="Formula"
                      error={checks[sel] && !checks[sel].ok ? checks[sel].message : publishEarly.errorOf(`tl-f-${sel}`)}
                      helper={checks[sel]?.ok ? `Uses: ${[...(checks[sel].uses ?? []), ...(checks[sel].statutory ?? []).map((s) => `${s}()`)].join(', ') || 'nothing else'}` : 'Safe expression language: monthly_ctc, the line codes above, if(), min(), max(), round() and statutory functions. No code runs.'}
                    >
                      <TextArea
                        className="yx-pay-formula"
                        rows={3}
                        value={line.formula}
                        onChange={(f) => {
                          setChecks((c) => ({ ...c, [sel]: undefined as unknown as FormulaCheck }));
                          setLine(sel, { formula: f });
                          setActive(0);
                        }}
                        onBlur={() => check(sel)}
                        aria-autocomplete="list"
                        aria-controls={matches.length ? 'formula-suggestions' : undefined}
                        onKeyDown={(e) => {
                          if (!matches.length) return;
                          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                            e.preventDefault();
                            setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
                          } else if (e.key === 'Enter' || e.key === 'Tab') {
                            e.preventDefault();
                            insert(matches[active] ?? matches[0]);
                          }
                        }}
                      />
                    </FormField>
                    {matches.length > 0 && (
                      <ul id="formula-suggestions" className="yx-pay-suggest" role="listbox" aria-label="Suggestions">
                        {matches.map((s, i) => (
                          <li key={s} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(s)}>
                            {s}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div>
                      <Button size="sm" onClick={() => (setChecks({}), edit({ ...v, lines: v.lines.filter((_, j) => j !== sel) }), setSel(Math.max(0, sel - 1)))}>
                        Remove line
                      </Button>
                    </div>
                  </>
                )}
                <FormSection title="Flags come from the component">
                  <p className="yx-pay-muted">Taxable, PF wage, ESI wage, PT wage, gratuity wage, bonus wage and Code wage flags are set in the component library.</p>
                  <div>
                    <Button size="sm" asChild>
                      <a href="/yx/payroll/components">
                        <span className="yx-button__label">Open component library</span>
                      </a>
                    </Button>
                  </div>
                </FormSection>
              </section>
              <section data-span="4" className="yx-pay-panel" aria-label="Live test employee">
                <SectionTitle actions={<Button size="sm" loading={busy === 'test'} onClick={() => void test()}>Test on the sample</Button>}>Live test</SectionTitle>
                <FieldRow>
                  <FormField id="tv-ctc" label="Annual CTC">
                    <CurrencyField value={v.sample.annualCtc ? Number(v.sample.annualCtc) : null} onChange={(n) => edit({ ...v, sample: { ...v.sample, annualCtc: n === null ? '' : String(n) } })} />
                  </FormField>
                  <FormField id="tv-state" label="State">
                    <TextField value={v.sample.state} onChange={(s) => edit({ ...v, sample: { ...v.sample, state: s.trim().toUpperCase() } })} />
                  </FormField>
                  <FormField id="tv-age" label="Age">
                    <NumberField value={v.sample.age} onChange={(n) => edit({ ...v, sample: { ...v.sample, age: n ?? 0 } })} />
                  </FormField>
                </FieldRow>
                {sample ? (
                  <>
                    <BreakupTable b={sample.sample} />
                    {sample.codeWageFlag ? <Badge tone="warning">Code wage add-back</Badge> : <Badge tone="success">No Code wage add-back</Badge>}
                  </>
                ) : (
                  <p className="yx-pay-note">Press Test on the sample: a version is published only after its formulas have worked out a real breakup.</p>
                )}
              </section>
            </div>
          </>
        )}
      </Gate>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Publish version ${last + 1}?`}
        consequence={`Used for pay from ${v.validFrom ? dateText(v.validFrom) : 'its start date'}; payslips already made keep their version.`}
        confirmLabel="Publish version"
        onConfirm={() =>
          void (t &&
          run('save', async () => {
            await p.onSaveVersion(t.id, v);
            toast({ tone: 'success', title: `${t.name}: version ${last + 1} published.` });
            setSample(null);
          }))
        }
      />
      <Drawer
        open={creating}
        onOpenChange={setCreating}
        title="New template"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy === 'create'}
              onClick={() =>
                !createEarly.stop() &&
                void run('create', async () => {
                  await p.onCreate(name.trim(), entityId);
                  toast({ tone: 'success', title: `${name.trim()} created. Add its lines and publish the first version.` });
                  setName('');
                  setCreating(false);
                })
              }
            >
              Create
            </Button>
          </>
        }
      >
        <div className="yx-pay-stack">
          {error && <InlineAlert tone="danger" title="That didn’t work">{error}</InlineAlert>}
          <FormField id="st-name" label="Name" required error={createEarly.errorOf('st-name')}>
            <TextField value={name} onChange={setName} />
          </FormField>
          <FormField id="st-entity" label="Legal entity" helper="Leave empty for the whole company.">
            <Select value={entityId} onChange={setEntityId} clearable placeholder="Whole company" options={p.entities.map((e) => ({ value: e.id, label: e.name }))} />
          </FormField>
        </div>
      </Drawer>
    </div>
  );
}

/* ================================================================== PAY-14 Component library */

export interface LiveComponentLibrary {
  state: LoadState;
  onRetry?: () => void;
  rows: PayComponent[] | null;
  onSave: (id: string | null, c: ComponentInput) => Promise<unknown>;
  onInstallStarter: () => Promise<{ componentsAdded: number }>;
}

const KIND: Record<ComponentKind, string> = { earning: 'Earnings', deduction: 'Deductions', employer: 'Employer contributions', reimbursement: 'Reimbursements', info: 'Information only' };
type FlagKey = 'taxable' | 'pfWage' | 'esiWage' | 'ptWage' | 'gratuityWage' | 'bonusWage' | 'codeWagePart' | 'codeExclusion' | 'prorated' | 'onPayslip' | 'inCtc';
/** Key, drawer label, drawer description, short table header, column width. */
const FLAGS: [FlagKey, string, string, string, number][] = [
  ['taxable', 'Taxable', 'Part of taxable salary', 'Taxable', 84],
  ['pfWage', 'Part of PF wage', 'Decides PF by flag, never by name', 'PF', 56],
  ['esiWage', 'Part of ESI wage', '', 'ESI', 66],
  ['ptWage', 'Part of PT wage', '', 'PT', 56],
  ['gratuityWage', 'Part of gratuity wage', '', 'Gratuity', 96],
  ['bonusWage', 'Part of bonus wage', '', 'Bonus', 76],
  ['codeWagePart', 'Part of Code wage definition', 'Basic, DA, retaining allowance. Other pay counts towards the 50% add-back.', 'Code wage', 80],
  ['codeExclusion', 'Excluded from the Code wage', 'Added back when allowances pass half of pay', 'Code excl.', 90],
  ['prorated', 'Prorated by payable days', '', 'Prorated', 90],
  ['onPayslip', 'Shown on payslip', '', 'Payslip', 84],
  ['inCtc', 'Part of the CTC', '', 'In CTC', 76],
];
const blankComponent = (): ComponentInput => ({
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

export function LiveComponentLibraryScreen({ live: p }: { live: LiveComponentLibrary }) {
  const { toast } = useToast();
  const compact = useNarrow(1399);
  const { busy, error, run, clearError } = useRun();
  const [edit, setEdit] = useState<PayComponent | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<ComponentInput | null>(null);
  const [confirm, setConfirm] = useState(false);
  const rows = p.rows ?? [];
  const open = (r: PayComponent | null, fresh = false) => {
    clearError();
    setIsNew(fresh);
    setEdit(r);
    setDraft(fresh ? blankComponent() : r ? { ...r } : null);
  };
  const close = () => {
    setEdit(null);
    setIsNew(false);
    setDraft(null);
  };
  const code = draft?.code.trim().toLowerCase() ?? '';
  const early = useTooEarly(
    draft
      ? [
          ...(!draft.name.trim() ? [{ fieldId: 'pc-name', message: 'Name the component.' }] : []),
          ...(!code ? [{ fieldId: 'pc-code', message: 'Give the component a code.' }] : !/^[a-z][a-z0-9_]*$/.test(code) ? [{ fieldId: 'pc-code', message: 'Use lower-case letters, digits and _, starting with a letter.' }] : []),
          ...(isNew && rows.some((r) => r.code === code) ? [{ fieldId: 'pc-code', message: `Code ${code} is already used.` }] : []),
        ]
      : [],
  );
  const flagsChanged = !!edit && !!draft && FLAGS.some(([k]) => edit[k] !== draft[k]);
  const save = () =>
    draft &&
    void run('save', async () => {
      await p.onSave(isNew ? null : edit!.id, { ...draft, name: draft.name.trim(), code });
      toast({ tone: 'success', title: isNew ? `${draft.name.trim()} created. Add it to a template to use it.` : `${draft.name.trim()} saved.` });
      close();
      early.reset();
    });
  const flagsOf = (r: PayComponent) => FLAGS.filter(([k]) => r[k]).map(([, , , short]) => short).join(' · ') || 'No flags';
  const nameCol: TableColumn<PayComponent> = { key: 'name', header: 'Component', value: (r) => r.name, render: (r) => <span>{r.name} {r.statutory && <Badge>Statutory</Badge>}</span>, width: 180 };
  const typeCol: TableColumn<PayComponent> = { key: 'type', header: 'Type', value: (r) => KIND[r.kind], groupable: true, width: 170 };
  const statusCol: TableColumn<PayComponent> = { key: 'status', header: 'Status', value: (r) => (r.status === 'active' ? 'Active' : 'Retired'), width: 96 };
  const cols: TableColumn<PayComponent>[] = compact
    ? [nameCol, { key: 'code', header: 'Code', type: 'id', value: (r) => r.code, width: 120 }, typeCol, { key: 'flags', header: 'Flags set', value: flagsOf }, statusCol]
    : [nameCol, { key: 'code', header: 'Code', type: 'id', value: (r) => r.code, width: 110 }, typeCol, ...FLAGS.map(([k, , , short, width]): TableColumn<PayComponent> => ({ key: k, header: short, value: (r) => (r[k] ? 'Yes' : '—'), width })), statusCol];
  const exportCols: TableColumn<PayComponent>[] = [
    { key: 'name', header: 'Component', value: (r) => r.name },
    { key: 'code', header: 'Code', value: (r) => r.code },
    { key: 'type', header: 'Type', value: (r) => KIND[r.kind] },
    ...FLAGS.map(([k, label]): TableColumn<PayComponent> => ({ key: k, header: label, value: (r) => (r[k] ? 'Yes' : 'No') })),
    { key: 'status', header: 'Status', value: (r) => r.status },
  ];
  const starter = () =>
    void run('starter', async () => {
      const r = await p.onInstallStarter();
      toast({ tone: 'success', title: r.componentsAdded ? `${plural(r.componentsAdded, 'starter component')} added.` : 'The starter set is already in your library.' });
    });
  const statutory = !!edit?.statutory;
  return (
    <div className="yx-pay-stack">
      <PageHeader
        title="Component library"
        description="Every earning, deduction, employer contribution, reimbursement and informational line. Flags, never names, decide the wage definitions."
        actions={
          p.state === 'ready' && (
            <>
              <Button loading={busy === 'starter'} onClick={starter}>
                Add the India starter set
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => open(null, true)}>
                Add component
              </Button>
            </>
          )
        }
      />
      {error && !draft && (
        <InlineAlert tone="danger" title="That didn’t work">
          {error}
        </InlineAlert>
      )}
      <Gate state={p.state === 'no-access' ? 'no-access' : 'ready'} what="the component library">
        <DataTable
          label="Pay components"
          columns={cols}
          rows={rows}
          getRowId={(r) => r.id}
          state={p.state === 'loading' ? 'loading' : p.state === 'error' ? 'error' : 'ready'}
          onRetry={p.onRetry}
          onRowClick={(r) => open(r)}
          activeRowId={edit?.id}
          defaultGroupBy="type"
          defaultColumnState={{ hidden: ['type'] }}
          empty={<EmptyState title="No components yet" description="Start from the India starter set and edit it." action={<Button variant="primary" loading={busy === 'starter'} onClick={starter}>Add the India starter set</Button>} />}
          onExport={() => {
            const url = URL.createObjectURL(new Blob([tableToCsv(rows, exportCols)], { type: 'text/csv' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'component-library.csv';
            a.click();
            URL.revokeObjectURL(url);
            toast({ tone: 'success', title: `Component library exported (${plural(rows.length, 'component')}).` });
          }}
        />
      </Gate>
      <Drawer
        open={!!draft}
        onOpenChange={(o) => !o && close()}
        title={isNew ? 'New component' : (edit?.name ?? '')}
        subtitle={isNew ? 'Not used in any template until you add it to one.' : edit ? `${edit.code} · ${KIND[edit.kind]}${edit.usedAt ? ` · on payslips since ${dateText(edit.usedAt)}` : ' · not on a payslip yet'}` : undefined}
        size="lg"
        footer={
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" loading={busy === 'save'} onClick={() => !early.stop() && (flagsChanged && edit?.usedAt ? setConfirm(true) : save())}>
              Save component
            </Button>
          </>
        }
      >
        {draft && (
          <div className="yx-pay-stack">
            {error && (
              <InlineAlert tone="danger" title="Not saved">
                {error}
              </InlineAlert>
            )}
            {statutory && (
              <InlineAlert tone="info" title="Statutory component">
                Its amount comes from the published statutory rules. Only its name and whether it shows on the payslip change here.
              </InlineAlert>
            )}
            <FieldRow>
              <FormField id="pc-name" label="Name" required error={early.errorOf('pc-name')}>
                <TextField value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
              </FormField>
              <FormField id="pc-code" label="Code" required helper={isNew ? 'Lower-case letters, digits and _. Fixed once a payslip uses it.' : "Codes can't change once used."} error={early.errorOf('pc-code')}>
                <TextField value={draft.code} onChange={(v) => setDraft({ ...draft, code: v.trim().toLowerCase() })} disabled={!isNew} />
              </FormField>
            </FieldRow>
            {isNew && (
              <FormField id="pc-kind" label="Type" required>
                <Select value={draft.kind} onChange={(k) => k && setDraft({ ...draft, kind: k as ComponentKind })} options={(Object.keys(KIND) as ComponentKind[]).map((k) => ({ value: k, label: KIND[k] }))} />
              </FormField>
            )}
            <FormSection title="Flags">
              {FLAGS.map(([k, label, desc]) => (
                <Checkbox key={k} label={label} description={desc || undefined} checked={draft[k]} onChange={(c) => setDraft({ ...draft, [k]: c })} disabled={statutory && k !== 'onPayslip'} />
              ))}
            </FormSection>
            <FormField id="pc-status" label="Status">
              <Segment label="Status" value={draft.status} onChange={(s) => setDraft({ ...draft, status: s })} options={[{ value: 'active', label: 'Active' }, { value: 'retired', label: 'Retired' }]} />
            </FormField>
            {edit?.usedAt && !statutory && <p className="yx-pay-note">Changing a flag applies from the next run. Past payslips don't change.</p>}
          </div>
        )}
      </Drawer>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Change the flags of ${edit?.name ?? 'this component'}?`}
        consequence={`${edit?.name ?? 'This component'} is already on payslips. The new flags apply from the next run in every template that uses it; past payslips don't change.`}
        confirmLabel="Save component"
        onConfirm={() => void save()}
      />
    </div>
  );
}

/* ================================================================== PAY-15 Payslip layout */

export interface LivePayslipLayout {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  data: PayslipLayouts | null;
  onSave: (blocks: LayoutBlock[], languages: string[]) => Promise<unknown>;
  onPreview: () => Promise<unknown>;
  onActivate: () => Promise<unknown>;
}

const BLOCK_TEXT: Record<string, string> = {
  employerName: 'Employer',
  employeeName: 'Name',
  employeeCode: 'Employee code',
  designation: 'Designation',
  period: 'Wage period',
  paidDays: 'Days paid',
  earnings: 'Wages earned',
  deductions: 'Deductions',
  grossPay: 'Gross wages',
  netPay: 'Net wages paid',
  department: 'Department',
  bankAccount: 'Bank account (last 4 digits)',
  pan: 'PAN (masked)',
  uan: 'UAN',
  leaveBalance: 'Leave balances',
  ytd: 'Year-to-date column',
  employerContributions: 'Employer contributions box',
};
const LANGUAGES = [
  { value: 'hi', label: 'Hindi (हिन्दी)' },
  { value: 'ta', label: 'Tamil (தமிழ்)' },
  { value: 'te', label: 'Telugu (తెలుగు)' },
  { value: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
];
const PREVIEW_LANG: Record<string, PayslipOptions['secondLanguage']> = { hi: 'Hindi', ta: 'Tamil', kn: 'Kannada' };
const OPTIONAL_BLOCKS = ['department', 'bankAccount', 'pan', 'uan', 'leaveBalance', 'ytd', 'employerContributions'];

/** `sample`: the design's sample payslip (sample figures; the Preview PDF shows the real layout). */
export function LivePayslipLayoutScreen({ live: p, sample }: { live: LivePayslipLayout; sample: PayslipData }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const latest = p.data?.layouts[0] ?? null;
  const active = p.data?.layouts.find((l) => l.status === 'active') ?? null;
  const draft = latest?.status === 'draft' ? latest : null;
  // Preview or Publish pressed too early: the next step, said where the buttons are (they are never disabled).
  const [tooEarly, setTooEarly] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const [blocks, setBlocks] = useState<LayoutBlock[]>([]);
  const [second, setSecond] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!p.data) return;
    const base = draft ?? active;
    setSecond(base?.languages.find((l) => l !== 'en') ?? null);
    setBlocks([...p.data.mandatory, ...OPTIONAL_BLOCKS].map((key) => ({ key, shown: p.data!.mandatory.includes(key) || !!base?.blocks.find((b) => b.key === key)?.shown })));
    setDirty(false);
    setTooEarly(null);
  }, [p.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const mandatory = new Set(p.data?.mandatory ?? []);
  const shown = (k: string) => !!blocks.find((b) => b.key === k)?.shown;
  const entity = p.entities.find((e) => e.id === p.entityId);
  const status = dirty ? `Unsaved changes to ${draft ? `version ${draft.version}` : `version ${(latest?.version ?? 0) + 1}`}` : draft ? `Draft of version ${draft.version}${draft.previewedAt ? ' · previewed' : ''}` : active ? `Version ${active.version} in use` : 'No layout yet';
  const saveDraft = () =>
    void run('save', async () => {
      await p.onSave(blocks, second ? ['en', second] : ['en']);
      setDirty(false);
      setTooEarly(null);
      toast({ tone: 'success', title: 'Draft saved. Preview the PDF, then publish it.' });
    });
  return (
    <div className="yx-pay-stack">
      <PageHeader
        title="Payslip layout"
        description={`${entity ? `${entity.name} · ` : ''}applies to all pay groups of this entity. The wage-slip particulars the law asks for are always shown. Published payslips keep the layout version they were made with.`}
        status={p.data ? <Badge tone={dirty || draft ? 'warning' : active ? 'success' : 'neutral'}>{status}</Badge> : undefined}
        actions={
          p.state === 'ready' &&
          p.data && (
            <>
              <Button loading={busy === 'save'} onClick={saveDraft}>
                Save draft
              </Button>
              <Button loading={busy === 'preview'} onClick={() => (draft && !dirty ? void run('preview', async () => { await p.onPreview(); setTooEarly(null); }) : setTooEarly('Save the draft first, then preview it.'))}>
                Preview PDF
              </Button>
              <Button variant="primary" loading={busy === 'activate'} onClick={() => (draft?.previewedAt && !dirty ? setAsk(true) : setTooEarly(draft && !dirty ? 'Preview the PDF first: a layout is used only after someone has looked at it.' : 'Save the draft and preview it first.'))}>
                Publish layout
              </Button>
            </>
          )
        }
      />
      <Gate state={p.state} onRetry={p.onRetry} what="the payslip layout">
        {p.entities.length > 1 && (
          <div className="yx-pay-narrow">
            <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} />
          </div>
        )}
        {tooEarly && (
          <InlineAlert tone="warning" title="Not yet">
            {tooEarly}
          </InlineAlert>
        )}
        {error && (
          <InlineAlert tone="danger" title="That didn’t work">
            {error}
          </InlineAlert>
        )}
        {!p.entityId ? (
          <EmptyState title="Choose a legal entity" description="Each legal entity has its own payslip layout." />
        ) : !p.data ? (
          <div role="status" aria-busy="true" aria-label="Loading the layout">
            <Skeleton height={240} />
          </div>
        ) : (
          <div className="yx-pay-grid">
            <section data-span="4" className="yx-pay-panel" aria-label="Layout settings">
              <FormSection title="Sections">
                {blocks.map((b, i) =>
                  mandatory.has(b.key) ? null : (
                    <Checkbox
                      key={b.key}
                      label={BLOCK_TEXT[b.key] ?? b.key}
                      checked={b.shown}
                      onChange={(c) => {
                        setBlocks((bs) => bs.map((x, j) => (j === i ? { ...x, shown: c } : x)));
                        setDirty(true);
                      }}
                    />
                  ),
                )}
              </FormSection>
              <FormSection title="Always shown (required on wage slips)">
                <ul aria-label="Always shown" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--yx-space-2)' }}>
                  {blocks.filter((b) => mandatory.has(b.key)).map((b) => (
                    <li key={b.key} className="yx-pay-row">
                      <Icon icon={Lock} label="Locked" /> {BLOCK_TEXT[b.key] ?? b.key}
                    </li>
                  ))}
                </ul>
              </FormSection>
              <FormSection title="Language">
                <FormField id="pl-lang" label="Second language" helper="English is always on the payslip. A second language shows each label in that script too.">
                  <Select
                    value={second}
                    onChange={(l) => {
                      setSecond(l);
                      setDirty(true);
                    }}
                    clearable
                    placeholder="English only"
                    options={LANGUAGES}
                  />
                </FormField>
              </FormSection>
            </section>
            <section data-span="8" className="yx-pay-panel" aria-label="Preview">
              <SectionTitle>Preview</SectionTitle>
              <p className="yx-pay-note">Sample figures. Preview PDF shows the saved draft as the payslip will look.</p>
              {second && (
                <InlineAlert tone="info">
                  Labels are shown in English and {LANGUAGES.find((l) => l.value === second)?.label}. Numbers stay in Indian digits.{PREVIEW_LANG[second] ? '' : ' This sample shows English only; the PDF shows both.'}
                </InlineAlert>
              )}
              <div className="yx-pay-preview" tabIndex={0} role="region" aria-label="Payslip preview">
                <PayslipDocument data={sample} options={{ showYtd: shown('ytd'), employerBox: shown('employerContributions'), leaveBalances: shown('leaveBalance'), secondLanguage: second ? PREVIEW_LANG[second] : undefined }} />
              </div>
            </section>
          </div>
        )}
      </Gate>
      <ConfirmDialog
        open={ask}
        onOpenChange={setAsk}
        title={`Publish layout version ${draft?.version ?? ''}?`}
        consequence={`Payslips made from now on for all pay groups of ${entity?.name ?? 'this entity'} use it; published payslips keep ${active ? `version ${active.version}` : 'their layout'}.`}
        confirmLabel="Publish layout"
        onConfirm={() =>
          void run('activate', async () => {
            await p.onActivate();
            toast({ tone: 'success', title: `Layout version ${draft?.version ?? ''} published.` });
          })
        }
      />
    </div>
  );
}
