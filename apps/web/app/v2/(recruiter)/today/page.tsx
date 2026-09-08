'use client';

// Workfox "Today" home -- the recruiter's personal worklist (people-first, one focal point) plus
// a demoted rail: things worth a glance and a quiet week strip. See apps/web/AGENTS.md's design
// voice block and docs/brand/workfox-ui-review-checklist.md's Information design chapter.
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useToday } from '../../../../lib/hooks/useToday';
import { useCurrentUser } from '../../../../lib/hooks/useCurrentUser';
import { TodayResponse } from '../../../../lib/types';
import { Card } from '../../../../components/ui-v2/Card';
import { NeedsYouCard } from './NeedsYouCard';

const sectionHeaderStyle: CSSProperties = {
  fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--muted)', padding: '14px 20px 6px',
};
const railRowStyle: CSSProperties = {
  display: 'flex', gap: 14, padding: '12px 20px', borderTop: '1px solid var(--hair)',
  alignItems: 'center', justifyContent: 'space-between',
};
const outlineActionStyle: CSSProperties = {
  border: '1px solid var(--hair)', background: 'var(--paper)', color: 'var(--ink)',
  borderRadius: 9, padding: '8px 15px', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
};
const countHighlightStyle: CSSProperties = {
  boxShadow: 'inset 0 -0.38em 0 color-mix(in srgb, var(--org-primary) 28%, transparent)',
};

function greetingPeriod(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function firstName(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first || 'there';
}

function WorthALookCard({ watch }: { watch: TodayResponse['watch'] }) {
  const rows: { key: string; text: string; actionLabel: string; href: string }[] = [];
  if (watch.staleInvitations > 0) {
    rows.push({ key: 'stale', text: `${watch.staleInvitations} invitations unopened for 5+ days`, actionLabel: 'Resend', href: '/v2/candidates' });
  }
  if (watch.proctoringFlags > 0) {
    rows.push({ key: 'flags', text: `${watch.proctoringFlags} proctoring flags waiting for your review`, actionLabel: 'Review', href: '/v2/reports' });
  }
  if (watch.nextDrive) {
    const drive = watch.nextDrive;
    const when = new Intl.DateTimeFormat(undefined, { weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(drive.startsAt));
    rows.push({ key: 'drive', text: `Walk-in drive ${when} · ${drive.registered} registered`, actionLabel: 'Prepare', href: '/v2/drives' });
  }
  if (rows.length === 0) return null;

  return (
    <Card>
      <div style={sectionHeaderStyle}>Worth a look</div>
      {rows.map((row) => (
        <div key={row.key} style={railRowStyle}>
          <span style={{ fontSize: 13, color: 'var(--ink)' }}>{row.text}</span>
          <Link href={row.href} className="v2-hoverbtn" style={outlineActionStyle} {...{ 'data-variant': 'outline' }}>{row.actionLabel}</Link>
        </div>
      ))}
    </Card>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-disp)', fontWeight: 600, fontSize: 24, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ThisWeekCard({ week }: { week: TodayResponse['week'] }) {
  return (
    <Card>
      <div style={sectionHeaderStyle}>This week</div>
      <div style={{ display: 'flex', gap: 24, padding: '10px 20px 16px' }}>
        <Stat value={week.newApplicants} label="new applicants" />
        <Stat value={week.invited} label="invited to assess" />
        <Stat value={week.awaitingGrading} label="awaiting grading" />
      </div>
      {week.passRate !== null && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, margin: 0, padding: '0 20px 16px' }}>
          Pass rate is holding at {week.passRate}%. The full picture lives in Reports.
        </p>
      )}
    </Card>
  );
}

export default function V2TodayPage() {
  const { data: today, isLoading, isError } = useToday();
  const { data: user } = useCurrentUser();

  if (isLoading && !today) {
    return <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>;
  }
  if (isError || !today) {
    return <p role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>Couldn&apos;t load today. Try again.</p>;
  }

  const period = greetingPeriod(new Date().getHours());
  const name = firstName(user?.name);
  const kicker = new Intl.DateTimeFormat(undefined, { timeZone: today.today.timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(today.today.iso));
  const total = today.needsYou.total;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 6 }}>{kicker}</div>
          <h1 className="v2-title" style={{ fontSize: 34, margin: 0 }}>Good {period}, {name}.</h1>
          <p className="v2-title" style={{ fontSize: 34, margin: '2px 0 0' }}>
            {total === 0 ? (
              'Nothing needs you right now.'
            ) : (
              <>
                <span style={countHighlightStyle}>{total === 1 ? 'One' : total}</span>{' '}
                {total === 1 ? 'thing needs' : 'things need'} you today.
              </>
            )}
          </p>
        </div>
        <Link href="/v2/reports" className="v2-link">Full reports</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        <NeedsYouCard needsYou={today.needsYou} timeZone={today.today.timeZone} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <WorthALookCard watch={today.watch} />
          <ThisWeekCard week={today.week} />
        </div>
      </div>
    </div>
  );
}
