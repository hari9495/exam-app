'use client';

import { useState } from 'react';
import { BRAND } from '../../../lib/brand';
import { BRAND_CHAPTERS } from './content';
import { WorkfoxMark } from '../../../components/ui-v2';
import './brand.css';

const LIGHT_TOKENS: Array<[string, string]> = [
  ['paper', '#ffffff'], ['surface', '#f8fafc'], ['ink', '#0b1220'], ['muted', '#64748b'],
  ['hair', '#e2e8f0'], ['accent', '#3b5fe3'], ['danger', '#b91c1c'],
];
const DARK_TOKENS: Array<[string, string]> = [
  ['paper', '#0b1220'], ['surface', '#0b1220'], ['ink', '#f8fafc'], ['muted', '#94a3b8'],
  ['hair', '#1e293b'], ['accent', '#3b82f6'], ['danger', '#f87171'],
];
const STATUS: Array<[string, string]> = [['clear', '#15803d'], ['review', '#a16207'], ['flagged', '#b91c1c']];

function Swatch({ name, hex }: { name: string; hex: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
      <span className="wfx-swatch" style={{ background: hex }} />
      <span style={{ fontWeight: 600 }}>{name}</span>
      <span className="wfx-mono" style={{ color: 'var(--muted)' }}>{hex}</span>
    </div>
  );
}

export default function BrandPage() {
  const [pw, setPw] = useState('secret123');
  const [txt, setTxt] = useState('');
  const [show, setShow] = useState(false);

  return (
    <main className="wfx" style={{ minHeight: '100vh' }}>
     <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 24px 96px' }}>
      <p className="wfx-kicker"><WorkfoxMark size={14} /> {BRAND.productName} brand guidelines</p>
      <h1 className="wfx-title" style={{ fontSize: 'clamp(26px,4vw,34px)', margin: '6px 0 6px' }}>How {BRAND.productName} looks, speaks, and behaves</h1>
      <p className="wfx-muted" style={{ fontSize: 14, margin: '0 0 12px' }}>
        {BRAND.companyName} · living reference — rendered from the real Azure tokens. Product name status: {BRAND.productNameStatus}.
      </p>
      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '0 0 40px' }}>
        {BRAND_CHAPTERS.map((c, i) => (
          <a key={c.slug} href={`#${c.slug}`} className="wfx-link">{i + 1}. {c.title}</a>
        ))}
      </nav>

      {BRAND_CHAPTERS.map((c, i) => (
        <section key={c.slug} id={c.slug} style={{ margin: '0 0 44px' }}>
          <p className="wfx-kicker">{String(i + 1).padStart(2, '0')}</p>
          <h2 className="wfx-title" style={{ fontSize: 24, margin: '4px 0 8px' }}>{c.title}</h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: '70ch', margin: '0 0 14px' }}>{c.intro}</p>
          {c.sections.map((s) => (
            <div key={s.heading} style={{ margin: '0 0 16px' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>{s.heading}</h3>
              {s.body && <p style={{ fontSize: 13.5, color: 'var(--muted)', maxWidth: '70ch', margin: '0 0 8px' }}>{s.body}</p>}
              {s.rules && (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {s.rules.map((r) => <li key={r}>{r}</li>)}
                </ul>
              )}
              {s.pairs && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                  {s.pairs.map((p) => (
                    <div key={p.do} style={{ border: '1px solid var(--hair)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
                      <p style={{ margin: '0 0 6px' }}><span style={{ color: 'var(--success)', fontWeight: 700 }}>Do</span> — {p.do}</p>
                      <p style={{ margin: 0, color: 'var(--muted)' }}><span style={{ color: 'var(--danger)', fontWeight: 700 }}>Don't</span> — {p.dont}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {c.slug === 'color' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 10 }}>
              <div><h3 style={{ fontSize: 13, fontWeight: 700 }}>Light</h3><div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{LIGHT_TOKENS.map(([n, h]) => <Swatch key={n} name={n} hex={h} />)}</div></div>
              <div><h3 style={{ fontSize: 13, fontWeight: 700 }}>Dark</h3><div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{DARK_TOKENS.map(([n, h]) => <Swatch key={n} name={n} hex={h} />)}</div></div>
              <div><h3 style={{ fontSize: 13, fontWeight: 700 }}>Status</h3><div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{STATUS.map(([n, h]) => <Swatch key={n} name={n} hex={h} />)}</div></div>
            </div>
          )}

          {c.slug === 'logo' && (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-grid', placeItems: 'center', width: 44, height: 44, borderRadius: 10, background: 'var(--org-primary)', color: 'var(--org-on-primary)' }}><WorkfoxMark size={24} title={`${BRAND.productName} mark on accent`} /></span>
              <span style={{ display: 'inline-grid', placeItems: 'center', width: 44, height: 44, borderRadius: 10, border: '1px solid var(--hair)' }}><WorkfoxMark size={24} title={`${BRAND.productName} mark on paper`} /></span>
              <span style={{ fontFamily: 'var(--font-disp)', fontWeight: 600, fontSize: 24, letterSpacing: '-0.02em' }}>{BRAND.productName}</span>
              <span className="wfx-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>working mark · replace in WorkfoxMark.tsx</span>
            </div>
          )}

          {c.slug === 'components' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 380, marginTop: 10 }}>
              <div>
                <label className="wfx-label" htmlFor="bg-demo-text">Text field</label>
                <input id="bg-demo-text" className="wfx-field" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="maya@northwind.co" />
              </div>
              <div>
                <label className="wfx-label" htmlFor="bg-demo-pw">Password field</label>
                <div style={{ position: 'relative' }}>
                  <input id="bg-demo-pw" className="wfx-field" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} style={{ paddingRight: 40 }} />
                  <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide characters' : 'Show characters'}
                    style={{ position: 'absolute', right: 8, top: 8, height: 22, border: 0, background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <button className="wfx-btn">Primary action</button>
              <button className="wfx-btn sec">Secondary action</button>
              <div className="wfx-alert">That email or password isn't right.</div>
              <div className="wfx-card wfx-rail">
                Flagged candidate — <span className="wfx-mono">tab ×4</span>
              </div>
            </div>
          )}
        </section>
      ))}
     </div>
    </main>
  );
}
