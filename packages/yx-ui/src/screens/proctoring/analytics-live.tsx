import { useState } from 'react';
import { BarChart, Funnel, StatCard } from '../../components/charts';
import { Button } from '../../components/button';
import { Switch } from '../../components/choice';
import { ErrorState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Dialog } from '../../components/overlay';
import { DataTable } from '../../components/table';
import { MultiSelect } from '../../components/select';
import { useRun } from '../org/org-kit';
import { useSay } from '../ops/ops-kit';
import { DashboardGrid, type DashboardWidget } from '../../components/dashboard';
import { Select } from '../../components/select';
import { PageHeader } from '../../components/shell';
import { formatINR } from '../../lib/format';
import { AnlFrame } from './proctoring-shared';

// Answer 2432 (decision 2398): the designed ANL-02 Recruiter dashboard, live, in place of the older /v2 recruiting
// overview and hiring analytics. Figures come from GET /analytics/hiring (the window) and, for people with the costs
// key, the recruiting costs of the quarter.

export type HiringPeriod = '30' | '90' | '365';
export const HIRING_PERIODS: { value: HiringPeriod; label: string }[] = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
];
const STAGE_WORDS: Record<string, string> = { active: 'Applied', offer: 'Offered', hired: 'Hired' };
const SOURCE_WORDS: Record<string, string> = { application: 'Applied', reapply: 'Applied again', manual: 'Added by HR', referral: 'Referral', agency: 'Agency', drive: 'Campus or walk-in drive', exam: 'Test invitation', internal: 'Internal job' };

export interface LiveHiringDashboard {
  state: 'loading' | 'error' | 'ready';
  onRetry: () => void;
  period: HiringPeriod;
  onPeriod: (p: HiringPeriod) => void;
  data: {
    openJobs: number;
    timeToHire: { medianDays: number | null; hiredCount: number };
    offers: { accepted: number; declined: number };
    funnel: { stage: string; reached: number }[];
    sources: { source: string; entered: number; hired: number }[];
  } | null;
  /** Spend this quarter ÷ hires this quarter; absent for people without the costs key. */
  costPerHire?: { spend: number; hires: number } | null;
  links: { jobs: string; candidates: string; costs?: string };
  /** As drawn: "Schedule" opens the report schedules (company admins only). */
  onSchedule?: () => void;
}

export function HiringDashboardScreen({ live }: { live: LiveHiringDashboard }) {
  const d = live.data;
  const busy = live.state === 'loading' ? ('loading' as const) : live.state === 'error' ? ('error' as const) : undefined;
  const window = HIRING_PERIODS.find((p) => p.value === live.period)!.label.toLowerCase();
  const answered = d ? d.offers.accepted + d.offers.declined : 0;
  const stat = (id: string, label: string, value: number, extra: Partial<Parameters<typeof StatCard>[0]>): DashboardWidget => ({
    id,
    title: label,
    size: 3,
    bare: true,
    state: busy,
    onRetry: live.onRetry,
    content: <StatCard label={label} value={value} drill={{ label: 'View jobs', href: live.links.jobs }} {...extra} />,
  });
  const widgets: DashboardWidget[] = [
    stat('open', 'Open positions', d?.openJobs ?? 0, { drill: { label: 'View open jobs', href: live.links.jobs } }),
    stat('tth', 'Time to hire (median days)', Math.round(d?.timeToHire.medianDays ?? 0), {
      unit: 'days',
      empty: d && d.timeToHire.medianDays == null ? `No hires in the ${window}` : undefined,
      drill: { label: `View ${d?.timeToHire.hiredCount ?? 0} hires`, href: live.links.candidates },
    }),
    stat('offer', 'Offer acceptance (%)', answered ? Math.round((d!.offers.accepted / answered) * 100) : 0, {
      unit: '%',
      empty: d && !answered ? `No offers answered in the ${window}` : undefined,
      drill: { label: `View ${answered} answered offers`, href: live.links.candidates },
    }),
    ...(live.costPerHire !== undefined && live.links.costs
      ? [
          stat('cph', 'Cost per hire, this quarter', live.costPerHire?.hires ? Math.round(live.costPerHire.spend / live.costPerHire.hires) : 0, {
            money: true,
            empty: !live.costPerHire?.hires ? 'No hires this quarter yet' : undefined,
            drill: { label: 'View recruiting costs', href: live.links.costs },
          }),
        ]
      : []),
    {
      id: 'funnel',
      title: 'Pipeline',
      size: 6,
      bare: true,
      state: busy,
      onRetry: live.onRetry,
      content: <Funnel title={`Pipeline, ${window}`} description="Applications that came in during the period and how far they got" stages={(d?.funnel ?? []).map((f) => ({ label: STAGE_WORDS[f.stage] ?? f.stage, count: f.reached }))} />,
    },
    {
      id: 'src',
      title: 'Sources',
      size: 6,
      bare: true,
      state: busy,
      onRetry: live.onRetry,
      content: (
        <BarChart
          title={`Applications and hires by source, ${window}`}
          categories={(d?.sources ?? []).map((s) => SOURCE_WORDS[s.source] ?? s.source)}
          series={[
            { name: 'Applications', values: (d?.sources ?? []).map((s) => s.entered) },
            { name: 'Hires', values: (d?.sources ?? []).map((s) => s.hired) },
          ]}
          emphasis="Hires"
        />
      ),
    },
  ];
  return (
    <AnlFrame page="Dashboards">
      <PageHeader
        title="Hiring dashboard"
        description={live.costPerHire === undefined ? 'Your hiring at a glance.' : `Your hiring at a glance. Cost per hire is this quarter's spend ÷ this quarter's hires (${formatINR(live.costPerHire?.spend ?? 0)} spent).`}
        actions={
          <>
            <Select aria-label="Period" value={live.period} onChange={(v) => v && live.onPeriod(v)} options={HIRING_PERIODS} size="sm" />
            {live.onSchedule && <Button onClick={live.onSchedule}>Schedule</Button>}
          </>
        }
      />
      <DashboardGrid label="Hiring dashboard" widgets={widgets} customisable={false} />
    </AnlFrame>
  );
}

