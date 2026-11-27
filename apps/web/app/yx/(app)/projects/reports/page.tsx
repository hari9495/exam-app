'use client';

import { useState } from 'react';
import { HoursReportsScreen, type HoursReportData, type HoursReportFilters, type HoursReportKind } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { useProjects, useProjectsDownload } from '../../../../../lib/yx-projects';

// Projects › Reports (PRJ-09), T2-D 60 (answer 2871): hours by person and hours by task, filtered by project, client and
// dates, with CSV export. Project managers see their own projects; the projects reporting key sees all (the API decides).

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function YxHoursReportsPage() {
  const [kind, setKind] = useState<HoursReportKind>('person');
  const [filters, setFilters] = useState<HoursReportFilters>(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 7 * 12);
    return { from: iso(from), to: iso(to), projectId: null, clientId: null };
  });
  const q = new URLSearchParams({ kind, from: filters.from, to: filters.to, ...(filters.projectId ? { projectId: filters.projectId } : {}), ...(filters.clientId ? { clientId: filters.clientId } : {}) }).toString();
  const data = useProjects<HoursReportData>(`/reports/hours?${q}`);
  const download = useProjectsDownload();
  const state = loadState(data);
  return (
    <HoursReportsScreen
      live={{
        state: (data.error as { code?: string } | null)?.code === 'PROJECTS_OFF' ? 'off' : state === 'no-access' ? 'no-access' : state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'ready',
        onRetry: () => void data.refetch(),
        kind,
        onKind: setKind,
        filters,
        onFilters: setFilters,
        data: data.data ?? null,
        onExport: () => download(`/reports/hours?${q}&format=csv`, `hours-by-${kind}-${filters.from}-to-${filters.to}.csv`),
      }}
    />
  );
}
