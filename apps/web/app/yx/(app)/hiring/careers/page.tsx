'use client';

import { CareersSiteScreen, type CareersEntityPage, type ConsentNotice } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { useAuth } from '../../../../../lib/auth-context';
import { useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';
import { useCareersSettings, useUpdateCareersSettings, useUploadCareersBanner } from '../../../../../lib/hooks/useCareersSettings';

type Entities = { entities: { id: string; name: string }[]; pages: (CareersEntityPage & { legalEntityId: string })[] };

// Hiring › Careers site (M10 batch AT3): the public page, a page per company in the group and the versioned privacy
// notices. Replaces /v2/settings/careers and /v2/settings/apply-consent, which redirect here.
export default function YxHiringCareersPage() {
  const { organizationSlug } = useAuth();
  const settings = useCareersSettings();
  const update = useUpdateCareersSettings();
  const banner = useUploadCareersBanner();
  const entities = useHiring<Entities>('/careers-entities');
  const notices = useHiring<ConsentNotice[]>('/consent-notices');
  const write = useHiringWrite();
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return (
    <CareersSiteScreen
      state={loadState(settings, entities, notices)}
      onRetry={() => void Promise.all([settings.refetch(), entities.refetch(), notices.refetch()])}
      settings={settings.data ?? null}
      publicUrl={`${origin}/careers/${organizationSlug ?? ''}`}
      onSave={(s) => update.mutateAsync(s)}
      onUploadBanner={(file) => banner.mutateAsync(file)}
      entities={(entities.data?.entities ?? []).map((e) => {
        const page = entities.data?.pages.find((x) => x.legalEntityId === e.id);
        return { id: e.id, name: e.name, page: page ? { slug: page.slug, headline: page.headline, intro: page.intro, primaryColor: page.primaryColor } : null };
      })}
      onSaveEntity={(id, page) => write('PUT', `/careers-entities/${id}`, page)}
      onRemoveEntity={(id) => write('DELETE', `/careers-entities/${id}`)}
      notices={notices.data ?? []}
      onPublishNotice={(purpose, text) => write('POST', '/consent-notices', { purpose, text })}
    />
  );
}
