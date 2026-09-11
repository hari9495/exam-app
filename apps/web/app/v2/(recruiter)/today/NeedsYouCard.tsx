'use client';

// The people-first worklist: person + context + one next action per row. Exactly one row on the
// whole page gets the solid accent action (the first row of the first non-empty group) -- every
// other row's action is the outline/secondary style. Groups with zero items are not rendered.
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Card } from '../../../../components/ui-v2/Card';
import { TodayItem, TodayResponse } from '../../../../lib/types';

type NeedsYou = TodayResponse['needsYou'];
type GroupKey = 'feedbackOwed' | 'interviewsToday' | 'offersExpiring' | 'approvalsPending';

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'feedbackOwed', label: 'Feedback you owe' },
  { key: 'interviewsToday', label: 'Interviews today' },
  { key: 'offersExpiring', label: 'Offers expiring' },
  { key: 'approvalsPending', label: 'Approvals waiting on you' },
];

const sectionHeaderStyle: CSSProperties = {
  fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--muted)', padding: '14px 20px 6px',
};

const rowStyle: CSSProperties = {
  display: 'flex', gap: 14, padding: '12px 20px', borderTop: '1px solid var(--hair)', alignItems: 'center',
};

const outlineActionStyle: CSSProperties = {
  border: '1px solid var(--hair)', background: 'var(--paper)', color: 'var(--ink)',
  borderRadius: 9, padding: '8px 15px', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function fmtTime(at: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));
}

function Row({ item, timeZone, primary }: { item: TodayItem; timeZone: string; primary: boolean }) {
  // Spread (not an inline attribute) so TS's excess-property check on the JSX literal doesn't
  // trip over a data-* prop Link's own type doesn't declare.
  const variantAttr = { 'data-variant': primary ? 'primary' : 'outline' };
  return (
    <div className="today-row" style={rowStyle}>
      <div
        style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--surface)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)',
          // Depth via a semi-transparent inset ring, not a solid border (emil-design-eng).
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ink) 8%, transparent)',
        }}
      >
        {initials(item.candidateName)}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{item.candidateName}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 1 }}>{item.subtitle}</div>
      </div>
      {item.at !== null && (
        <div className="v2-mono" style={{ fontSize: 13, color: 'var(--muted)', flexShrink: 0 }}>{fmtTime(item.at, timeZone)}</div>
      )}
      <Link
        href={item.actionHref}
        className={primary ? 'v2-cta v2-hoverbtn' : 'v2-hoverbtn'}
        style={primary ? undefined : outlineActionStyle}
        {...variantAttr}
      >
        {item.actionLabel}
      </Link>
    </div>
  );
}

export function NeedsYouCard({ needsYou, timeZone }: { needsYou: NeedsYou; timeZone: string }) {
  const nonEmpty = GROUPS.filter((g) => needsYou[g.key].length > 0);

  if (nonEmpty.length === 0) {
    return (
      <Card>
        <div style={{ padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Nothing needs you right now.</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>New work appears here as candidates move through your pipeline.</div>
        </div>
      </Card>
    );
  }

  let primaryAssigned = false;
  return (
    <Card>
      {nonEmpty.map((group) => {
        const items = needsYou[group.key];
        return (
          <div key={group.key}>
            <div style={sectionHeaderStyle}>{group.label} · {items.length}</div>
            {items.map((item) => {
              const isPrimary = !primaryAssigned;
              if (isPrimary) primaryAssigned = true;
              return <Row key={item.id} item={item} timeZone={timeZone} primary={isPrimary} />;
            })}
          </div>
        );
      })}
    </Card>
  );
}
