'use client';

import { useRouter } from 'next/navigation';
import { ReportAccidentScreen, type AccidentFormData } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskUpload, useDeskWrite } from '../../../../../../lib/yx-desk';

// Helpdesk › Report an accident: the designed HLP-12 report with `live` (desk, or the phone layout on a narrow screen).
// Anyone signed in reports, for themselves or someone else; photos follow the report. The API checks every rule
// (docs/yukthix/helpdesk-design-map.md 4g); the time is sent as India time.
export default function YxReportAccidentPage() {
  const router = useRouter();
  const form = useDesk<AccidentFormData>('/accidents/form');
  const write = useDeskWrite();
  const upload = useDeskUpload();
  return (
    <ReportAccidentScreen
      live={{
        state: deskState(form),
        onRetry: () => void form.refetch(),
        form: form.data ?? null,
        today: new Date(Date.now() + 330 * 60_000 + new Date().getTimezoneOffset() * 60_000),
        onSend: (input) => write<{ id: string; number: string }>('/accidents', 'POST', input),
        onPhoto: async (id, file) => {
          await upload(`/accidents/${encodeURIComponent(id)}/photos`, file);
        },
        onDone: () => router.push('/yx/desk/help'),
      }}
    />
  );
}
