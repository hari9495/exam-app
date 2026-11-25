'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TimesheetCorrectionScreen, type LiveCorrectionFacts, type LiveCorrectionLine, type LiveProjectRow } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../../lib/yx-org';
import { lastMonths, useProjects, useProjectsWrite } from '../../../../../../lib/yx-projects';

// Projects › Correct invoiced time (PRJ-06), Projects P-6 (answer 1416): Projects finance picks a time-and-material
// project's approved line and corrects it; billed time makes a credit note or a supplementary invoice, a locked month an
// adjustment, and pay recovery follows the company setting.
export default function YxCorrectionPage() {
  const router = useRouter();
  const months = lastMonths(12);
  const [month, setMonth] = useState(months[1]!);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [lineId, setLineId] = useState<string | null>(null);
  const projects = useProjects<{ rows: LiveProjectRow[] }>('');
  const lines = useProjects<LiveCorrectionLine[]>(projectId ? `/billing/lines?projectId=${encodeURIComponent(projectId)}&month=${month}` : null);
  const facts = useProjects<LiveCorrectionFacts>(lineId ? `/billing/lines/${encodeURIComponent(lineId)}` : null);
  const write = useProjectsWrite();
  const shown = lineId ? facts : projectId ? lines : projects;
  const state = loadState(shown);
  return (
    <TimesheetCorrectionScreen
      live={{
        state: (shown.error as { code?: string } | null)?.code === 'PROJECTS_OFF' ? 'off' : state === 'no-access' ? 'no-access' : state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'ready',
        onRetry: () => void shown.refetch(),
        pick: {
          projects: (projects.data?.rows ?? []).filter((p) => p.billingModel === 'time_material').map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` })),
          projectId,
          onProject: setProjectId,
          months,
          month,
          onMonth: setMonth,
          lines: lines.data ?? null,
          onPick: setLineId,
        },
        facts: lineId ? (facts.data ?? null) : null,
        onCorrect: (hours, reason) => write('POST', `/billing/lines/${encodeURIComponent(lineId!)}/correct`, { hours, reason }),
        onBack: () => (lineId ? setLineId(null) : router.push('/yx/projects/billing')),
      }}
    />
  );
}
