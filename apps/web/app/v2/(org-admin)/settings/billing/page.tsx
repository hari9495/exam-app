'use client';

// v2 Billing (org-admin). Format-only re-skin of the old (org-admin)/settings/billing page on v2
// primitives + viz tokens; same useOrgUsage hook and data shape, no backend change.
import { useOrgUsage } from '../../../../../lib/hooks/useBilling';
import { STATUS } from '../../../../../components/ui-v2/viz';
import type { DimensionUsage } from '../../../../../lib/types';

const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '20px 22px' };
const muted = 'var(--muted)';
const ink = 'var(--ink)';

// Same thresholds as the old page: at/over limit = danger, >=80% = warn, else ok.
function barColor(used: number, limit: number): string {
  const pct = limit > 0 ? (used / limit) * 100 : used > 0 ? 100 : 0;
  if (pct >= 100) return STATUS.bad;
  if (pct >= 80) return STATUS.warn;
  return STATUS.ok;
}

function UsageBar({ label, used, limit }: { label: string } & DimensionUsage) {
  const pct = limit > 0 ? (used / limit) * 100 : used > 0 ? 100 : 0;
  const width = Math.min(100, pct);
  const over = used >= limit;
  const color = barColor(used, limit);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ fontWeight: 500, color: ink }}>{label}</span>
        <span style={{ color: muted }}>
          {used} / {limit}
          {over && <span aria-label="over limit" style={{ marginLeft: 4, color: STATUS.bad }}>⚠</span>}
        </span>
      </div>
      <div style={{ marginTop: 6, height: 8, width: '100%', overflow: 'hidden', borderRadius: 99, background: 'color-mix(in srgb, var(--ink) 8%, transparent)' }}>
        <div style={{ height: '100%', borderRadius: 99, background: color, width: `${width}%` }} />
      </div>
    </div>
  );
}

// Usage resets on a calendar-month cycle: the first of the month after periodStart.
function nextResetDate(periodStart: string): Date {
  const start = new Date(periodStart);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

export default function V2BillingPage() {
  const { data: usage } = useOrgUsage();

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Billing</h1>
        <p style={{ fontSize: 13, color: muted, margin: '4px 0 0' }}>Your current plan and how much of it you have used this cycle.</p>
      </div>

      {!usage ? (
        <div style={card} aria-busy="true">
          <p style={{ fontSize: 13, color: muted, margin: 0 }}>Loading…</p>
        </div>
      ) : (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: muted, margin: 0 }}>Current plan</p>
            <p style={{ fontFamily: 'var(--font-disp)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', color: ink, margin: '4px 0 0', textTransform: 'capitalize' }}>{usage.planName}</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, borderTop: '1px solid var(--hair)', paddingTop: 20 }}>
            <UsageBar label="Seats" used={usage.seats.used} limit={usage.seats.limit} />
            <UsageBar label="Candidates" used={usage.candidates.used} limit={usage.candidates.limit} />
            <UsageBar label="AI credits" used={usage.aiCredits.used} limit={usage.aiCredits.limit} />
            <UsageBar label="Proctoring minutes" used={usage.proctoringMinutes.used} limit={usage.proctoringMinutes.limit} />
          </div>

          <p style={{ fontSize: 13, color: muted, margin: 0, borderTop: '1px solid var(--hair)', paddingTop: 16 }}>
            Usage resets on {nextResetDate(usage.periodStart).toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })}. Need a different plan? Contact us.
          </p>
        </div>
      )}
    </div>
  );
}
