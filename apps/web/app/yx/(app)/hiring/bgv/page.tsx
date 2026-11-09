'use client';

import { useRouter } from 'next/navigation';
import { toCsv } from '@yukthix/ui';
import { BgvTrackerScreen, type LiveBgv, type LiveBgvJoiner } from '@yukthix/ui/hiring';
import { apiFetchBlob } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { saveBlob } from '../../../../../lib/yx-pay';

type Tracker = { partner: null; today: string; viewerId: string | null; deciderOtherPerson: boolean; joiners: LiveBgvJoiner[] };
const enc = encodeURIComponent;

// Hiring › Background checks (HIR-10, founder decision 3): the designed BGV tracker with `live`, on the checks People
// records on each joiner (one store). Manual tracking only: no BGV partner yet. Special data: the API needs the
// background-check key (lifecycle.bgv.manage) in the joiner's scope, refuses while acting and audits each look.
export default function YxHiringBgvPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const q = useLife<Tracker>('/lifecycle/bgv');
  const write = useLifeWrite();
  const status = (q.error as { status?: number } | null)?.status;
  const live: LiveBgv = {
    state: q.isError ? (status === 403 ? 'denied' : 'error') : q.data ? 'ready' : 'loading',
    onRetry: () => void q.refetch(),
    joiners: q.data?.joiners ?? [],
    viewerId: q.data?.viewerId ?? null,
    deciderOtherPerson: q.data?.deciderOtherPerson ?? true,
    today: q.data?.today ?? new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10),
    onAskConsent: (j) => write('POST', `/lifecycle/joiners/${enc(j.id)}/bgv/ask`),
    onAddCheck: (j, checkType, gate) => write('POST', `/lifecycle/joiners/${enc(j.id)}/bgv/checks`, { checkType, gate }),
    onRecord: (_j, k, x) => {
      const form = new FormData();
      form.append('status', x.status);
      form.append('version', String(k.version));
      form.append('checkedOn', x.checkedOn);
      if (x.note) form.append('note', x.note);
      if (x.file) form.append('file', x.file);
      return write('POST', `/lifecycle/bgv/checks/${enc(k.id)}`, form);
    },
    onDecide: (_j, k, x) => write('POST', `/lifecycle/bgv/checks/${enc(k.id)}/decision`, { ...x, version: k.version }),
    onOpenReport: (k) => {
      if (!k.evidence) return;
      const e = k.evidence;
      void apiFetchBlob(`/documents/${enc(e.documentId)}/file?version=${e.version}`, {}, accessToken ?? undefined).then(({ blob, filename }) => saveBlob(blob, filename ?? e.fileName));
    },
    onOpenJoiner: (j) => {
      if (j.journeyId) router.push(`/yx/people/onboarding/${enc(j.journeyId)}`);
    },
    onExport: (rows) => {
      // Results only (no notes or reports): Special data stays in the app.
      const csv = toCsv(
        ['Joiner', 'Designation', 'Joining day', 'Consent', 'Check', 'Result', 'Checked by', 'Checked on', 'Decision'],
        rows.flatMap((j) => (j.checks.length ? j.checks : [null]).map((k) => [j.name, j.designation ?? '', j.joiningOn, j.consent, k?.checkType ?? '', k?.status ?? '', k?.checkedBy ?? '', k?.checkedOn ?? '', k?.decision?.decision ?? ''])),
      );
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'background-checks.csv');
    },
  };
  return <BgvTrackerScreen live={live} />;
}
