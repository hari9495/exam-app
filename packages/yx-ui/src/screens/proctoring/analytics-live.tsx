import { BarChart, Funnel, StatCard } from '../../components/charts';
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
        actions={<Select aria-label="Period" value={live.period} onChange={(v) => v && live.onPeriod(v)} options={HIRING_PERIODS} size="sm" />}
      />
      <DashboardGrid label="Hiring dashboard" widgets={widgets} customisable={false} />
    </AnlFrame>
  );
}
