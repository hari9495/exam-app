'use client';

// Adapted from 21st.dev "stats-cards-with-links" (ephraimduncan): muted label + colored change%
// on top, big value, and a gradient area trend. Retoned to Azure tokens; change uses success/danger.
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Card } from './Card';

export function StatCard({
  label, value, deltaPct, deltaLabel, series,
}: {
  label: string; value: string | number; deltaPct?: number | null; deltaLabel?: string;
  series?: { value: number }[];
}) {
  const positive = (deltaPct ?? 0) >= 0;
  const gid = `sc-${label.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Card style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 500 }}>{label}</span>
        {deltaPct != null && (
          <span style={{ fontSize: 12.5, fontWeight: 600, color: positive ? 'var(--success)' : 'var(--danger)' }}>
            {positive ? '+' : ''}{deltaPct}%{deltaLabel ? ` ${deltaLabel}` : ''}
          </span>
        )}
      </div>
      <div style={{ fontFamily: 'var(--font-disp)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
        {value}
      </div>
      {series && series.length > 1 && (
        <div style={{ height: 44, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={1.8} fill={`url(#${gid})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
