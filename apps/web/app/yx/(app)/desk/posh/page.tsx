'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../../lib/auth-context';
import { apiFetch } from '../../../../../lib/api-client';
import { PoshComplaintScreen, type FiledReport, type SpeakUpFormData } from '@yukthix/ui/desk';
import { EmptyState, Skeleton } from '@yukthix/ui';
import { useDesk } from '../../../../../lib/yx-desk';

const id = encodeURIComponent;

// Helpdesk › Speak up › Sexual harassment: the designed CMP-10 complaint form with `live` (batch F item 13). Filed as a
// POSH speak-up report with the person's name (the committee must be able to hear her); files follow the report. The
// API routes it to the Internal Committee only and checks the filing window again (docs/yukthix/helpdesk-design-map.md 4e).
export default function YxPoshComplaintPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const form = useDesk<SpeakUpFormData>('/speakup/form');
  if (form.isError) return <EmptyState title="We couldn't load the form" description="Try again in a moment." />;
  if (!form.data) return <Skeleton height={320} />;
  const f = form.data;
  return (
    <PoshComplaintScreen
      today={new Date()}
      live={{
        company: f.company,
        icReady: f.ready.posh,
        locations: f.locations,
        onFile: async (input) => {
          const r = (await apiFetch('/desk/speakup/reports', { method: 'POST', body: JSON.stringify({ kind: 'posh', ...input, locationId: input.locationId ?? undefined }) }, accessToken ?? undefined)) as FiledReport;
          return { id: r.id, reference: r.number };
        },
        onUpload: async (reportId, file) => {
          const body = new FormData();
          body.append('file', file);
          await apiFetch(`/desk/speakup/reports/${id(reportId)}/files`, { method: 'POST', body }, accessToken ?? undefined);
        },
        onGrievance: () => router.push('/yx/desk/speakup'),
      }}
    />
  );
}
