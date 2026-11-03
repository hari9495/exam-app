'use client';

import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { CaseWorkspaceScreen, type CaseDetail } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskDownload, useDeskUpload, useDeskWrite } from '../../../../../../lib/yx-desk';

const enc = encodeURIComponent;
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

// Helpdesk › Cases › one case: the designed HLP-08 case workspace with `live`. Members only: anyone else gets the same
// "Not found" as a missing case. Every step (notice, delay, reply time, outcome and its second officer, the IC report,
// relief and its HR task, members, stepping aside, files) is checked again by the API (helpdesk-design-map.md 4f).
export default function YxCasePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const one = useDesk<CaseDetail>(`/cases/${enc(id)}`);
  const write = useDeskWrite();
  const upload = useDeskUpload();
  const download = useDeskDownload();
  const err = one.error as { status?: number } | null;
  const base = `/cases/${enc(id)}`;
  const post = async (path: string, body?: unknown) => {
    await write(`${base}${path}`, 'POST', body);
  };
  return (
    <CaseWorkspaceScreen
      live={{
        state: err?.status === 404 ? 'not-found' : deskState(one),
        onRetry: () => void one.refetch(),
        today: todayIst(),
        detail: one.data ?? null,
        onBack: () => router.push('/yx/desk/cases'),
        onSendNotice: (_c, input) => post('/notice', input),
        onDelayNotice: (_c, input) => post('/notice/delay', input),
        onDecideMoreTime: (_c, input) => post('/more-time', input),
        onPropose: (_c, input) => post('/outcome', input),
        onApprove: (_c, version) => post('/outcome/approve', { version }),
        onSendBack: (_c, note, version) => post('/outcome/send-back', { note, version }),
        onSaveIcReport: (_c, input) => post('/ic-report', input),
        onVote: (_c, input) => post('/ic-report/vote', { vote: input.vote, ...(input.note ? { note: input.note } : {}) }),
        onSign: (_c, version) => post('/ic-report/sign', { version }),
        onRelief: (_c, input) => write<{ taskRef: string }>(`${base}/relief`, 'POST', input),
        onReliefDone: (_c, reliefId) => post(`/relief/${enc(reliefId)}/done`),
        onRecuse: async (_c, reason) => {
          await post('/recuse', { reason });
          router.push('/yx/desk/cases');
        },
        onAddMember: (_c, input) => post('/members', input),
        onUpload: async (_c, file) => {
          await upload(`${base}/files`, file);
        },
        onOpenFile: (_c, f) => void download(`${base}/files/${enc(f)}`).catch((e: Error) => toast({ title: e.message })),
        onSendMessage: (_c, body) => post('/messages', { body }),
      }}
    />
  );
}
