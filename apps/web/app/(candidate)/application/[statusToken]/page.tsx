'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { API_BASE } from '../../../../lib/api-client';
import { ApplicationStatus } from '../../../../lib/types';
import { StatusBadge } from '../../../../components/ui';
import { TerminalCard } from '../../components/TerminalCard';

export default function ApplicationStatusPage() {
  const { statusToken } = useParams<{ statusToken: string }>();
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/public/applications/${statusToken}`)
      .then((res) => {
        if (!res.ok) throw new Error('not ok');
        return res.json();
      })
      .then((data: ApplicationStatus) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [statusToken]);

  if (notFound) {
    return <TerminalCard tone="error" title="Application not found" body="We couldn't find an application for this link." />;
  }

  if (!status) {
    return <TerminalCard tone="loading" title="Loading" body="This only takes a moment." />;
  }

  return (
    <div className="mx-auto flex flex-1 max-w-xl flex-col justify-center gap-6 p-4 sm:p-8">
      <div className="rounded-lg border border-candidate-border bg-white p-6">
        <h1 className="mb-1 font-display text-xl font-bold text-candidate-text">{status.jobTitle}</h1>
        <p className="mb-4 text-sm text-candidate-text-secondary">Applied on {new Date(status.appliedAt).toLocaleDateString()}</p>
        <StatusBadge tone="info">{status.statusBucket}</StatusBadge>
      </div>
    </div>
  );
}
