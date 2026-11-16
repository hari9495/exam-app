'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { CoordinatorPortalScreen, type LiveCoordinatorView } from '@yukthix/ui/assessments';
import { apiFetchAnonymous } from '../../../lib/api-client';

type ApiView = Omit<LiveCoordinatorView, 'registrationUrl'> & { registrationPath: string };

// Assessments AS-3 part 2 (PRC-29): the college coordinator's read-only view of one drive, by the link emailed to them.
// Their own college only; results at the level the company set, after the drive closes. No sign-in.
export default function CampusCoordinatorPage() {
  const { token } = useParams<{ token: string }>();
  const q = useQuery<ApiView>({ queryKey: ['campus-coordinator', token], queryFn: () => apiFetchAnonymous(`/public/campus/coordinator/${encodeURIComponent(token)}`), retry: false });
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return (
    <ToastProvider>
      <CoordinatorPortalScreen
        live={{
          state: q.isError ? 'expired' : q.data ? 'ready' : 'loading',
          view: q.data ? { ...q.data, registrationUrl: `${origin}${q.data.registrationPath}` } : null,
          onCopyLink: (url) => navigator.clipboard.writeText(url),
        }}
      />
    </ToastProvider>
  );
}
