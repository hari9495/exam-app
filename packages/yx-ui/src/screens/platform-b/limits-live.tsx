// PLT-34 Lookup table, live (E2 part 5, answer 2645): Settings › Approval limits. For each family of amount requests
// (expenses, hiring, pay), the largest amount someone of each grade approves. "Up the chain to the approval limit" steps
// read it. Empty by default; a grade left blank has no limit. The pay limits also need the pay approve key.
import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { CurrencyField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { ObjectHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { useToastIfAny } from '../../components/notify';
import { formatDate } from '../../lib/format';

export interface LimitFamily {
  key: string;
  label: string;
  payKey: string | null;
  rows: { gradeId: string; amount: string }[];
  updatedBy: string | null;
  updatedAt: string | null;
}
export interface LiveLimits {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  canEdit: boolean;
  families: LimitFamily[];
  grades: { id: string; name: string; code: string; rank: number }[];
  onSave: (family: string, rows: { gradeId: string; amount: string }[]) => Promise<unknown>;
}
type Grade = LiveLimits['grades'][number];
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not go through. Try again.');

export function LiveLimitsScreen({ live }: { live: LiveLimits }) {
  const [family, setFamily] = useState(live.families[0]?.key ?? 'expense');
  if (live.state === 'no-access') return <NoAccessState grantedBy="your System Admin" what="approval limits" />;
  if (live.state === 'error') return <ErrorState title="We couldn't load the approval limits." description="Retry in a moment. Nothing has changed." onRetry={live.onRetry} />;
  const f = live.families.find((x) => x.key === family);
  return (
    <div className="yxp-stack">
      <FormField label="Limits for">
        <Segment label="Limits for" options={live.families.map((x) => ({ value: x.key, label: x.label }))} value={family} onChange={(v) => setFamily(String(v))} />
      </FormField>
      {f ? <FamilyTable key={`${f.key}:${f.updatedAt ?? ''}`} live={live} f={f} /> : <p className="yxp-muted">Loading…</p>}
    </div>
  );
}

function FamilyTable({ live, f }: { live: LiveLimits; f: LimitFamily }) {
  const toaster = useToastIfAny();
  const [amounts, setAmounts] = useState<Record<string, number | null>>(Object.fromEntries(f.rows.map((r) => [r.gradeId, Number(r.amount)])));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const set = Object.values(amounts).filter((v) => v !== null && v !== undefined).length;
  const cols: TableColumn<Grade>[] = [
    { key: 'grade', header: 'Grade', value: (g) => g.name, render: (g) => <strong>{`${g.name} (${g.code})`}</strong> },
    { key: 'rank', header: 'Rank', type: 'number', value: (g) => g.rank },
    {
      key: 'amount',
      header: 'Largest amount they approve',
      value: (g) => amounts[g.id] ?? null,
      render: (g) => <CurrencyField aria-label={`Limit for ${g.name}`} value={amounts[g.id] ?? null} onChange={(v) => setAmounts((a) => ({ ...a, [g.id]: v }))} disabled={!live.canEdit} />,
    },
  ];
  const save = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await live.onSave(f.key, Object.entries(amounts).flatMap(([gradeId, v]) => (v === null || v === undefined ? [] : [{ gradeId, amount: v.toFixed(2) }])));
      toaster?.toast({ tone: 'success', title: `${f.label} limits saved` });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <ObjectHeader
        name={`${f.label} approval limits`}
        icon={FileSpreadsheet}
        secondary="Grade → the largest amount someone of that grade approves. Steps that go up the manager chain to the approval limit stop at the first manager whose limit covers the amount."
        status={!live.canEdit ? <Badge tone="neutral">View only</Badge> : set ? <Badge tone="success">In use</Badge> : <Badge tone="neutral">No limits yet</Badge>}
        facts={[
          { label: 'Grades', value: live.grades.length },
          { label: 'With a limit', value: set },
          { label: 'Last change', value: f.updatedAt ? `${formatDate(new Date(f.updatedAt))}${f.updatedBy ? `, ${f.updatedBy}` : ''}` : '—' },
        ]}
        actions={
          live.canEdit ? (
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              Save {f.label.toLowerCase()} limits
            </Button>
          ) : undefined
        }
      />
      {f.payKey && <InlineAlert tone="info" title={`Changing pay limits needs ${f.payKey} in every legal entity.`} />}
      {failed && <InlineAlert tone="danger" title={failed} />}
      <DataTable label={`${f.label} approval limits`} columns={cols} rows={live.state === 'ready' ? live.grades : []} getRowId={(g) => g.id} state={live.state === 'loading' ? 'loading' : 'ready'} defaultGroupBy={null} empty={<p className="yxp-muted">Add grades under Settings › Grades first.</p>} />
    </>
  );
}