/* ANL-08 · Schedules, live (answer 2428): the weekly hiring digest (the older /v2 Scheduled reports page). */

export interface LiveSchedules {
  state: 'loading' | 'error' | 'ready';
  onRetry: () => void;
  digest: { enabled: boolean; recipientIds: string[]; lastSentAt: string | null };
  people: { id: string; name: string }[];
  onSave: (v: { enabled: boolean; recipientIds: string[] }) => Promise<void>;
}

export function LiveSchedulesScreen({ live }: { live: LiveSchedules }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(live.digest.enabled);
  const [ids, setIds] = useState<string[]>(live.digest.recipientIds);
  const [tried, setTried] = useState(false);
  const { busy, run, error, clearError } = useRun();
  const { done } = useSay();
  const name = (id: string) => live.people.find((p) => p.id === id)?.name ?? 'Someone who has left';
  const row = { id: 'hiring-digest', target: 'Hiring dashboard: weekly digest', frequency: 'Weekly', recipients: live.digest.recipientIds.map(name).join(', ') || 'No one yet', delivery: 'Email · CSV attached', lastRun: live.digest.lastSentAt ? new Date(live.digest.lastSentAt) : null, status: live.digest.enabled ? 'On' : 'Off' };
  const edit = () => {
    clearError();
    setEnabled(live.digest.enabled);
    setIds(live.digest.recipientIds);
    setTried(false);
    setOpen(true);
  };
  const save = async () => {
    setTried(true);
    if (enabled && !ids.length) return;
    if (await run('save', () => live.onSave({ enabled, recipientIds: ids }))) {
      done(enabled ? 'The weekly hiring digest is on' : 'The weekly hiring digest is off');
      setOpen(false);
    }
  };
  return (
    <AnlFrame page="Schedules">
      <PageHeader title="Schedules and exports" description="Each recipient gets only what their own access allows. Every export is audited." />
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load the schedules." onRetry={live.onRetry} />
      ) : (
        <DataTable
          label="Schedules"
          columns={[
            { key: 'target', header: 'Dashboard or report', value: (r: typeof row) => r.target, width: 260 },
            { key: 'frequency', header: 'When', value: (r: typeof row) => r.frequency, width: 160 },
            { key: 'recipients', header: 'Recipients', value: (r: typeof row) => r.recipients, width: 260 },
            { key: 'delivery', header: 'Delivery', value: (r: typeof row) => r.delivery, width: 190 },
            { key: 'lastRun', header: 'Last sent', type: 'date', value: (r: typeof row) => r.lastRun, width: 130 },
            { key: 'status', header: 'Status', type: 'status', value: (r: typeof row) => r.status, statusTone: (v) => (v === 'On' ? 'success' : 'neutral'), width: 110 },
          ]}
          rows={[row]}
          getRowId={(r) => r.id}
          state={live.state === 'loading' ? 'loading' : 'ready'}
          rowButtons={() => (
            <Button size="sm" onClick={edit}>
              Edit
            </Button>
          )}
        />
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Schedule: Hiring dashboard weekly digest"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'save'} onClick={() => void save()}>
              Save schedule
            </Button>
          </>
        }
      >
        <div className="yx-prc-stack">
          {error && <InlineAlert tone="danger" title={error} />}
          <Switch checked={enabled} onChange={setEnabled} label="Send the weekly digest" description="A summary of the week's hiring with a CSV of the figures, once a week." />
          <div className="yx-prc-grid2">
            <FormField id="dig-when" label="How often">
              <TextField id="dig-when" value="Weekly" readOnly />
            </FormField>
            <FormField id="dig-format" label="Format">
              <TextField id="dig-format" value="Email with a CSV attached" readOnly />
            </FormField>
          </div>
          <FormField id="dig-to" label="Recipients" required={enabled} error={tried && enabled && !ids.length ? 'Choose at least one person to send it to.' : undefined}>
            <MultiSelect id="dig-to" options={live.people.map((p) => ({ value: p.id, label: p.name }))} value={ids} onChange={setIds} placeholder="Choose people" />
          </FormField>
        </div>
      </Dialog>
    </AnlFrame>
  );
}
