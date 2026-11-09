'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CandidatePortalScreen, type CandidatePageState, type CandidatePortalView } from '@yukthix/ui/hiring';
import { fileToBase64, publicGet, publicPost } from '../../../../lib/yx-careers';
import type { PortalOpenJobs, PortalView } from '../../../../lib/types';

// T9-09 candidate page (founder decision 10): the candidate's own link (from the apply email) shows their details,
// resume, every application with its interviews and offers, and the company's other open jobs. Nothing else.
export default function YxCandidatePortalPage() {
  const { portalToken } = useParams<{ portalToken: string }>();
  const base = `/portal/${encodeURIComponent(portalToken)}`;
  const [portal, setPortal] = useState<PortalView | null>(null);
  const [open, setOpen] = useState<PortalOpenJobs | null>(null);
  const [state, setState] = useState<CandidatePageState>('loading');
  const load = useCallback(async () => {
    const [p, o] = await Promise.all([publicGet<PortalView>(base), publicGet<PortalOpenJobs>(`${base}/open-jobs`)]);
    setPortal(p);
    setOpen(o);
    setState(p ? 'ready' : 'not-found');
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  const view: CandidatePortalView | null = portal
    ? {
        name: portal.candidateName,
        email: portal.candidateEmail,
        phone: portal.candidatePhone,
        hasResume: portal.resume.hasResume,
        oneClick: Boolean(open && open.hasResume && !open.requiresConsent && open.requiredFieldCount === 0),
        applications: portal.applications.map((a) => ({
          jobTitle: a.jobTitle,
          bucket: a.stage,
          appliedAt: new Date(a.appliedAt),
          statusHref: a.statusToken ? `/yx/application/${encodeURIComponent(a.statusToken)}` : null,
          interviews: a.interviews.map((i) => ({ token: i.token, status: i.status, location: i.location, confirmed: i.confirmed, startsAt: i.confirmedAt ?? null, timeZone: i.timeZone })),
          offers: a.offers.map((o) => ({ token: o.token, status: o.status, startDate: new Date(o.startDate) })),
        })),
        openJobs: (open?.jobs ?? []).map((j) => ({ id: j.applyToken, title: j.title, location: j.location, applyHref: `/yx/apply/${encodeURIComponent(j.applyToken)}` })),
      }
    : null;

  return (
    <CandidatePortalScreen
      brand={{ tenant: portal?.orgName ?? '', accent: portal?.accent, careersHref: portal?.careersSlug ? `/yx/careers/${encodeURIComponent(portal.careersSlug)}` : null }}
      state={state}
      portal={view}
      live={{
        onSaveDetails: async (d) => setPortal(await publicPost<PortalView>(`${base}/profile`, { name: d.name, phone: d.phone }, 'PATCH')),
        onUploadResume: async (file) => {
          if (file.type !== 'application/pdf') throw new Error('Upload your resume as a PDF file.');
          setPortal(await publicPost<PortalView>(`${base}/resume`, { resumeBase64: await fileToBase64(file) }));
        },
        onQuickApply: async (job) => {
          await publicPost(`${base}/apply/${encodeURIComponent(job.id)}`, {});
          await load();
        },
        interviewHref: (t) => `/yx/interview/${encodeURIComponent(t)}`,
        offerHref: (t) => `/yx/offer/${encodeURIComponent(t)}`,
      }}
    />
  );
}
