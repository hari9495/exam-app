'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { SetupHubScreen, type ModuleCard } from '@yukthix/ui/frame';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { loadState } from '../../../../../lib/yx-org';

type Area = Omit<ModuleCard, 'checks'> & { checks: (ModuleCard['checks'][number] & { href: string })[] };

// Settings › Set-up hub (PLT-08, answer 952): how much of each area is set up, from what each area already knows. Each
// check opens its set-up page. The API checks Company rules (org.settings.manage) and reads only this company.
export default function YxSetupHubPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const hub = useQuery<Area[]>({ queryKey: ['yx', 'setup-hub'], queryFn: () => apiFetch('/help/setup-hub', {}, accessToken ?? undefined), enabled: Boolean(accessToken), retry: false });
  const areas = hub.data ?? [];
  return (
    <SetupHubScreen
      modules={areas}
      live={{
        state: loadState(hub),
        onRetry: () => void hub.refetch(),
        onStart: (areaId, checkId) => {
          const href = areas.find((a) => a.id === areaId)?.checks.find((c) => c.id === checkId)?.href;
          if (href) router.push(href);
        },
      }}
    />
  );
}
