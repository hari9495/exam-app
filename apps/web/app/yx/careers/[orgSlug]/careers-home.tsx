'use client';

import { useRouter } from 'next/navigation';
import { EmptyState } from '@yukthix/ui';
import { CareersSiteScreen } from '@yukthix/ui/hiring';
import { kitConfig, kitJob, publicPost } from '../../../../lib/yx-careers';
import type { CareersPageResponse } from '../../../../lib/types';

// The designed T9-09 careers home with real data: Apply opens the job's own page (or its apply link for an older job
// without a readable address); the group's company pages; the assistant when the company switched it on.
export function CareersHome({ orgSlug, company, data }: { orgSlug: string; company: string | null; data: CareersPageResponse | null }) {
  const router = useRouter();
  if (!data) return <EmptyState title="This careers page is not available." description="Check the address, or ask the company for its careers link." />;
  const base = `/yx/careers/${encodeURIComponent(orgSlug)}`;
  const name = data.companyName ?? data.orgName;
  const companies = data.companies?.length ? [{ name: `All of ${data.orgName}`, href: base, current: !company }, ...data.companies.map((c) => ({ name: c.name, href: `${base}?company=${encodeURIComponent(c.slug)}`, current: company === c.slug }))] : undefined;
  return (
    <CareersSiteScreen
      config={kitConfig(name, data.config, data.bannerUrl, data.headline, data.intro)}
      jobs={data.jobs.map(kitJob)}
      live={{
        onApply: (job) => {
          const j = data.jobs.find((x) => (x.slug ?? x.applyToken) === job.id);
          if (j) router.push(j.slug ? `${base}/jobs/${encodeURIComponent(j.slug)}` : `/yx/apply/${encodeURIComponent(j.applyToken)}`);
        },
        companies,
        assistant: data.assistantEnabled
          ? { onAsk: (question, history) => publicPost<{ answer: string | null }>(`/careers/${encodeURIComponent(orgSlug)}/assistant`, { question, history }).then((r) => r.answer).catch(() => null) }
          : undefined,
      }}
    />
  );
}
