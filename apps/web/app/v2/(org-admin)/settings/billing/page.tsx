'use client';

// v2 Billing (org-admin). Redesigned on the 21st.dev "API Usage Meter Card" pattern (#19006),
// retoned Azure: a plan hero + labelled usage meters (value + %, threshold-coloured track).
// Same useOrgUsage hook and data shape — no backend change.
import { useOrgUsage } from '../../../../../lib/hooks/useBilling';
import { STATUS } from '../../../../../components/ui-v2/viz';
import type { DimensionUsage } from '../../../../../lib/types';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '20px 22px' };

// Same thresholds as before: at/over limit = danger, >=80% = warn, else ok.
function meterColor(pct: number): string {
  if (pct >= 100) return STATUS.bad;
  if (pct >= 80) return STATUS.warn;
  return STATUS.ok;
}

function Meter({ label, used, limit }: { label: string } & DimensionUsage) {
  const pct = limit > 0 ? (used / limit) * 100 : used > 0 ? 100 : 0;
  const width = Math.min(100, pct);
  const over = used >= limit;
  const color = meterColor(pct);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: ink }}>{label}</span>
        <span style={{ fontSize: 12.5, color: muted, fontFamily: 'var(--font-mono)' }}>
          {used.toLocaleString()} / {limit.toLocaleString()}
          {over && <span aria-label="over limit" style={{ marginLeft: 5, color: STATUS.bad }}>⚠</span>}
        </span>
      </div>
      <div style={{ marginTop: 7, position: 'relative', height: 8, width: '100%', overflow: 'hidden', borderRadius: 99, background: 'color-mix(in srgb, var(--ink) 8%, transparent)' }}>
        <div style={{ height: '100%', borderRadius: 99, background: color, width: `${width}%`, transition: 'width .3s ease' }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: muted }}>{Math.round(pct)}% used</div>
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
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Billing</h1>
        <p style={{ fontSize: 13, color: muted, margin: '4px 0 0' }}>Your current plan and how much of it you have used this cycle.</p>
      </div>

      {!usage ? (
        <div style={card} aria-busy="true"><p style={{ fontSize: 13, color: muted, margin: 0 }}>Loading…</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Plan hero */}
          <div style={{ ...card, background: 'color-mix(in srgb, var(--org-primary) 6%, var(--paper))', borderColor: 'color-mix(in srgb, var(--org-primary) 22%, var(--hair))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: muted, margin: 0 }}>Current plan</p>
              <p style={{ fontFamily: 'var(--font-disp)', fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em', color: ink, margin: '4px 0 0', textTransform: 'capitalize' }}>{usage.planName}</p>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--org-primary)', background: 'color-mix(in srgb, var(--org-primary) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--org-primary) 25%, transparent)', borderRadius: 99, padding: '5px 12px' }}>
              Resets {nextResetDate(usage.periodStart).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>

          {/* Usage meters */}
          <div style={card}>
            <h2 style={{ fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: '0 0 16px' }}>This cycle&apos;s usage</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px 28px' }}>
              <Meter label="Seats" used={usage.seats.used} limit={usage.seats.limit} />
              <Meter label="Candidates" used={usage.candidates.used} limit={usage.candidates.limit} />
              <Meter label="AI credits" used={usage.aiCredits.used} limit={usage.aiCredits.limit} />
              <Meter label="Proctoring minutes" used={usage.proctoringMinutes.used} limit={usage.proctoringMinutes.limit} />
            </div>
            <p style={{ fontSize: 12.5, color: muted, margin: '18px 0 0', borderTop: '1px solid var(--hair)', paddingTop: 14 }}>Need a different plan? Contact us.</p>
          </div>
        </div>
      )}
    </div>
  );
}
