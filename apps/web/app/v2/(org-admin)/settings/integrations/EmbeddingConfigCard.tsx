'use client';

// Generic bring-your-own embeddings provider (OpenAI-compatible /embeddings) that powers semantic
// candidate search + find-similar. Decoupled from the chat AI key above. Workfox Azure tokens only.
import { useState } from 'react';
// Deep imports (not the ui-v2 barrel): the barrel re-exports DataTable, which pulls @tanstack/react-table
// (ESM-only) and breaks this component's jest test -- same note as settings/permission-profiles/page.tsx.
import { Button } from '../../../../../components/ui-v2/Button';
import { TextField } from '../../../../../components/ui-v2/TextField';
import { PasswordField } from '../../../../../components/ui-v2/PasswordField';
import { useToast } from '../../../../../components/ui';
import { useIntegrations, useUpdateEmbeddingConfig, useBackfillEmbeddings } from '../../../../../lib/hooks/useIntegrations';

const ink = 'var(--ink)';
// Canonical secondary button (matches DataTable's dt.toolBtn; inlined to avoid importing dt from DataTable).
const toolBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(11,18,32,.08)' };
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const sectionTitle: React.CSSProperties = { fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: 0 };
const desc: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', margin: '6px 0 0', lineHeight: 1.5 };
const errorText: React.CSSProperties = { fontSize: 12.5, color: 'var(--danger)' };

export function EmbeddingConfigCard() {
  const { data: integrations } = useIntegrations();
  const update = useUpdateEmbeddingConfig();
  const backfill = useBackfillEmbeddings();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const configured = integrations?.embeddingConfigured;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!baseUrl.trim() || !model.trim() || !apiKey.trim()) { setError('Endpoint, model and API key are all required.'); return; }
    setError(null);
    update.mutate(
      { baseUrl: baseUrl.trim(), model: model.trim(), apiKey: apiKey.trim() },
      {
        onSuccess: () => { toast('Embeddings provider saved.'); setEditing(false); setApiKey(''); },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save.'),
      },
    );
  }

  return (
    <section style={card}>
      <h2 style={sectionTitle}>Semantic search (embeddings)</h2>
      <p style={desc}>
        {configured
          ? `Configured — ${integrations?.embeddingModel} via ${integrations?.embeddingBaseUrl}. Candidate search and “find similar” are active.`
          : 'Not configured — semantic candidate search is off. Point this at any OpenAI-compatible embeddings endpoint (OpenAI, Azure OpenAI, Voyage, a local model…).'}
      </p>
      <div style={{ marginTop: 14 }}>
        {configured && !editing ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="v2-hoverbtn" style={toolBtn} onClick={() => setEditing(true)}>Replace configuration</button>
            <button
              type="button" className="v2-hoverbtn" style={toolBtn}
              onClick={() => backfill.mutate(undefined, {
                onSuccess: (r) => toast(`Queued embeddings for ${r.queued} candidate${r.queued === 1 ? '' : 's'}.`),
                onError: (err) => toast(err instanceof Error ? err.message : 'Backfill failed.', 'error'),
              })}
              disabled={backfill.isPending}
            >
              {backfill.isPending ? 'Queuing…' : 'Backfill existing candidates'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <TextField id="emb-base-url" label="Embeddings endpoint (base URL)" value={baseUrl} onChange={setBaseUrl} required autoComplete="off" />
            <TextField id="emb-model" label="Embedding model" value={model} onChange={setModel} required autoComplete="off" />
            <PasswordField id="emb-api-key" label="API key" value={apiKey} onChange={setApiKey} required />
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" loading={update.isPending}>{configured ? 'Replace configuration' : 'Save & verify'}</Button>
              {configured && <button type="button" className="v2-hoverbtn" style={toolBtn} onClick={() => { setEditing(false); setError(null); setApiKey(''); }}>Cancel</button>}
            </div>
          </form>
        )}
        {error && <p role="alert" style={{ ...errorText, marginTop: 10 }}>{error}</p>}
      </div>
    </section>
  );
}
