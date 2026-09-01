import Link from 'next/link';
import { Plus, Mail } from 'lucide-react';
import { Panel } from '../Panel';
import { Timeline, TimelineRow } from '../Timeline';
import { STATUS } from '../viz';

// Three summary list panels for the v2 dashboard, built on the Azure-retoned 21st Timeline:
// Needs attention, Recent activity, Upcoming exams. Data slices come straight from DashboardSummary.

export interface AttentionData {
  pendingGrading: { examId: string; examTitle: string; count: number }[];
  proctoringFlags: { examId: string; examTitle: string; occurredAt: string }[];
  staleInvitationCount: number;
}

const rowLink: React.CSSProperties = { display: 'block', textDecoration: 'none' };
const countPill: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 700, padding: '1px 8px', borderRadius: 99,
  background: 'var(--surface)', border: '1px solid var(--hair)', color: 'var(--ink)', flexShrink: 0,
};
const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1,
  fontSize: 13, fontWeight: 500, padding: '9px 12px', borderRadius: 9, textDecoration: 'none',
  background: 'var(--surface)', border: '1px solid var(--hair)', color: 'var(--ink)',
};
const empty: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', padding: '4px 0' };

function timeAgo(iso: string) { return new Date(iso).toLocaleString(); }

export function AttentionPanel({ data }: { data: AttentionData }) {
  const has = data.pendingGrading.length > 0 || data.proctoringFlags.length > 0 || data.staleInvitationCount > 0;
  const rows: React.ReactNode[] = [];
  data.pendingGrading.forEach((it) => rows.push(
    <Link key={`pg-${it.examId}`} href={`/exams/${it.examId}/edit`} className="wf-row" style={rowLink}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{it.examTitle} <span style={{ color: 'var(--muted)' }}>· {it.count} answer{it.count === 1 ? '' : 's'} awaiting grading</span></span>
        <span style={countPill}>{it.count}</span>
      </div>
    </Link>,
  ));
  data.proctoringFlags.forEach((it, i) => rows.push(
    <Link key={`pf-${it.examId}-${i}`} href={`/exams/${it.examId}/edit`} className="wf-row" style={rowLink}>
      <div style={{ fontSize: 13, color: 'var(--ink)' }}>{it.examTitle} <span style={{ color: 'var(--muted)' }}>· flagged a proctoring violation</span></div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>{timeAgo(it.occurredAt)}</div>
    </Link>,
  ));
  if (data.staleInvitationCount > 0) rows.push(
    <div key="stale" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>Candidates invited 5+ days ago <span style={{ color: 'var(--muted)' }}>· haven&apos;t started</span></span>
      <span style={countPill}>{data.staleInvitationCount}</span>
    </div>,
  );

  const rowColors = [
    ...data.pendingGrading.map(() => STATUS.bad),
    ...data.proctoringFlags.map(() => STATUS.warn),
    ...(data.staleInvitationCount > 0 ? ['var(--muted)'] : []),
  ];

  return (
    <Panel title="Needs your attention">
      {!has ? (
        <p style={empty}>Nothing needs attention right now.</p>
      ) : (
        <Timeline>
          {rows.map((node, i) => (
            <TimelineRow key={i} color={rowColors[i]} last={i === rows.length - 1}>{node}</TimelineRow>
          ))}
        </Timeline>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <Link href="/exams/new" style={secondaryBtn}><Plus size={14} /> Create exam</Link>
        <Link href="/candidates" style={secondaryBtn}><Mail size={14} /> Invite candidates</Link>
      </div>
    </Panel>
  );
}

export function ActivityPanel({ activity }: { activity: { id: string; description: string; occurredAt: string }[] }) {
  return (
    <Panel title="Recent activity">
      {activity.length === 0 ? (
        <p style={empty}>No recent activity.</p>
      ) : (
        <Timeline>
          {activity.map((it, i) => (
            <TimelineRow key={it.id} color={STATUS.ok} last={i === activity.length - 1}>
              <div style={{ fontSize: 13, color: 'var(--ink)' }}>{it.description}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>{timeAgo(it.occurredAt)}</div>
            </TimelineRow>
          ))}
        </Timeline>
      )}
    </Panel>
  );
}

export function UpcomingExamsPanel({ exams }: { exams: { examId: string; examTitle: string; availabilityWindowStart: string }[] }) {
  if (exams.length === 0) return null;
  return (
    <Panel title="Upcoming exams">
      <Timeline>
        {exams.map((it, i) => (
          <TimelineRow key={it.examId} color="var(--org-primary)" last={i === exams.length - 1}>
            <Link href={`/exams/${it.examId}/edit`} className="wf-row" style={rowLink}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{it.examTitle}</span>
                <span style={{ fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>{new Date(it.availabilityWindowStart).toLocaleDateString()}</span>
              </div>
            </Link>
          </TimelineRow>
        ))}
      </Timeline>
    </Panel>
  );
}
