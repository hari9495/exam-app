'use client';

import { useRouter } from 'next/navigation';
import { IcConsoleScreen, type CaseListRow, type LiveIcConsole } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskDownload, useDeskWrite } from '../../../../../lib/yx-desk';

// Helpdesk › Internal Committee: the designed CMP-11 console with `live` (batch F item 13). Only the committee's own
// members (everyone else gets not found, 404, from the API); the committee and the POSH complaints the member is on.
// Answer 2593: the awareness log and this year's annual report; only the presiding officer moves the report on (API: 403).
// Answer 2621: every member downloads the report as a PDF.
export default function YxIcConsolePage() {
  const router = useRouter();
  const ic = useDesk<{ company: string; members: LiveIcConsole['members']; awareness: NonNullable<LiveIcConsole['awareness']>; reports: NonNullable<LiveIcConsole['reports']> }>('/speakup/ic');
  const write = useDeskWrite();
  const download = useDeskDownload();
  const list = useDesk<(CaseListRow & { filedOn?: string | null })[]>(ic.data ? '/cases' : null);
  const notMember = (ic.error as { status?: number } | null)?.status === 404;
  return (
    <IcConsoleScreen
      today={new Date()}
      live={{
        state: notMember ? 'no-access' : deskState(ic, list),
        onRetry: () => void Promise.all([ic.refetch(), list.refetch()]),
        company: ic.data?.company ?? '',
        members: ic.data?.members ?? [],
        cases: (list.data ?? []).filter((c) => c.kind === 'posh').map((c) => ({ id: c.id, ref: c.ref, filedOn: c.filedOn ?? null, location: c.location, stage: c.stage, next: c.next, overdue: c.overdue, status: c.status })),
        onOpen: (c) => router.push(`/yx/desk/cases/${encodeURIComponent(c)}`),
        awareness: ic.data?.awareness ?? [],
        reports: ic.data?.reports ?? [],
        onLog: async (input) => {
          await write('/speakup/ic/awareness', 'POST', input);
        },
        // Answer 2621: the annual report as a PDF (members of that committee only; the API checks).
        onPdf: (committeeId, year) => download(`/speakup/ic/report/pdf?year=${year}${committeeId ? `&committeeId=${encodeURIComponent(committeeId)}` : ''}`, `ic-annual-report-${year}.pdf`),
        onReportStep: async ({ committeeId, ...rest }) => {
          await write('/speakup/ic/report', 'POST', { ...rest, ...(committeeId ? { committeeId } : {}) });
        },
      }}
    />
  );
}
