'use client';

// v2 Settings -> Agencies. Org-admin CRUD for external recruiting agencies that submit
// candidates through a token-scoped public portal (/agency/[token]) against a per-agency
// job allowlist. Layout/gate conventions mirror settings/sender-addresses & settings/user-groups
// (title+description header, card list, inline dialog for create, org-primary tokens, inline
// success/error notice). Imports Button/TextField/Dialog directly from their files rather than
// the ui-v2 barrel -- the barrel re-exports DataTable, which pulls in @tanstack/react-table
// (ESM-only) and breaks under jest; this page doesn't need a DataTable anyway.
//
// GET /agencies returns each agency's actual jobIds allowlist alongside assignedJobCount, so the
// "Assigned jobs" dialog pre-checks the agency's current jobs before Save sends its full
// replacement set -- otherwise saving with nothing (re-)checked would wipe the allowlist.
// Renaming/toggling active/etc. never touch jobIds (each mutation only sends the fields it
// changed), so those actions never risk wiping an existing allowlist -- only an explicit
// "Assigned jobs" -> Save can change it.
import { useState } from 'react';
import { Plus, Trash2, Copy } from 'lucide-react';
import { useAuth } from '../../../../../lib/auth-context';
import { useJobs } from '../../../../../lib/hooks/usePipeline';
import {
  useAgencies, useCreateAgency, useUpdateAgency, useDeleteAgency, useRegenerateAgencyToken,
} from '../../../../../lib/hooks/useAgencies';
import type { Agency } from '../../../../../lib/types';
import { Button } from '../../../../../components/ui-v2/Button';
import { TextField } from '../../../../../components/ui-v2/TextField';
import { Dialog } from '../../../../../components/ui-v2/Dialog';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '16px 20px', marginBottom: 12 };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const dangerIconBtn: React.CSSProperties = { display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid color-mix(in srgb, var(--danger) 35%, var(--hair))', background: 'var(--paper)', color: 'var(--danger)', cursor: 'pointer' };
// Canonical secondary button (values match components/ui-v2/DataTable.tsx's `dt.toolBtn` exactly).
// Not imported directly: `dt` is defined in DataTable.tsx, which pulls in @tanstack/react-table
// (ESM-only) at module scope, so even a deep import of just `dt` would execute that import and
// break under jest -- see this file's top-of-file note on avoiding the ui-v2 barrel.
const secondaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(11,18,32,.08)' };
const badge: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', padding: '3px 8px', borderRadius: 999, border: '1px solid color-mix(in srgb, #15803d 35%, transparent)', background: 'color-mix(in srgb, #15803d 10%, transparent)', color: '#15803d' };
const mutedBadge: React.CSSProperties = { ...badge, border: '1px solid var(--hair)', background: 'var(--surface)', color: muted };

type Notice = { type: 'success' | 'error'; text: string } | null;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function JobsChecklist({ selected, onToggle }: { selected: Set<string>; onToggle: (jobId: string) => void }) {
  const { data: jobs, isLoading } = useJobs();
  if (isLoading) return <p style={{ fontSize: 13, color: muted }}>Loading jobs…</p>;
  if (!jobs || jobs.length === 0) return <p style={{ fontSize: 13, color: muted }}>No jobs to assign yet.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
      {jobs.map((j) => (
        <label key={j.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
          <input
            type="checkbox" checked={selected.has(j.id)} onChange={() => onToggle(j.id)}
            style={{ width: 15, height: 15, accentColor: 'var(--org-primary)' }}
          />
          {j.title}
        </label>
      ))}
    </div>
  );
}

function AssignedJobsDialog({ agency, onClose, notify }: { agency: Agency; onClose: () => void; notify: (type: 'success' | 'error', text: string) => void }) {
  const update = useUpdateAgency();
  const [selected, setSelected] = useState<Set<string>>(new Set(agency.jobIds));

  function toggle(jobId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });
  }

  function handleSave() {
    update.mutate(
      { id: agency.id, jobIds: Array.from(selected) },
      {
        onSuccess: () => { notify('success', 'Assigned jobs updated.'); onClose(); },
        onError: (err) => notify('error', errorMessage(err, 'Failed to update assigned jobs.')),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title={`Assigned jobs — ${agency.name}`} width={420}>
      <p style={{ ...desc, marginBottom: 12 }}>
        {agency.name} currently has access to {agency.assignedJobCount} job{agency.assignedJobCount === 1 ? '' : 's'}
        (checked below). Adjust the checklist, then Save to replace the full list.
      </p>
      <JobsChecklist selected={selected} onToggle={toggle} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button type="button" onClick={onClose} className="v2-hoverbtn" style={secondaryBtn}>Cancel</button>
        <Button onClick={handleSave} loading={update.isPending}>Save</Button>
      </div>
    </Dialog>
  );
}

function NewAgencyDialog({ onClose, notify }: { onClose: () => void; notify: (type: 'success' | 'error', text: string) => void }) {
  const create = useCreateAgency();
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [active, setActive] = useState(true);
  const [jobIds, setJobIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function toggleJob(jobId: string) {
    setJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setError(null);
    create.mutate(
      {
        name: name.trim(),
        contactEmail: contactEmail.trim() || undefined,
        active,
        jobIds: Array.from(jobIds),
      },
      {
        onSuccess: () => { notify('success', 'Agency created.'); onClose(); },
        onError: (err) => setError(errorMessage(err, 'Failed to create agency.')),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title="New agency" width={440}>
      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextField id="agency-name" label="Name" value={name} onChange={setName} required autoComplete="off" />
          <TextField id="agency-contact-email" label="Contact email (optional)" type="email" value={contactEmail} onChange={setContactEmail} autoComplete="off" />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--org-primary)' }} />
            Active (portal link works immediately)
          </label>
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', margin: '0 0 8px' }}>Assigned jobs</p>
            <JobsChecklist selected={jobIds} onToggle={toggleJob} />
          </div>
        </div>
        {error && <p role="alert" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onClose} className="v2-hoverbtn" style={secondaryBtn}>Cancel</button>
          <Button type="submit" loading={create.isPending}>Create</Button>
        </div>
      </form>
    </Dialog>
  );
}

function AgencyRow({ agency, notify }: { agency: Agency; notify: (type: 'success' | 'error', text: string) => void }) {
  const update = useUpdateAgency();
  const del = useDeleteAgency();
  const regenerate = useRegenerateAgencyToken();
  const [name, setName] = useState(agency.name);
  const [contactEmail, setContactEmail] = useState(agency.contactEmail ?? '');
  const [portalUrl, setPortalUrl] = useState(agency.portalUrl);
  const [editingJobs, setEditingJobs] = useState(false);

  function handleNameBlur() {
    if (!name.trim() || name === agency.name) return;
    update.mutate(
      { id: agency.id, name: name.trim() },
      { onError: (err) => { notify('error', errorMessage(err, 'Failed to rename agency.')); setName(agency.name); } },
    );
  }

  function handleContactEmailBlur() {
    if (contactEmail === (agency.contactEmail ?? '')) return;
    update.mutate(
      { id: agency.id, contactEmail: contactEmail.trim() || undefined },
      { onError: (err) => { notify('error', errorMessage(err, 'Failed to update contact email.')); setContactEmail(agency.contactEmail ?? ''); } },
    );
  }

  function handleToggleActive() {
    update.mutate(
      { id: agency.id, active: !agency.active },
      {
        onSuccess: () => notify('success', `${agency.name} is now ${!agency.active ? 'active' : 'inactive'}.`),
        onError: (err) => notify('error', errorMessage(err, 'Failed to update agency.')),
      },
    );
  }

  function handleCopy() {
    navigator.clipboard?.writeText(portalUrl).then(
      () => notify('success', 'Portal link copied.'),
      () => notify('error', 'Could not copy the portal link.'),
    );
  }

  function handleRegenerate() {
    if (!window.confirm('Regenerate the portal link? The old link stops working immediately.')) return;
    regenerate.mutate(agency.id, {
      onSuccess: (data) => { setPortalUrl(data.portalUrl); notify('success', 'Portal link regenerated.'); },
      onError: (err) => notify('error', errorMessage(err, 'Failed to regenerate the portal link.')),
    });
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${agency.name}"? This cannot be undone.`)) return;
    del.mutate(agency.id, {
      onSuccess: () => notify('success', `${agency.name} deleted.`),
      onError: (err) => notify('error', errorMessage(err, 'Cannot delete this agency.')),
    });
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ minWidth: 180, flex: '1 1 180px' }} onBlur={handleNameBlur}>
          <TextField id={`agency-name-${agency.id}`} label="Name" value={name} onChange={setName} />
        </div>
        <div style={{ minWidth: 220, flex: '1 1 220px' }} onBlur={handleContactEmailBlur}>
          <TextField id={`agency-contact-email-${agency.id}`} label="Contact email" type="email" value={contactEmail} onChange={setContactEmail} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <button type="button" style={agency.active ? badge : mutedBadge} onClick={handleToggleActive} aria-label={`Toggle ${agency.name} active`}>
            {agency.active ? 'Active' : 'Inactive'}
          </button>
          <button type="button" style={dangerIconBtn} onClick={handleDelete} aria-label={`Delete ${agency.name}`}><Trash2 size={15} /></button>
        </div>
      </div>

      <p style={{ ...desc, marginTop: 10 }}>
        {agency.assignedJobCount} job{agency.assignedJobCount === 1 ? '' : 's'} assigned · {agency.pendingSubmissionCount} pending submission{agency.pendingSubmissionCount === 1 ? '' : 's'}
        {' '}
        <button type="button" style={{ ...secondaryBtn, padding: '3px 10px', fontSize: 12, marginLeft: 8 }} onClick={() => setEditingJobs(true)}>
          Assigned jobs
        </button>
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <code style={{ fontSize: 12, color: muted, wordBreak: 'break-all', background: 'var(--surface)', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--hair)' }}>
          {portalUrl}
        </code>
        <button type="button" style={{ ...secondaryBtn, padding: '5px 10px', fontSize: 12 }} onClick={handleCopy} aria-label={`Copy portal link for ${agency.name}`}>
          <Copy size={13} /> Copy
        </button>
        <button type="button" style={{ ...secondaryBtn, padding: '5px 10px', fontSize: 12 }} onClick={handleRegenerate} disabled={regenerate.isPending}>
          Regenerate link
        </button>
      </div>

      {editingJobs && <AssignedJobsDialog agency={agency} onClose={() => setEditingJobs(false)} notify={notify} />}
    </div>
  );
}

export default function V2AgenciesSettingsPage() {
  const { role, actingSuperAdmin } = useAuth();
  const canConfigure = role === 'org_admin' || actingSuperAdmin;
  const { data: agencies, isLoading, isError } = useAgencies();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  if (!canConfigure) return <p style={{ fontSize: 13, color: muted }}>You don&apos;t have access to this page.</p>;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Agencies</h1>
          <p style={{ ...desc, marginTop: 6 }}>
            External recruiting agencies submit candidates through their own portal link, scoped to the jobs you assign them.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus size={15} /> Add agency</Button>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading agencies…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load agencies.</p>}
      {!isLoading && !isError && (!agencies || agencies.length === 0) && <p style={{ fontSize: 13, color: muted }}>No agencies yet — add one to get started.</p>}

      {agencies && agencies.map((a) => <AgencyRow key={a.id} agency={a} notify={notify} />)}

      {creating && <NewAgencyDialog onClose={() => setCreating(false)} notify={notify} />}
    </div>
  );
}
