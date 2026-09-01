'use client';

// Adapted from 21st.dev "Stats Card" (ravikatiyar162): title + big value + icon + color-coded
// change. Recomposed icon-led — a tinted icon badge leads the tile — and retoned to Azure tokens.
import { Card } from './Card';

export function IconStatCard({
  title, value, icon, change, changeType = 'positive', caption = 'vs last month', accent = 'var(--org-primary)',
}: {
  title: string; value: string | number; icon: React.ReactNode; change?: string;
  changeType?: 'positive' | 'negative' | 'neutral'; caption?: string; accent?: string;
}) {
  const changeColor = changeType === 'positive' ? 'var(--success)' : changeType === 'negative' ? 'var(--danger)' : 'var(--muted)';
  return (
    <Card style={{ padding: 16, background: `color-mix(in srgb, ${accent} 5%, var(--surface))`, borderColor: `color-mix(in srgb, ${accent} 18%, var(--hair))` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 13, flexShrink: 0, display: 'grid', placeItems: 'center',
          background: `color-mix(in srgb, ${accent} 14%, var(--surface))`, color: accent,
        }}>
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--muted)' }}>{title}</div>
          <div style={{ fontFamily: 'var(--font-disp)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          {change != null && (
            <div style={{ fontSize: 11.5, marginTop: 2 }}>
              <span style={{ color: changeColor, fontWeight: 600 }}>{change}</span>{' '}
              <span style={{ color: 'var(--muted)' }}>{caption}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
