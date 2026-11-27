'use client';

import { SchedulesScreen, type LiveExportRow, type LiveImportRow, type LiveReportSchedules } from '@yukthix/ui/frame';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { useLibrary, useLibraryDownload, useLibraryWrite } from '../../../../../lib/yx-library';

type Data = Pick<LiveReportSchedules, 'schedules' | 'reports' | 'people'>;

// Analytics › Schedules and exports (ANL-08, G4 answers 2690-2692): library reports emailed on a schedule (each
// recipient's own copy; confidential ones as a link) and, for exports.log.view, the export log and the import log.
export default function YxReportSchedulesPage() {
  const perms = useYxPermissions();
  const data = useLibrary<Data>('/schedules');
  const log = useLibrary<LiveExportRow[]>(perms.has('exports.log.view') ? '/exports' : null);
  // T2-G 46: the import log next to it, same key.
  const imports = useLibrary<LiveImportRow[]>(perms.has('exports.log.view') ? '/imports' : null);
  const write = useLibraryWrite();
  const download = useLibraryDownload();
  return (
    <SchedulesScreen
      library={{
        state: data.isError ? 'error' : data.data ? 'ready' : 'loading',
        onRetry: () => void data.refetch(),
        schedules: data.data?.schedules ?? [],
        reports: data.data?.reports ?? [],
        people: data.data?.people ?? [],
        onCreate: (input) => write('/schedules', input),
        onEnd: (id) => write(`/schedules/${encodeURIComponent(id)}/end`),
        exportLog: log.data ? { rows: log.data, onDownload: () => download('/exports/csv', 'export-log.csv') } : null,
        importLog: imports.data ? { rows: imports.data } : null,
      }}
    />
  );
}
