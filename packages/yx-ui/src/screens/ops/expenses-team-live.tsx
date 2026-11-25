// Expenses round 2 (founder answer 1, 3 Nov 2026): "Team claims", a manager's read-only list of the claims their direct
// reports sent in a month, with the claims that have over-limit lines. The EXP-01 manager cards drill into it. The
// design stories (EXP-01 › Team claims …) and the live page render this same component; only the data differs.
import { PhoneFrame } from '../_kit/frames';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState } from '../../components/feedback';
import { DataTable, type TableColumn } from '../../components/table';
import { PageHeader } from '../../components/shell';
import { Segment } from '../../components/segment';
import { useNarrow } from '../../components/stepper';
import { Facts, OpsDesk } from './ops-kit';
import { ClaimStatusBadges } from './expenses-live';
import { NotReady } from './expenses-travel-live';
import { day, money, monthName, paise, prevMonthOf, teamSpend, type LoadState } from './expenses-live-data';
import type { TeamClaims } from '../expenses/live/types';

type Row = TeamClaims['claims'][number];

export interface LiveTeam {
  state: LoadState;
  onRetry: () => void;
  team: TeamClaims | null;
  /** Today in IST (yyyy-mm-dd): the month switch offers this month and last. */
  today: string;
  /** The month shown (yyyy-mm). */
  month: string;
  onMonth: (month: string) => void;
  /** Only claims with over-limit lines (the "Over-limit lines" card's drill). */
  over: boolean;
  onOver: (over: boolean) => void;
  onOpen: (id: string) => void;
}

export function LiveTeamClaims({ live }: { live: LiveTeam }) {
  const phone = useNarrow();
  if (live.state !== 'ready' || !live.team)
    return <NotReady state={live.state} onRetry={live.onRetry} what="team claims" title="Team claims" active="Team claims" phone={phone} grantedBy="HR" note="Team claims are for managers: people who have someone reporting to them." />;
  const t = live.team;
  const thisMonth = live.today.slice(0, 7);
  const overCount = t.claims.filter((c) => c.overLimit > 0).length;
  const rows = live.over ? t.claims.filter((c) => c.overLimit > 0) : t.claims;
  const currency = t.claims[0]?.currency ?? 'INR';
  const columns: TableColumn<Row>[] = [
    { key: 'person', header: 'Person', value: (r) => r.person, width: 180 },
    { key: 'title', header: 'Claim', value: (r) => r.title, width: 240 },
    { key: 'sent', header: 'Sent', type: 'date', value: (r) => (r.submittedAt ? day(r.submittedAt) : null) },
    { key: 'amount', header: 'Amount', value: (r) => paise(r.approvedTotal ?? r.claimedTotal), render: (r) => money(r.currency, r.approvedTotal ?? r.claimedTotal) },
    { key: 'over', header: 'Over-limit lines', value: (r) => r.overLimit, render: (r) => (r.overLimit ? <Badge tone="warning">{r.overLimit}</Badge> : '—') },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <ClaimStatusBadges c={r} /> },
    // Batch E A4 (2552): who each claim waits on.
    { key: 'waiting', header: 'Waiting on', value: (r) => r.waitingOn ?? '', render: (r) => r.waitingOn ?? '—' },
  ];
  const body = (
    <>
      <div className="yx-ops-row">
        <Segment label="Month" value={live.month} onChange={live.onMonth} options={[{ value: thisMonth, label: monthName(thisMonth) }, { value: prevMonthOf(thisMonth), label: monthName(prevMonthOf(thisMonth)) }]} />
        <Segment label="Show" value={live.over ? 'over' : 'all'} onChange={(v) => live.onOver(v === 'over')} options={[{ value: 'all', label: `All claims (${t.claims.length})` }, { value: 'over', label: `With over-limit lines (${overCount})` }]} />
      </div>
      <Facts
        items={[
          { label: 'People reporting to you', value: String(t.people) },
          { label: `Team spend, ${monthName(t.month)}`, value: money(currency, teamSpend(t.claims)) },
          { label: 'Over-limit lines', value: String(t.claims.reduce((s, c) => s + c.overLimit, 0)), tone: overCount ? 'warning' : undefined },
        ]}
      />
      <DataTable
        label="Team claims"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        rowNoun={['claim', 'claims']}
        cardSummary
        empty={<EmptyState compact title={live.over ? `No over-limit lines in ${monthName(t.month)}.` : `No claims sent in ${monthName(t.month)}.`} description="Claims show here once your team sends them for approval." />}
        rowButtons={(r) => (r.canOpen ? <Button size="sm" onClick={() => live.onOpen(r.id)}>Open</Button> : null)}
      />
      <p className="yx-ops-muted">Read only. You can open a claim you approve; others stay with their approvers.</p>
    </>
  );
  if (phone) return <PhoneFrame tab="pay" title="Team claims">{body}</PhoneFrame>;
  return (
    <OpsDesk area="expenses" active="Team claims">
      <PageHeader title="Team claims" description="Claims your direct reports sent this month or last. Approve them from Approvals." />
      {body}
    </OpsDesk>
  );
}
