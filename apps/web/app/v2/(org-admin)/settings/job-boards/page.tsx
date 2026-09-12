'use client';

// v2 Settings -> Job Boards. Org-admin CRUD for named job boards (Multi-Board Job Publishing,
// Zoho #23): each board has a stable public feed URL that recruiters point external job boards
// at, and a per-job selector (job edit page) decides which boards a given job's postings feed
// into. Layout/gate conventions mirror settings/sender-addresses/page.tsx (title+description
// header, card list, inline dialog for create, inline rename-on-blur, org-primary tokens).
// Imports Button/TextField/Dialog directly from their files rather than the ui-v2 barrel -- the
// barrel re-exports DataTable, which pulls in @tanstack/react-table (ESM-only) and breaks under
// jest; this page doesn't need a DataTable anyway.
import { useEffect, useState } from 'react';
import { Plus, Trash2, Check, Copy, Settings2 } from 'lucide-react';
import { useAuth } from '../../../../../lib/auth-context';
import {
  useJobBoards, useCreateJobBoard, useUpdateJobBoard, useDeleteJobBoard,
  useJobBoardProviders, useJobBoardConfig, useSaveJobBoardConfig,
} from '../../../../../lib/hooks/useJobBoards';
import type { JobBoard } from '../../../../../lib/types';
import { Button } from '../../../../../components/ui-v2/Button';
import { TextField } from '../../../../../components/ui-v2/TextField';
import { Dialog } from '../../../../../components/ui-v2/Dialog';

// Free default + the paid push providers. Labels are shown in the provider selector; the paid
// providers' config fields come from the API (useJobBoardProviders).
const PROVIDER_LABELS: Record<string, string> = { xml_feed: 'Free XML feed', linkedin: 'LinkedIn', indeed: 'Indeed', http: 'Generic HTTP' };

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '16px 20px', marginBottom: 12, boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const dangerIconBtn: React.CSSProperties = { display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid color-mix(in srgb, var(--danger) 35%, var(--hair))', background: 'var(--paper)', color: 'var(--danger)', cursor: 'pointer' };
// Canonical secondary button (values match components/ui-v2/DataTable.tsx's `dt.toolBtn` exactly).
// Not imported directly: `dt` is defined in DataTable.tsx, which pulls in @tanstack/react-table
// (ESM-only) at module scope, so even a deep import of just `dt` would execute that import and
// break under jest -- see this file's top-of-file note on avoiding the ui-v2 barrel.
const secondaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(11,18,32,.08)' };
const monoInput: React.CSSProperties = { minWidth: 0, flex: 1, borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', padding: '7px 11px', fontSize: 12, color: 'var(--ink)' };

type Notice = { type: 'success' | 'error'; text: string } | null;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function NewBoardDialog({ onClose, notify }: { onClose: () => void; notify: (type: 'success' | 'error', text: string) => void }) {
  const create = useCreateJobBoard();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setError(null);
    create.mutate(name.trim(), {
      onSuccess: () => { notify('success', 'Job board created.'); onClose(); },
      onError: (err) => setError(errorMessage(err, 'Failed to create job board.')),
    });
  }

  return (
    <Dialog open onClose={onClose} title="New job board" width={420}>
      <form onSubmit={handleSave}>
        <TextField id="board-name" label="Name" value={name} onChange={setName} required autoComplete="off" />
        {error && <p role="alert" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onClose} className="v2-hoverbtn" style={secondaryBtn}>Cancel</button>
          <Button type="submit" loading={create.isPending}>Create</Button>
        </div>
      </form>
    </Dialog>
  );
}

// Configure which provider a board posts through, and its (encrypted) API credentials. Secret
// fields render blank when already configured and are only re-sent when the admin types a new value
// (blank-on-PUT merge server-side) -- so an unchanged secret is never round-tripped to the browser.
function BoardConfigDialog({ board, onClose, notify }: { board: JobBoard; onClose: () => void; notify: (type: 'success' | 'error', text: string) => void }) {
  const { data: providers } = useJobBoardProviders();
  const { data: current } = useJobBoardConfig(board.id);
  const save = useSaveJobBoardConfig();
  const [provider, setProvider] = useState(board.provider);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Seed non-secret fields from the loaded config once it arrives (secrets stay blank).
  useEffect(() => {
    if (current && current.provider === board.provider) {
      const seed: Record<string, string> = {};
      for (const [k, v] of Object.entries(current.config)) if (typeof v === 'string') seed[k] = v;
      setValues(seed);
    }
  }, [current, board.provider]);

  const meta = providers?.find((p) => p.id === provider);
  const alreadyConfigured = current?.provider === provider && current?.configured;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // For a paid provider, send only the fields the admin actually filled (blank secrets are kept
    // server-side). xml_feed sends no config.
    const config = provider === 'xml_feed' ? undefined : Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ''));
    save.mutate(
      { id: board.id, provider, config },
      {
        onSuccess: () => { notify('success', 'Posting settings saved.'); onClose(); },
        onError: (err) => setError(errorMessage(err, 'Failed to save posting settings.')),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title={`Posting — ${board.name}`} width={460}>
      <form onSubmit={handleSave}>
        <label htmlFor={`prov-${board.id}`} className="v2-label">Post jobs via</label>
        <select
          id={`prov-${board.id}`}
          value={provider}
          onChange={(e) => { setProvider(e.target.value); setValues({}); }}
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', marginBottom: 6 }}
        >
          {['xml_feed', 'linkedin', 'indeed', 'http'].map((id) => <option key={id} value={id}>{PROVIDER_LABELS[id] ?? id}</option>)}
        </select>
        <p style={{ ...desc, marginTop: 0, marginBottom: 12 }}>
          {provider === 'xml_feed'
            ? 'Jobs are exposed on this board’s public feed link for the board to pull.'
            : 'Jobs are pushed to this provider’s API when they go live, and retracted when closed.'}
        </p>

        {provider !== 'xml_feed' && meta?.configFields.map((f) => (
          <div key={f.key} style={{ marginBottom: 10 }}>
            <label htmlFor={`cfg-${board.id}-${f.key}`} className="v2-label">{f.label}{f.required ? '' : ' (optional)'}</label>
            <input
              id={`cfg-${board.id}-${f.key}`}
              type={f.secret ? 'password' : 'text'}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.secret && alreadyConfigured ? '•••••• (leave blank to keep current)' : f.placeholder}
              autoComplete="off"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)' }}
            />
          </div>
        ))}

        {error && <p role="alert" style={{ marginTop: 8, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onClose} className="v2-hoverbtn" style={secondaryBtn}>Cancel</button>
          <Button type="submit" loading={save.isPending}>Save</Button>
        </div>
      </form>
    </Dialog>
  );
}

