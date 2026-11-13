'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorState, Spinner } from '@yukthix/ui';
import { ChangesScreen, type ChangeInput, type ChangeRow } from '@yukthix/ui/desk';
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
  | {
      access: true;
      desk: { id: string; name: string };
      desks: { id: string; name: string }[];
      rows: Row[];
      freezes: { date: string; why: string }[];
      window: { weekdayFrom: string; weekdayTo: string; weekends: boolean };
      canRaise: boolean;
      questions: { id: string; label: string; options: { value: string; label: string }[] }[];
      routes: { low: string; medium: string; high: string; emergency: string };
      bannerHours: number | null;
      templates: { id: string; name: string; checklist: string[] }[];
      apps: { id: string; name: string }[];
    };

export default function YxDeskChangesPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [deskId, setDeskId] = useState<string | null>(null);
  const list = useDesk<ChangeList>(deskId ? `/changes?deskId=${encodeURIComponent(deskId)}` : '/changes');
  const write = useDeskWrite();
  const today = new Date();
  if (list.isError) return <ErrorState title="The changes did not load." description="Try again in a moment." onRetry={() => void list.refetch()} />;
  if (!list.data) return <Spinner label="Loading" size="md" />;
  const d = list.data;
  if (!d.access) return <ChangesScreen rows={[]} freezes={[]} today={today} access={false} />;
  return (
    <ChangesScreen
      rows={d.rows.map((r) => ({ ...r, from: new Date(r.from), to: new Date(r.to) }))}
      freezes={d.freezes.map((f) => ({ on: new Date(`${f.date}T00:00:00`), why: f.why }))}
      today={today}
      live={{
        desks: d.desks,
        deskId: d.desk.id,
        onDesk: setDeskId,
        canRaise: d.canRaise,
        onOpen: (id) => router.push(`/yx/desk/changes/${encodeURIComponent(id)}`),
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
        windowText: `weekdays ${d.window.weekdayFrom} to ${d.window.weekdayTo}${d.window.weekends ? ', and weekends' : ''}`,
        onSubmit: (input: ChangeInput) => write<{ id: string; number: string; stage: string }>('/changes', 'POST', { deskId: d.desk.id, ...input }),
      }}
    />
  );
}
