'use client';

import { AppealsScreen, type LiveAppealRow } from '@yukthix/ui/assessments';
import { useAuth } from '../../../../../../lib/auth-context';
import { apiFetch } from '../../../../../../lib/api-client';
import { decodeJwtPayload } from '../../../../../../lib/jwt';
import { useApi, useApiWrite } from '../../../../../../lib/yx-hiring';
import { loadState } from '../../../../../../lib/yx-assessments';

// Assessments AS-5 › Appeals (PRC-18, answer 2012): a candidate's appeal of an integrity decision, decided with a reason
// by someone who did not give the verdict. Overturning asks for the second factor (answer 2006; apiFetch asks).
export default function YxAppealsPage() {
  const { accessToken } = useAuth();
  const me = String(decodeJwtPayload(accessToken ?? '')?.sub ?? '');
  const rows = useApi<LiveAppealRow[]>('/asmt/appeals');
  const write = useApiWrite();
  return (
    <AppealsScreen
      live={{
        state: loadState(rows),
        onRetry: () => void rows.refetch(),
        rows: rows.data ?? [],
        me,
        onUphold: async (id, reason) => void (await write('POST', `/asmt/appeals/${id}/uphold`, { reason })),
        onOverturn: async (id, reason) => void (await write('POST', `/asmt/appeals/${id}/overturn`, { reason })),
        // Answer 2264: the appeal's file through an audited short-lived link.
        onEvidence: async (id) => {
          const { url } = await apiFetch(`/asmt/appeals/${id}/evidence`, {}, accessToken ?? undefined);
          window.open(url, '_blank', 'noopener');
        },
      }}
    />
  );
}
