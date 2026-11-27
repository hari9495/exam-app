// T2-G 47 (answer 2747): ANL-04 Metric explorer made live for headcount and attrition. Headcount is counted on the last
// day of each month; attrition = exits in the period ÷ average month-end headcount, voluntary and involuntary, split by
// legal entity, department, location or grade. A group under 5 people shows no numbers. CSV download as other reports.
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, ButtonGroup } from '../../components/button';
import { DataTable } from '../../components/table';
import { ErrorState, NoAccessState, Skeleton } from '../../components/feedback';
import { Card, DescriptionList, PageHeader } from '../../components/shell';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { BarChart, LineChart, StatCard } from '../../components/charts';
import { useToastIfAny } from '../../components/notify';
import { AnlFrame } from './proctoring-shared';

export type AttritionSplit = 'entity' | 'department' | 'location' | 'grade';
export interface AttritionFigures {
  avgHeadcount: number;
  exits: number;
  voluntary: number;
  involuntary: number;
  notRecorded: number;
  rate: number | null;
  voluntaryRate: number | null;
}
export type AttritionGroup = { id: string | null; name: string; hidden: true } | ({ id: string | null; name: string; hidden: false } & AttritionFigures);
/** GET /people/attrition */
export interface AttritionView {
  from: string;
  to: string;
  by: AttritionSplit;
  minGroup: number;
  months: { month: string; headcount: number }[];
  total: AttritionFigures;
  groups: AttritionGroup[];
}
export interface LiveAttrition {
  state: 'loading' | 'error' | 'no-access' | 'ready';
  onRetry: () => void;
  data: AttritionView | null;
  by: AttritionSplit;
  onBy: (by: AttritionSplit) => void;
  /** Period choices, e.g. last 12 months; value is "from|to" (YYYY-MM). */
  periods: { value: string; label: string }[];
  period: string;
  onPeriod: (value: string) => void;
  onExport: () => Promise<void>;
}

const SPLIT_WORDS: Record<AttritionSplit, string> = { entity: 'Legal entity', department: 'Department', location: 'Location', grade: 'Grade' };
const monthWord = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const pct = (v: number | null) => (v == null ? '—' : `${v} %`);

