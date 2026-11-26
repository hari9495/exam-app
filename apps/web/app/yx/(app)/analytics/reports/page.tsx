'use client';

import { useRouter } from 'next/navigation';
import { ReportLibraryScreen, type LiveReportRow } from '@yukthix/ui/frame';
import { useLibrary, useLibraryWrite } from '../../../../../lib/yx-library';

// Analytics › Report library (ANL-06, G4 item 14): the area reports this person may open, grouped by question, with
// favourites. Each report opens on its own area page (which checks its key again).
export default function YxReportLibraryPage() {
  const router = useRouter();
  const reports = useLibrary<LiveReportRow[]>('/reports');
  const write = useLibraryWrite();
  return (
    <ReportLibraryScreen
      live={{
        state: reports.isError ? 'error' : reports.data ? 'ready' : 'loading',
        onRetry: () => void reports.refetch(),
        reports: reports.data ?? [],
        onFavourite: (id, on) => write(`/reports/${encodeURIComponent(id)}/favourite`, { on }),
        onOpen: (href) => router.push(href),
      }}
    />
  );
}
