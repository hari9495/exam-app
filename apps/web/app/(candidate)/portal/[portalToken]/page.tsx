'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { API_BASE } from '../../../../lib/api-client';
import { PortalView, PortalApplication } from '../../../../lib/types';
import { CandidateButton } from '../../components/CandidateButton';
import { TerminalCard } from '../../components/TerminalCard';

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

// Backend expects raw base64 (Buffer.from(x, 'base64')) -- strip the
// "data:application/pdf;base64," prefix FileReader's readAsDataURL adds. Mirrors
// apply-form.tsx's helper of the same shape.
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

const INPUT_CLASS =
  'w-full rounded border border-candidate-border px-3 py-2 text-sm focus:border-candidate-primary focus:outline-none focus:ring-2 focus:ring-candidate-primary/20';

function DetailsCard({ portal, portalToken, onUpdate }: { portal: PortalView; portalToken: string; onUpdate: (p: PortalView) => void }) {
  const [name, setName] = useState(portal.candidateName);
  const [phone, setPhone] = useState(portal.candidatePhone ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    try {
      const res = await fetch(`${API_BASE}/public/portal/${portalToken}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      });
      if (!res.ok) throw new Error('not ok');
      onUpdate(await res.json());
      setStatus('saved');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <div className="rounded-lg border border-candidate-border bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_-18px_rgba(16,24,40,0.20)]">
      <h2 className="font-display text-base font-semibold text-candidate-text">Your details</h2>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="portal-name" className="text-sm font-medium text-candidate-text">
            Name
          </label>
          <input id="portal-name" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="portal-phone" className="text-sm font-medium text-candidate-text">
            Phone
          </label>
          <input id="portal-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT_CLASS} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="portal-email" className="text-sm font-medium text-candidate-text">
            Email
          </label>
          <input id="portal-email" value={portal.candidateEmail} disabled className={`${INPUT_CLASS} bg-candidate-bg text-candidate-text-secondary`} />
        </div>
        {status === 'saved' && <p className="text-xs text-candidate-primary">Saved.</p>}
        {status === 'failed' && (
          <p role="alert" className="text-xs text-candidate-danger">
            Could not save. Please try again.
          </p>
        )}
        <CandidateButton type="submit" disabled={status === 'saving'} className="self-start">
          {status === 'saving' ? 'Saving…' : 'Save'}
        </CandidateButton>
      </form>
    </div>
  );
}

function ResumeCard({ portal, portalToken, onUpdate }: { portal: PortalView; portalToken: string; onUpdate: (p: PortalView) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are accepted.');
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setError('File must be 5 MB or smaller.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const resumeBase64 = await readFileAsBase64(file);
      const res = await fetch(`${API_BASE}/public/portal/${portalToken}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeBase64 }),
      });
      if (!res.ok) throw new Error('not ok');
      onUpdate(await res.json());
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-lg border border-candidate-border bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_-18px_rgba(16,24,40,0.20)]">
      <h2 className="font-display text-base font-semibold text-candidate-text">Résumé</h2>
      <p className="mt-1 text-sm text-candidate-text-secondary">
        {portal.resume.hasResume ? `Résumé on file${portal.resume.parseStatus ? ` · ${portal.resume.parseStatus}` : ''}` : 'No résumé uploaded'}
      </p>
      <div className="mt-3 flex flex-col gap-1">
        <label htmlFor="portal-resume" className="text-sm font-medium text-candidate-text">
          {portal.resume.hasResume ? 'Replace résumé (PDF, max 5 MB)' : 'Upload résumé (PDF, max 5 MB)'}
        </label>
        <input
          id="portal-resume"
          type="file"
          accept="application/pdf"
          disabled={uploading}
          onChange={handleFile}
          className="text-sm text-candidate-text-secondary"
        />
        {error ? (
          <p role="alert" className="text-xs text-candidate-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const STAGE_LABEL: Record<string, string> = {
  applied: 'Applied',
  screened: 'Screened',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
};

function statusText(app: PortalApplication): string {
  if (app.rejected) return 'Not moving forward';
  return STAGE_LABEL[app.stage] ?? app.stage;
}

function fmt(iso: string, timeZone?: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, timeZone ? { timeZone } : undefined);
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function ApplicationCard({ app }: { app: PortalApplication }) {
  return (
    <div className="rounded-lg border border-candidate-border bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_-18px_rgba(16,24,40,0.20)]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-candidate-text">{app.jobTitle}</h2>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            app.rejected ? 'bg-candidate-danger-bg text-candidate-danger' : 'bg-candidate-primary/10 text-candidate-primary'
          }`}
        >
          {statusText(app)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-candidate-text-secondary">Applied {fmt(app.appliedAt)}</p>

      {app.interviews.length > 0 && (
        <div className="mt-3 border-t border-candidate-border pt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-candidate-text-secondary">Interviews</p>
          <ul className="flex flex-col gap-2">
            {app.interviews.map((iv, idx) => (
              <li key={iv.token ?? idx} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-candidate-text">
                  {iv.confirmed ? 'Confirmed' : iv.status === 'proposed' ? 'Awaiting your response' : iv.status}
                  {iv.location ? ` · ${iv.location}` : ''}
                </span>
                {iv.token && !iv.confirmed && iv.status === 'proposed' && (
                  <Link href={`/interview/${iv.token}`} className="shrink-0 text-sm font-medium text-candidate-primary underline">
                    Respond
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {app.offers.length > 0 && (
        <div className="mt-3 border-t border-candidate-border pt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-candidate-text-secondary">Offers</p>
          <ul className="flex flex-col gap-2">
            {app.offers.map((of, idx) => (
              <li key={of.token ?? idx} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-candidate-text">
                  {of.status === 'accepted' ? 'Accepted' : of.status === 'declined' ? 'Declined' : 'Offer extended'} · starts {new Date(of.startDate).toLocaleDateString()}
                </span>
                {of.token && of.status !== 'accepted' && of.status !== 'declined' && (
                  <Link href={`/offer/${of.token}`} className="shrink-0 text-sm font-medium text-candidate-primary underline">
                    View offer
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function PortalPage() {
  const { portalToken } = useParams<{ portalToken: string }>();
  const [portal, setPortal] = useState<PortalView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/public/portal/${portalToken}`)
      .then((res) => {
        if (!res.ok) throw new Error('not ok');
        return res.json();
      })
      .then((data: PortalView) => {
        if (!cancelled) setPortal(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [portalToken]);

  if (failed) {
    return <TerminalCard tone="error" title="Portal unavailable" body="This link isn't valid. Please use the most recent link from your application." />;
  }
  if (!portal) {
    return <TerminalCard tone="loading" title="Loading" body="Gathering your applications." />;
  }

  return (
    <div className="candidate-rise mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 sm:p-8">
      <div>
        <p className="text-sm font-semibold text-candidate-text-secondary">{portal.orgName}</p>
        <h1 className="font-display text-2xl font-bold text-candidate-text">Your applications</h1>
        <p className="text-sm text-candidate-text-secondary">{portal.candidateName} · {portal.candidateEmail}</p>
      </div>
      <DetailsCard portal={portal} portalToken={portalToken} onUpdate={setPortal} />
      <ResumeCard portal={portal} portalToken={portalToken} onUpdate={setPortal} />
      {portal.applications.length === 0 ? (
        <p className="text-sm text-candidate-text-secondary">You have no applications yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {portal.applications.map((app, idx) => (
            <ApplicationCard key={app.statusToken ?? idx} app={app} />
          ))}
        </div>
      )}
    </div>
  );
}
