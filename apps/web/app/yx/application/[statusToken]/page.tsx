'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ApplicationStatusScreen, type ApplicationStatusView, type CandidatePageState } from '@yukthix/ui/hiring';
import { publicGet, publicPost, candidateBrand } from '../../../../lib/yx-careers';
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
  const status: ApplicationStatusView | null = data
    ? { jobTitle: data.jobTitle, location: data.location ?? null, appliedAt: new Date(data.appliedAt), bucket: data.statusBucket, toolNotice: data.toolNotice ? { ...data.toolNotice, requestedAt: data.toolNotice.requestedAt ? new Date(data.toolNotice.requestedAt) : null } : null, whatsapp: data.whatsapp ?? null }
    : null;
  // Answer 502: a New York City candidate asks for another process than the automated tool.
  const onAskAlternative = async () => setData(await publicPost<ApplicationStatus>(`/applications/${encodeURIComponent(statusToken)}/alternative-process`, {}));
  // Answer 561: tick or untick "Message me on WhatsApp about jobs".
  const onWhatsapp = async (optIn: boolean) => setData(await publicPost<ApplicationStatus>(`/applications/${encodeURIComponent(statusToken)}/whatsapp`, { optIn }));
  return <ApplicationStatusScreen brand={candidateBrand(data)} state={state} status={status} onAskAlternative={onAskAlternative} onWhatsapp={onWhatsapp} />;
}