export function LiveAttritionScreen({ live }: { live: LiveAttrition }) {
  const toast = useToastIfAny();
  const [view, setView] = useState<'trend' | 'breakdown' | 'table'>('breakdown');
  const [busy, setBusy] = useState(false);
  const d = live.data;
  const download = async () => {
    setBusy(true);
    try {
      await live.onExport();
      toast?.toast({ tone: 'success', title: 'Headcount and attrition downloaded' });
    } catch (e) {
      toast?.toast({ tone: 'error', title: e instanceof Error && e.message ? e.message : "We couldn't download it. Try again." });
    } finally {
      setBusy(false);
    }
  };
  const header = (
    <PageHeader
      title="Headcount and attrition"
      description="Headcount on the last day of each month. Attrition is exits in the period divided by the average headcount."
      actions={live.state === 'ready' ? <Button icon={Download} loading={busy} onClick={() => void download()}>Download CSV</Button> : undefined}
    />
  );
  if (live.state !== 'ready' || !d)
    return (
      <AnlFrame page="Explorer">
        {header}
        {live.state === 'loading' && <Skeleton height={320} />}
        {live.state === 'error' && <ErrorState title="We couldn't load headcount and attrition." description="Check your connection and try again." onRetry={live.onRetry} />}
        {live.state === 'no-access' && <NoAccessState what="headcount and attrition" grantedBy="your System Admin" />}
      </AnlFrame>
    );
  // Each number drills to the view that explains it (§22: no number without a drill).
  const go = (v: typeof view, label: string) => ({ label, href: `#${v}`, onClick: (e: { preventDefault: () => void }) => (e.preventDefault(), setView(v)) });
  const shown = d.groups.filter((g): g is Extract<AttritionGroup, { hidden: false }> => !g.hidden);
  return (
    <AnlFrame page="Explorer">
      {header}
      <div className="yx-prc-grid4">
        <FormField label="Split by">
          <Select value={live.by} onChange={(v) => v && live.onBy(v as AttritionSplit)} options={(Object.keys(SPLIT_WORDS) as AttritionSplit[]).map((k) => ({ value: k, label: SPLIT_WORDS[k] }))} />
        </FormField>
        <FormField label="Period">
          <Select value={live.period} onChange={(v) => v && live.onPeriod(v)} options={live.periods} />
        </FormField>
      </div>
      <div className="yx-prc-grid4">
        <StatCard label="Average headcount" value={d.total.avgHeadcount} drill={go('trend', 'See it by month')} />
        <StatCard label="Exits" value={d.total.exits} drill={go('table', `By ${SPLIT_WORDS[d.by].toLowerCase()}`)} />
        <StatCard label="Attrition (%)" value={d.total.rate ?? 0} unit="%" drill={go('breakdown', `By ${SPLIT_WORDS[d.by].toLowerCase()}`)} />
        <StatCard label="Voluntary attrition (%)" value={d.total.voluntaryRate ?? 0} unit="%" drill={go('breakdown', `By ${SPLIT_WORDS[d.by].toLowerCase()}`)} />
      </div>
      <ButtonGroup aria-label="View">
        {(['trend', 'breakdown', 'table'] as const).map((x) => (
          <Button key={x} size="sm" aria-pressed={view === x} onClick={() => setView(x)}>
            {x[0]!.toUpperCase() + x.slice(1)}
          </Button>
        ))}
      </ButtonGroup>
      <div className="yx-prc-split">
        {view === 'trend' ? (
          <LineChart title="Headcount on the last day of each month" categories={d.months.map((m) => monthWord(m.month))} series={[{ name: 'Headcount', values: d.months.map((m) => m.headcount) }]} />
        ) : view === 'breakdown' ? (
          <BarChart
            title={`Attrition by ${SPLIT_WORDS[d.by].toLowerCase()} (%)`}
            categories={shown.map((g) => g.name)}
            series={[{ name: 'Voluntary', values: shown.map((g) => g.voluntaryRate ?? 0) }, { name: 'Other exits', values: shown.map((g) => Math.round(((g.rate ?? 0) - (g.voluntaryRate ?? 0)) * 10) / 10) }]}
            stacked
            groupSizes={shown.map((g) => g.avgHeadcount)}
            minGroupSize={d.minGroup}
          />
        ) : (
          <DataTable
            label="Attrition by group"
            columns={[
              { key: 'name', header: SPLIT_WORDS[d.by], value: (g: AttritionGroup) => g.name, width: 180 },
              { key: 'avg', header: 'Average headcount', type: 'number', value: (g: AttritionGroup) => (g.hidden ? null : g.avgHeadcount), render: (g) => (g.hidden ? `Fewer than ${d.minGroup} people` : String(g.avgHeadcount)), width: 170 },
              { key: 'exits', header: 'Exits', type: 'number', value: (g: AttritionGroup) => (g.hidden ? null : g.exits), render: (g) => (g.hidden ? '' : String(g.exits)), width: 90 },
              { key: 'vol', header: 'Voluntary', type: 'number', value: (g: AttritionGroup) => (g.hidden ? null : g.voluntary), render: (g) => (g.hidden ? '' : String(g.voluntary)), width: 100 },
              { key: 'invol', header: 'Involuntary', type: 'number', value: (g: AttritionGroup) => (g.hidden ? null : g.involuntary), render: (g) => (g.hidden ? '' : String(g.involuntary)), width: 110 },
              { key: 'rate', header: 'Attrition', type: 'number', value: (g: AttritionGroup) => (g.hidden ? null : g.rate), render: (g) => (g.hidden ? '' : pct(g.rate)), width: 100 },
            ]}
            rows={d.groups}
            getRowId={(g) => g.id ?? 'none'}
          />
        )}
        <Card title="Definition">
          <DescriptionList
            items={[
              { label: 'Period', value: `${monthWord(d.from)} to ${monthWord(d.to)}` },
              { label: 'Headcount', value: 'People employed on the last day of the month' },
              { label: 'Attrition', value: 'Exits in the period ÷ average month-end headcount' },
              { label: 'Voluntary', value: 'The person resigned or took VRS' },
              { label: 'Small groups', value: `Under ${d.minGroup} people: no numbers shown` },
              ...(d.total.notRecorded ? [{ label: 'Not recorded', value: `${d.total.notRecorded} exits have no exit case, so they are neither voluntary nor involuntary` }] : []),
            ]}
          />
        </Card>
      </div>
    </AnlFrame>
  );
}
