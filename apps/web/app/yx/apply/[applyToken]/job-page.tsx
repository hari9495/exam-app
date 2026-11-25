'use client';

import { CareersJobScreen } from '@yukthix/ui/hiring';
import { jobDetail, liveApply } from '../../../../lib/yx-careers';
import type { PublicJob } from '../../../../lib/types';

// The designed T9-09 job page with the real apply form (consent notices, the pay question where the law allows, the
// company's own questions, the bot trap). No job (closed, on hold, unknown link): "This role is not accepting applications".
export function JobPage({ applyToken, job, address, allJobsHref }: { applyToken: string | null; job: PublicJob | null; address: string; allJobsHref: string | null }) {
  const today = new Date();
  if (!job || !applyToken)
    return (
      <CareersJobScreen
        tenant="Careers"
        detail={{ job: { id: 'closed', title: 'This job', department: '', location: '', type: '', postedOn: today }, slug: address, pay: null, about: '' }}
        today={today}
        state="closed"
        live={{ allJobsHref, apply: { upload: async () => undefined, onSubmit: async () => undefined } }}
      />
    );
  const careersHome = job.careers ? `/yx/careers/${encodeURIComponent(job.careers.orgSlug)}` : allJobsHref;
  return <CareersJobScreen tenant={job.orgName} accent={job.accent ?? undefined} detail={jobDetail(job, address, applyToken)} today={today} live={{ allJobsHref: careersHome, apply: liveApply(applyToken, job) }} />;
}
