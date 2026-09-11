'use client';

// API usage card (Zoho #25 T6) -- shown below the Public API key section, only when an API key is
// configured (parent page gates that). Deliberately does NOT import DataTable or `dt` from
// components/ui-v2/DataTable.tsx: that file pulls in @tanstack/react-table, which is ESM-only and
// breaks jest (see the same note on app/v2/(org-admin)/settings/pipelines/page.test.tsx). A plain
// <table> and three duplicated style constants are cheaper than dragging that dependency into this
// card and its test. Same reasoning for the daily chart: plain divs (as the existing "Hiring
// funnel" bars in components/ui-v2/dashboard/AnalyticsTiles.tsx already do), no recharts import.
import { useState } from 'react';
import { useApiUsage } from '../../../../../lib/hooks/useApiUsage';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px' };
const sectionTitle: React.CSSProperties = { fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: 0 };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const subhead: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: muted, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' };
const toolBtn: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '7px 12px', borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer' };
const toolBtnActive: React.CSSProperties = { ...toolBtn, background: 'var(--org-primary)', color: 'var(--org-on-primary)' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: muted };
const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13, color: ink };

export function ApiUsageCard() {
  const [windowDays, setWindowDays] = useState<30 | 90>(30);
  const { data, isLoading } = useApiUsage(windowDays);

  const totals = data?.totals ?? { requests: 0, throttled: 0 };
  const isEmpty = !isLoading && totals.requests === 0 && totals.throttled === 0;
  const byDay = data?.byDay ?? [];
  const byEndpoint = data?.byEndpoint ?? [];
  const maxDay = Math.max(1, ...byDay.map((d) => d.requests));

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={sectionTitle}>API usage</h2>
          <p style={desc}>Requests made against your public API key.</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="Time window">
          <button type="button" style={windowDays === 30 ? toolBtnActive : toolBtn} aria-pressed={windowDays === 30} onClick={() => setWindowDays(30)}>30 days</button>
          <button type="button" style={windowDays === 90 ? toolBtnActive : toolBtn} aria-pressed={windowDays === 90} onClick={() => setWindowDays(90)}>90 days</button>
        </div>
      </div>

      {isEmpty ? (
        <p style={{ ...desc, marginTop: 14 }}>No API usage recorded yet.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 28, marginTop: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-disp)', fontSize: 22, fontWeight: 700, color: ink }}>{totals.requests.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: muted }}>Requests</div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-disp)', fontSize: 22, fontWeight: 700, color: ink }}>{totals.throttled.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: muted }}>Throttled</div>
            </div>
          </div>

          {byDay.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3 style={subhead}>Daily requests</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 56 }}>
                {byDay.map((d) => (
                  <div
                    key={d.day}
                    title={`${d.day}: ${d.requests} requests, ${d.throttled} throttled`}
                    style={{ flex: 1, height: `${Math.max(4, Math.round((d.requests / maxDay) * 100))}%`, background: 'var(--org-primary)', borderRadius: 2, minWidth: 2 }}
                  />
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 20, overflowX: 'auto' }}>
            <h3 style={subhead}>By endpoint</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--hair)' }}>
                  <th style={th}>Endpoint</th>
                  <th style={th}>Requests</th>
                  <th style={th}>Throttled</th>
                </tr>
              </thead>
              <tbody>
                {byEndpoint.map((row) => (
                  <tr key={row.endpoint} style={{ borderBottom: '1px solid var(--hair)' }}>
                    <td style={td}>{row.endpoint}</td>
                    <td style={td}>{row.requests.toLocaleString()}</td>
                    <td style={td}>{row.throttled.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