function BoardRow({ board, notify }: { board: JobBoard; notify: (type: 'success' | 'error', text: string) => void }) {
  const update = useUpdateJobBoard();
  const del = useDeleteJobBoard();
  const [name, setName] = useState(board.name);
  const [copied, setCopied] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const isPaid = board.provider !== 'xml_feed';

  function handleNameBlur() {
    if (!name.trim() || name === board.name) return;
    update.mutate(
      { id: board.id, name: name.trim() },
      { onError: (err) => { notify('error', errorMessage(err, 'Failed to update job board.')); setName(board.name); } },
    );
  }

  function handleDelete() {
    del.mutate(board.id, {
      onSuccess: () => notify('success', `${board.name} deleted.`),
      onError: (err) => notify('error', errorMessage(err, 'Failed to delete job board.')),
    });
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(board.feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify('error', 'Failed to copy link.');
    }
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ minWidth: 180, flex: '1 1 180px' }} onBlur={handleNameBlur}>
          <TextField id={`board-name-${board.id}`} label="Name" value={name} onChange={setName} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <span style={{ fontSize: 12.5, color: muted }}>{board.publishedJobCount} published</span>
          <button type="button" style={dangerIconBtn} onClick={handleDelete} aria-label={`Delete ${board.name}`}><Trash2 size={15} /></button>
        </div>
      </div>

      {/* Posting method: free feed vs paid push provider, with a configure control. */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <span style={{ fontSize: 12.5, color: muted }}>Posting via</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{PROVIDER_LABELS[board.provider] ?? board.provider}</span>
        {isPaid && (
          <span style={{ fontSize: 11.5, fontWeight: 600, borderRadius: 99, padding: '2px 9px', background: board.configured ? 'color-mix(in srgb, #15803d 14%, transparent)' : 'color-mix(in srgb, var(--danger) 12%, transparent)', color: board.configured ? '#15803d' : 'var(--danger)' }}>
            {board.configured ? 'Configured' : 'Needs credentials'}
          </span>
        )}
        <button type="button" onClick={() => setConfiguring(true)} className="v2-hoverbtn" style={{ ...secondaryBtn, marginLeft: 'auto', padding: '7px 12px' }} aria-label={`Configure posting for ${board.name}`}>
          <Settings2 size={14} /> Configure
        </button>
      </div>

      {/* The public feed link is the pull mechanism for the free XML-feed provider only. */}
      {!isPaid && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <input readOnly value={board.feedUrl} aria-label={`${board.name} feed url`} onFocus={(e) => e.target.select()} className="v2-mono" style={monoInput} />
          <button type="button" onClick={handleCopy} className="v2-hoverbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--hair)', background: 'var(--paper)', color: 'var(--ink)', cursor: 'pointer', whiteSpace: 'nowrap' }} aria-label={`Copy ${board.name} feed link`}>
            {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}

      {configuring && <BoardConfigDialog board={board} onClose={() => setConfiguring(false)} notify={notify} />}
    </div>
  );
}

export default function V2JobBoardsSettingsPage() {
  const { role, actingSuperAdmin } = useAuth();
  const canConfigure = role === 'org_admin' || actingSuperAdmin;
  const { data: boards, isLoading, isError } = useJobBoards();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  if (!canConfigure) return <p style={{ fontSize: 13, color: muted }}>You don&apos;t have access to this page.</p>;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Job Boards</h1>
          <p style={{ ...desc, marginTop: 6 }}>
            Each board has its own public feed link. Point an external job board at that link, then
            pick which boards a job publishes to from the job&apos;s edit page.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus size={15} /> Add board</Button>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading job boards…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load job boards.</p>}
      {!isLoading && !isError && (!boards || boards.length === 0) && <p style={{ fontSize: 13, color: muted }}>No job boards yet — add one to get started.</p>}

      {boards && boards.map((b) => <BoardRow key={b.id} board={b} notify={notify} />)}

      {creating && <NewBoardDialog onClose={() => setCreating(false)} notify={notify} />}
    </div>
  );
}
