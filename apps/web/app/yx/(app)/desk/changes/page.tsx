'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ErrorState, Spinner } from '@yukthix/ui';
import { ChangesScreen, type ChangeInput, type ChangeRow, type ItsmReportView } from '@yukthix/ui/desk';
import { apiFetchBlob } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { saveBlob } from '../../../../../lib/yx-pay';
import { useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Helpdesk ITSM-2 (docs/yukthix/helpdesk-itsm-plan.md; answers 1932-1937, 1943): an IT desk's changes, the freeze days
// of the next two weeks, the New change drawer and the change audit export. Only the desk's agents, leads and admins
// see it; requesters never do (the API answers 403 or 404).
type Row = Omit<ChangeRow, 'from' | 'to'> & { from: string; to: string };
type ChangeList =
  | { access: false }
  | { access: true; asked: true; rows: Row[]; freezes: { date: string; why: string }[] }
  | {
      access: true;
      asked?: undefined;
      desk: { id: string; name: string };
      desks: { id: string; name: string }[];
      rows: Row[];
      freezes: { date: string; why: string }[];
      window: { weekdayFrom: string; weekdayTo: string; weekends: boolean };
      canRaise: boolean;
      questions: { id: string; label: string; options: { value: string; label: string }[] }[];
      routes: { low: string; medium: string; high: string; emergency: string };
      bannerHours: number | null;
      noticeScope: 'all' | 'location' | 'application';
      locations: { id: string; name: string }[];
      templates: { id: string; name: string; checklist: string[] }[];
      apps: { id: string; name: string }[];
    };

function YxDeskChangesPageInner() {
  const router = useRouter();
  // Answer 2058: from a problem, the New change drawer opens with the problem linked.
  const problemId = useSearchParams()?.get('problem') ?? null;
  const problem = useDesk<{ id: string; number: string; title: string; state: string }>(problemId ? `/problems/${encodeURIComponent(problemId)}` : null);
  const { accessToken } = useAuth();
  const [deskId, setDeskId] = useState<string | null>(null);
  const list = useDesk<ChangeList>(deskId ? `/changes?deskId=${encodeURIComponent(deskId)}` : '/changes');
  const write = useDeskWrite();
  const today = new Date();
  // ITSM-4: the desk's report for the last 90 days (India dates).
  const day = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const reportDesk = list.data?.access && !list.data.asked ? list.data.desk.id : null;
  const report = useDesk<Omit<ItsmReportView, 'period'>>(reportDesk ? `/itsm/report?deskId=${encodeURIComponent(reportDesk)}&from=${day(new Date(Date.now() - 89 * 86_400_000))}&to=${day(new Date())}` : null);
  if (list.isError) return <ErrorState title="The changes did not load." description="Try again in a moment." onRetry={() => void list.refetch()} />;
  if (!list.data || (problemId && !problem.data && !problem.isError)) return <Spinner label="Loading" size="md" />;
  const d = list.data;
  if (!d.access) return <ChangesScreen rows={[]} freezes={[]} today={today} access={false} />;
  const open = (id: string) => router.push(`/yx/desk/changes/${encodeURIComponent(id)}`);
  // Answer 1953: the change board, application owners and approvers see only the changes they are asked about.
  if (d.asked) return <ChangesScreen asked rows={d.rows.map((r) => ({ ...r, from: new Date(r.from), to: new Date(r.to) }))} freezes={d.freezes.map((f) => ({ on: new Date(`${f.date}T00:00:00`), why: f.why }))} today={today} onOpen={open} />;
  return (
    <ChangesScreen
      report={report.data ? { ...report.data, period: 'the last 90 days' } : undefined}
      rows={d.rows.map((r) => ({ ...r, from: new Date(r.from), to: new Date(r.to) }))}
      freezes={d.freezes.map((f) => ({ on: new Date(`${f.date}T00:00:00`), why: f.why }))}
      today={today}
      newOpen={Boolean(problem.data && problem.data.state !== 'closed')}
      live={{
        desks: d.desks,
        deskId: d.desk.id,
        onDesk: setDeskId,
        canRaise: d.canRaise,
        onOpen: open,
        onExport: async (format, from, to) => {
          const { blob, filename } = await apiFetchBlob(`/desk/changes/export?deskId=${encodeURIComponent(d.desk.id)}&from=${from}&to=${to}&format=${format}`, {}, accessToken ?? undefined);
          saveBlob(blob, filename ?? `changes-${from}-to-${to}.${format}`);
        },
        deskName: d.desk.name,
        questions: d.questions,
        templates: d.templates,
        apps: d.apps,
        routes: d.routes,
        bannerHours: d.bannerHours,
        noticeScope: d.noticeScope,
        locations: d.locations,
        problem: problem.data && problem.data.state !== 'closed' ? { id: problem.data.id, number: problem.data.number, title: problem.data.title } : null,
        windowText: `weekdays ${d.window.weekdayFrom} to ${d.window.weekdayTo}${d.window.weekends ? ', and weekends' : ''}`,
        onSubmit: (input: ChangeInput) => write<{ id: string; number: string; stage: string }>('/changes', 'POST', { deskId: d.desk.id, ...input }),
      }}
    />
  );
}

export default function YxDeskChangesPage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <YxDeskChangesPageInner />
    </Suspense>
  );
}
