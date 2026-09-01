// Adapted from 21st.dev "Gauge" (shugar/gauge-1) — SVG arc via strokeDasharray. Simplified to a
// single value arc + track + centered readout; concrete colors (SVG stroke won't resolve CSS vars).
export function Gauge({
  value, size = 132, label, color = '#3b5fe3', track = '#e2e8f0',
}: { value: number; size?: number; label?: string; color?: string; track?: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(100, value)) / 100 * c;
  return (
    <div style={{ position: 'relative', width: size, height: size }} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r={r} stroke={track} strokeWidth={10} />
        <circle cx="50" cy="50" r={r} stroke={color} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`} transform="rotate(-90 50 50)" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-disp)', fontWeight: 700, fontSize: size * 0.24, letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1 }}>{value}%</div>
          {label && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{label}</div>}
        </div>
      </div>
    </div>
  );
}
