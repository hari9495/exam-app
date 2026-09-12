'use client';

// External Easy Apply (Indeed / LinkedIn) ingestion config. Per provider: a shared secret the board
// must send back, and the ingestion URL to give the board. Inert until a secret is set. v2 tokens
// (Workfox Azure). Mirrors the SSO settings page's shape.
import { useState } from 'react';
import { Rss } from 'lucide-react';
import { useEasyApplyConfig, usePutEasyApplyConfig, EasyApplyProviderStatus } from '../../../../../lib/hooks/useEasyApply';
import { Button } from '../../../../../components/ui-v2/Button';
import { STATUS } from '../../../../../components/ui-v2/viz';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '16px 20px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const sectionTitle: React.CSSProperties = { fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: 0 };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: ink, outline: 'none' };

function ProviderCard({ provider }: { provider: EasyApplyProviderStatus }) {
  const put = usePutEasyApplyConfig();
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    put.mutate(
      { provider: provider.id, secret: secret || undefined },
      { onSuccess: () => setSecret(''), onError: (e) => setError(e instanceof Error ? e.message : 'Could not save') },
    );
  }
  function disable() {
    setError(null);
    put.mutate({ provider: provider.id, enabled: false }, { onError: (e) => setError(e instanceof Error ? e.message : 'Could not disable') });
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 11, background: provider.configured ? 'color-mix(in srgb, var(--org-primary) 14%, transparent)' : 'color-mix(in srgb, var(--ink) 6%, transparent)', color: provider.configured ? 'var(--org-primary)' : muted, flexShrink: 0 }}>
          <Rss size={20} />
        </span>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={sectionTitle}>{provider.label}</h2>
            <span style={{ fontSize: 11.5, fontWeight: 600, borderRadius: 99, padding: '2px 10px', background: provider.configured ? `color-mix(in srgb, ${STATUS.ok} 14%, transparent)` : 'color-mix(in srgb, var(--ink) 8%, transparent)', color: provider.configured ? STATUS.ok : muted }}>
              {provider.configured ? 'Configured' : 'Not configured'}
            </span>
          </div>
          <p style={desc}>Ingestion is inert until a shared secret is set.</p>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label htmlFor={`ingest-${provider.id}`} className="v2-label">Ingestion URL (give this to {provider.label})</label>
        <div id={`ingest-${provider.id}`} style={{ borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--hair)', padding: 10, marginTop: 4, wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: 12, color: ink }}>
          {provider.ingestUrl}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label htmlFor={`secret-${provider.id}`} className="v2-label">Shared secret {provider.configured ? '(leave blank to keep the current one)' : ''}</label>
        <input
          id={`secret-${provider.id}`}
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={provider.configured ? '••••••••' : 'A secret the board sends in X-EasyApply-Secret'}
          style={{ ...inputStyle, marginTop: 4 }}
        />
      </div>

      {error && <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger)', margin: '10px 0 0' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <Button onClick={save} loading={put.isPending} disabled={!provider.configured && !secret.trim()}>
          {provider.configured ? 'Update secret' : 'Enable'}
        </Button>
        {provider.configured && (
          <button type="button" className="v2-hoverbtn" onClick={disable} disabled={put.isPending} style={{ fontSize: 13, fontWeight: 500, padding: '9px 16px', borderRadius: 9, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: ink, cursor: 'pointer' }}>
            Disable
          </button>
        )}
      </div>
    </section>
  );
}

export default function V2EasyApplySettingsPage() {
  const { data } = useEasyApplyConfig();

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Easy Apply</h1>
        <p style={{ ...desc, marginTop: 6 }}>
          Let candidates apply from Indeed or LinkedIn. Configure the shared secret the board sends, then give it the
          ingestion URL. Applications land in your pipeline exactly like a direct application.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {data?.providers.map((p) => (
          <ProviderCard key={p.id} provider={p} />
        ))}
      </div>
    </div>
  );
}
