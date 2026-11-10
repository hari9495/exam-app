'use client';

import { VisitorLogScreen, type VisitView } from '@yukthix/ui/visitors';
import { loadState } from '../../../../../lib/yx-org';
import { useOpenVisitorIdImage, useVisitorLogCsv, useVisitors } from '../../../../../lib/yx-visitors';

// Visitors › Visitor log (VIS-04): the locations the log or desk key reaches, with the day each visit is deleted (608);
// "Export for audit" downloads it as CSV (no mobile numbers).
export default function YxVisitorLogPage() {
  const log = useVisitors<{ locations: { value: string; label: string }[]; visits: VisitView[] }>('/log');
  const csv = useVisitorLogCsv();
  const openId = useOpenVisitorIdImage();
  return (
    <VisitorLogScreen
      log={[]}
      today={new Date()}
      live={{ state: loadState(log), onRetry: () => void log.refetch(), visits: log.data?.visits ?? [], locations: log.data?.locations ?? [], onExport: () => csv(), onOpenIdImage: openId }}
    />
  );
}
