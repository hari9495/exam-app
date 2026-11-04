'use client';

import { ReportMisconductScreen, type MisconductReportInput, type MyMisconductReport } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

// Helpdesk › Report misconduct (HLP-08 answer 55): a manager reports misconduct by one of their own reports to HR. It
// reaches HR in scope as a draft disciplinary case; the manager sees only received, opened or declined. The API checks
// the reporting line (docs/yukthix/helpdesk-design-map.md 4f).
export default function YxReportMisconductPage() {
  const people = useDesk<{ people: { id: string; name: string; email: string }[] }>('/my/misconduct-reports/people');
  const reports = useDesk<MyMisconductReport[]>('/my/misconduct-reports');
  const write = useDeskWrite();
  return (
    <ReportMisconductScreen
      live={{
        state: deskState(people, reports),
        onRetry: () => void (people.refetch(), reports.refetch()),
        today: todayIst(),
        people: people.data?.people ?? [],
        reports: reports.data ?? [],
        onFile: (input: MisconductReportInput) => write<{ id: string; ref: string }>('/my/misconduct-reports', 'POST', input),
      }}
    />
  );
}
