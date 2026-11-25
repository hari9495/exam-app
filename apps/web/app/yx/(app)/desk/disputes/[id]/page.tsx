'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@yukthix/ui';
import { CollectiveDisputeScreen, type DisputeDetail } from '@yukthix/ui/desk';
import { useAuth } from '../../../../../../lib/auth-context';
import { apiFetch } from '../../../../../../lib/api-client';
import { deskState, useDesk, useDeskDownload, useDeskWrite } from '../../../../../../lib/yx-desk';

const enc = encodeURIComponent;
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

// Helpdesk › Cases › a collective dispute: the designed HLP-13 workspace with `live`. Only the industrial relations team
// sees it; anyone else gets the same "Not found" as a missing dispute. Every step is checked again by the API
// (docs/yukthix/helpdesk-design-map.md 4h).
export default function YxDisputePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const one = useDesk<DisputeDetail>(`/disputes/${enc(id)}`);
  const write = useDeskWrite();
  const download = useDeskDownload();
  const err = one.error as { status?: number } | null;
  const base = `/disputes/${enc(id)}`;
  const post = async (path: string, body?: unknown) => {
    await write(`${base}${path}`, 'POST', body);
  };
  return (
    <CollectiveDisputeScreen
      live={{
        state: err?.status === 404 ? 'not-found' : deskState(one),
        onRetry: () => void one.refetch(),
        today: todayIst(),
        detail: one.data ?? null,
        onBack: () => router.push('/yx/desk/cases'),
        onDemand: (input) => post('/demands', input),
        onDemandUpdate: (demandId, input) => post(`/demands/${enc(demandId)}`, input),
        onMeeting: (input) => post('/meetings', input),
        onPaper: async (title, file) => {
          const body = new FormData();
          body.append('title', title);
          body.append('file', file);
          const r = (await apiFetch(`/desk${base}/papers`, { method: 'POST', body }, accessToken ?? undefined)) as { id: string };
          await queryClient.invalidateQueries({ queryKey: ['desk'] });
          return r;
        },
        onOpenFile: (f) => void download(`${base}/files/${enc(f)}`).catch((e: Error) => toast({ title: e.message })),
        onPropose: (input) => post('/settlement', input),
        onApprove: () => post('/settlement/approve'),
        onSendBack: (reason) => post('/settlement/send-back', { reason }),
        onFiled: (input) => post('/filed', input),
        onClose: (input) => post('/close', input),
      }}
    />
  );
}
