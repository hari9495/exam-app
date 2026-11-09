'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ApplicationStatusScreen, type ApplicationStatusView, type CandidatePageState } from '@yukthix/ui/hiring';
import { publicGet, candidateBrand } from '../../../../lib/yx-careers';
import type { ApplicationStatus } from '../../../../lib/types';

// T9-09 application status (founder decision 10): the status link from the apply email shows this one application in
// candidate words only. Public; the token is the only key, and an unknown one shows "could not find".
export default function YxApplicationStatusPage() {
  const { statusToken } = useParams<{ statusToken: string }>();
  const [data, setData] = useState<ApplicationStatus | null>(null);
  const [state, setState] = useState<CandidatePageState>('loading');
  useEffect(() => {
    let live = true;
    void publicGet<ApplicationStatus>(`/applications/${encodeURIComponent(statusToken)}`).then((d) => {
      if (!live) return;
      setData(d);
      setState(d ? 'ready' : 'not-found');
    });
    return () => {
      live = false;
    };
  }, [statusToken]);
  const status: ApplicationStatusView | null = data ? { jobTitle: data.jobTitle, location: data.location ?? null, appliedAt: new Date(data.appliedAt), bucket: data.statusBucket } : null;
  return <ApplicationStatusScreen brand={candidateBrand(data)} state={state} status={status} />;
}
