'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, CareersCompanyPages, CareersNotices, EmptyState, PageBuilder, useToast, type CareersConfig, type CareersEntityPage, type ConsentNotice } from '@yukthix/ui';
import { apiFetch } from '../../../../../lib/api-client';
import { loadState } from '../../../../../lib/yx-org';
import { useAuth } from '../../../../../lib/auth-context';
import { useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';
import { useCareersSettings, useUpdateCareersSettings, useUploadCareersBanner } from '../../../../../lib/hooks/useCareersSettings';
import type { ApiJob } from '../../../../../lib/yx-jobs';
import { kitConfig, kitJob, layoutOf } from '../../../../../lib/yx-careers';

type Entities = { entities: { id: string; name: string }[]; pages: (CareersEntityPage & { legalEntityId: string })[] };

// Hiring › Careers site (founder decision 8): the designed Surfaces/Careers page builder, live. Publish saves the layout
// and puts the page online; the photo, assistant and "take offline" sit under Page. Below it, every setting the old page
// had: a page per company in the group and the versioned privacy notices.
export default function YxHiringCareersPage() {
  const { organizationSlug, accessToken } = useAuth();
  const toast = useToast();
  const settings = useCareersSettings();
  const update = useUpdateCareersSettings();
  const banner = useUploadCareersBanner();
  const entities = useHiring<Entities>('/careers-entities');
  const notices = useHiring<ConsentNotice[]>('/consent-notices');
  const jobs = useQuery<ApiJob[]>({ queryKey: ['jobs', 'careers-preview'], queryFn: () => apiFetch('/jobs', {}, accessToken ?? undefined), enabled: Boolean(accessToken) });
  const write = useHiringWrite();
  const [config, setConfig] = useState<CareersConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'publish' | 'offline' | null>(null);
  const s = settings.data;
  useEffect(() => {
    if (s && !dirty) setConfig(kitConfig(organizationSlug ?? 'Your company', s.config, s.bannerUrl, s.headline, s.intro));
  }, [s, dirty, organizationSlug]);

  const state = loadState(settings, entities, notices);
  if (state !== 'ready' || !s || !config)
    return state === 'loading' ? (
      <EmptyState title="Loading the careers site…" />
    ) : (
      <EmptyState
        title={state === 'no-access' ? 'You cannot change the careers site.' : 'The careers site settings did not load.'}
        description={state === 'no-access' ? 'Your admin gives this with the organisation settings key.' : 'Check your connection and try again.'}
        action={state === 'no-access' ? undefined : <Button onClick={() => void Promise.all([settings.refetch(), entities.refetch(), notices.refetch()])}>Try again</Button>}
      />
    );

  const save = async (enabled: boolean, what: 'publish' | 'offline', title: string) => {
    setBusy(what);
    try {
      await update.mutateAsync({ enabled, ...(what === 'publish' ? { config: layoutOf(config) } : {}) });
      setDirty(false);
      toast.toast({ tone: 'success', title });
    } catch (e) {
      toast.toast({ tone: 'error', title: 'Not saved', description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const listed = (jobs.data ?? []).filter((j) => j.status === 'open' && j.publicApplyEnabled && j.listOnCareers);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  return (
    <>
      <PageBuilder
        // The preview's header shows the group's main company (the first legal entity), else the sign-in name.
        value={{ ...config, companyName: entities.data?.entities[0]?.name ?? organizationSlug ?? config.companyName }}
        onChange={(c) => {
          setConfig(c);
          setDirty(true);
        }}
        jobs={listed.map((j) => kitJob({ slug: j.slug ?? null, applyToken: j.id, title: j.title, location: j.location, employmentType: j.employmentType ?? null, department: j.department, salaryMin: null, salaryMax: null, salaryCurrency: null, postedAt: j.publishedAt ?? j.createdAt }))}
        status={s.enabled && !dirty ? 'published' : 'draft'}
        publishing={busy === 'publish'}
        onPublish={() => void save(true, 'publish', 'Careers page published')}
        onPreview={() => window.open(`/yx/careers/${organizationSlug ?? ''}`, '_blank', 'noopener')}
        site={{
          publicUrl: `${origin}/yx/careers/${organizationSlug ?? ''}`,
          bannerUrl: s.bannerUrl,
          onUploadBanner: async (file) => {
            await banner.mutateAsync(file);
            toast.toast({ tone: 'success', title: 'Photo uploaded' });
          },
          assistantEnabled: s.assistantEnabled,
          onAssistantChange: (on) =>
            void update
              .mutateAsync({ enabled: s.enabled, assistantEnabled: on })
              .then(() => toast.toast({ tone: 'success', title: on ? 'Careers assistant is on' : 'Careers assistant is off' }))
              .catch((e: Error) => toast.toast({ tone: 'error', title: 'Not saved', description: e.message })),
          onUnpublish: () => void save(false, 'offline', 'Careers page is offline'),
          unpublishing: busy === 'offline',
        }}
      />
      <CareersCompanyPages
        entities={(entities.data?.entities ?? []).map((e) => {
          const page = entities.data?.pages.find((x) => x.legalEntityId === e.id);
          return { id: e.id, name: e.name, page: page ? { slug: page.slug, headline: page.headline, intro: page.intro, primaryColor: page.primaryColor } : null };
        })}
        onSaveEntity={async (id, page) => {
          await write('PUT', `/careers-entities/${id}`, page);
          toast.toast({ tone: 'success', title: 'Company page saved' });
        }}
        onRemoveEntity={async (id) => {
          await write('DELETE', `/careers-entities/${id}`);
          toast.toast({ tone: 'success', title: 'Company page removed' });
        }}
      />
      <CareersNotices
        notices={notices.data ?? []}
        onPublishNotice={async (purpose, text) => {
          await write('POST', '/consent-notices', { purpose, text });
          toast.toast({ tone: 'success', title: 'Notice published' });
        }}
      />
    </>
  );
}
