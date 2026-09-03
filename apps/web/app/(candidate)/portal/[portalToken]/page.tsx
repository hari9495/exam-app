'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { API_BASE } from '../../../../lib/api-client';
import { PortalView, PortalApplication } from '../../../../lib/types';
import { TerminalCard } from '../../components/TerminalCard';

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
    <div className="rounded-lg border border-candidate-border bg-white p-4">
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 sm:p-8">
      <div>
        <p className="text-sm font-semibold text-candidate-text-secondary">{portal.orgName}</p>
        <h1 className="font-display text-2xl font-bold text-candidate-text">Your applications</h1>
        <p className="text-sm text-candidate-text-secondary">{portal.candidateName} · {portal.candidateEmail}</p>
      </div>
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
