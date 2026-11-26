// PLT-57 Test and preview, live (E2 part 5, "Try it"): the route a request of this type would take, on typed sample values
// or on a past request that kept its values. The server runs the engine's own route() (the function used when a request
// is sent), on the policy as it is now in the editor. Nothing is saved or sent.
import { useEffect, useState } from 'react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { CurrencyField, NumberField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { formatDate } from '../../lib/format';
import type { PastRequest, PolicyBodyInput, PolicyTypeRow, TryInput, TryResult } from '../platform-a/approval-rules-types';

export interface LiveTry {
  row: PolicyTypeRow;
  /** The policy as it is in the editor now (tried instead of the saved one). */
  draft: PolicyBodyInput | null;
  onTry: (type: string, input: TryInput) => Promise<TryResult>;
  pastRequests?: (type: string) => Promise<PastRequest[]>;
  /** Open on sample values or on a past request. */
  mode?: 'sample' | 'past';
  onClose: () => void;
}
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not go through. Try again.');
const FROM = { company: 'Your rule', required: 'Always added', built_in: 'Built in' } as const;

/** The values a sample request carries, one field per declared value. */
export function SampleValues({ row, values, onChange }: { row: PolicyTypeRow; values: Record<string, string | number>; onChange: (v: Record<string, string | number>) => void }) {
  const set = (k: string, v: string | number | null) => {
    const next = { ...values };
    if (v === null || v === '') delete next[k];
    else next[k] = v;
    onChange(next);
  };
  return (
    <>
      {(row.fields ?? []).map((f) => (
        <FormField key={f.key} label={f.label}>
          {f.type === 'money' ? (
            <CurrencyField value={(values[f.key] as number | undefined) ?? null} onChange={(v) => set(f.key, v)} />
          ) : f.type === 'number' ? (
            <NumberField value={(values[f.key] as number | undefined) ?? null} onChange={(v) => set(f.key, v)} min={0} />
          ) : (
            <Select value={(values[f.key] as string | undefined) ?? null} onChange={(v) => set(f.key, v)} options={f.options ?? []} clearable />
          )}
        </FormField>
      ))}
    </>
  );
}

/** The route as steps, each with who it went to. */
export function TryTrace({ result }: { result: TryResult }) {
  return (
    <div className="yxp-stack">
      <p className="yxp-muted">{result.rule ? `Matches: ${result.rule}.` : "No company rule: the module's built-in steps."}</p>
      {result.builtIn && <p className="yxp-muted">The module's own steps go first or stay as set: {result.builtIn}.</p>}
      <ol className="yxp-trace" aria-label="Route of the request">
        {result.steps.map((s, i) => (
          <li key={`${s.name}-${i}`}>
            <Badge tone={s.nobody ? 'danger' : s.fallback ? 'warning' : s.state === 'skipped' ? 'neutral' : 'success'}>{s.nobody ? 'Nobody' : s.fallback ? 'To the fallback' : s.state === 'skipped' ? 'Skipped' : FROM[s.from]}</Badge>
            <strong>
              Step {i + 1}: {s.name}
            </strong>
            <p className="yxp-muted">{s.nobody ? 'No one can approve this step, so the request would be refused.' : `${s.approvers.join(', ') || 'No one'}${s.need > 1 ? ` (${s.need} must approve)` : ''}${s.fallback ? '. Nobody else could, so the fallback people get it.' : ''}`}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function LiveTryDrawer({ live }: { live: LiveTry }) {
  const [mode, setMode] = useState<'sample' | 'past'>(live.mode ?? 'sample');
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [past, setPast] = useState<PastRequest[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TryResult | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const loadPast = live.pastRequests;
  useEffect(() => {
    if (mode !== 'past' || past || !loadPast) return;
    loadPast(live.row.key).then(setPast, (e) => setFailed(errorText(e)));
  }, [mode, past, loadPast, live.row.key]);
  const run = async () => {
    setBusy(true);
    setFailed(null);
    try {
      setResult(await live.onTry(live.row.key, { ...(mode === 'past' ? { requestId: pick! } : { values }), ...(live.draft ? { draft: live.draft } : {}) }));
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && live.onClose()}
      size="lg"
      title="Try it"
      subtitle={`${live.row.label} approvals · ${live.draft ? 'as in the editor now' : 'as saved'} · nothing is saved or sent`}
      footer={<Button onClick={live.onClose}>Close</Button>}
    >
      <div className="yxp-stack">
        <FormField label="Try on">
          <Segment
            label="Try on"
            options={[{ value: 'sample', label: 'Sample values' }, { value: 'past', label: 'A past request' }]}
            value={mode}
            onChange={(v) => {
              setMode(v as 'sample' | 'past');
              setResult(null);
            }}
          />
        </FormField>
        {mode === 'sample' ? (
          (live.row.fields ?? []).length ? <SampleValues row={live.row} values={values} onChange={setValues} /> : <p className="yxp-muted">This request type sends no values, so every request takes the same route. Try it to see who approves.</p>
        ) : (
          <FormField label="Past request" helper="The latest 20 of this type that kept their values. The test reads them; it never changes them.">
            <Select value={pick} onChange={setPick} options={(past ?? []).map((p) => ({ value: p.id, label: `${p.title} · ${formatDate(new Date(p.submittedAt))}` }))} emptyText="No past requests of this type yet" placeholder={past ? 'Choose a request' : 'Loading…'} />
          </FormField>
        )}
        <div className="yxp-row">
          <Button variant="primary" loading={busy} disabled={mode === 'past' && !pick} onClick={() => void run()}>
            Run
          </Button>
        </div>
        {failed && <InlineAlert tone="danger" title={failed} />}
        {busy ? <p className="yxp-muted" aria-live="polite">Working out the route…</p> : result ? <TryTrace result={result} /> : <p className="yxp-muted">Run it to see which rule matches and who approves each step.</p>}
      </div>
    </Drawer>
  );
}
