'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@yukthix/ui';
import { AccidentWorkspaceScreen, type AccidentDetail, type AccidentManagerView, type EsicFormView } from '@yukthix/ui/desk';
import { useAuth } from '../../../../../../lib/auth-context';
import { apiFetch } from '../../../../../../lib/api-client';
import { deskState, useDesk, useDeskDownload, useDeskWrite } from '../../../../../../lib/yx-desk';

const enc = encodeURIComponent;
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

// Helpdesk › Cases › an accident: the designed HLP-12 workspace with `live`. The safety team and the case's HR handler
// see the whole case; the injured employee's manager sees leave dates only; anyone else gets the same "Not found" as a
// missing case. Every step is checked again by the API (docs/yukthix/helpdesk-design-map.md 4g).
export default function YxAccidentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const one = useDesk<AccidentDetail | AccidentManagerView>(`/accidents/${enc(id)}`);
  const write = useDeskWrite();
  const download = useDeskDownload();
  const err = one.error as { status?: number } | null;
  const base = `/accidents/${enc(id)}`;
  const post = async (path: string, body?: unknown) => {
    await write(`${base}${path}`, 'POST', body);
  };
  return (
    <AccidentWorkspaceScreen
      live={{
        state: err?.status === 404 ? 'not-found' : deskState(one),
        onRetry: () => void one.refetch(),
        today: todayIst(),
        detail: one.data ?? null,
        onBack: () => router.push('/yx/desk/cases'),
        onFacts: (input) => post('/facts', input),
        onStatement: (input) => post('/statements', input),
        onFiled: (input) => post(one.data?.view === 'team' && one.data.injured.kind === 'contract' ? '/contractor-filed' : '/esic-filed', input),
        onEc: (input) => post('/ec', input),
        onEcPaid: (input) => post('/ec-paid', input),
        onMedical: async (input, file) => {
          const body = new FormData();
          body.append('kind', input.kind);
          body.append('note', input.note);
          if (file) body.append('file', file);
          await apiFetch(`/desk${base}/medical`, { method: 'POST', body }, accessToken ?? undefined);
          await queryClient.invalidateQueries({ queryKey: ['desk'] });
        },
        onOpenFile: (f) => void download(`${base}/files/${enc(f)}`).catch((e: Error) => toast({ title: e.message })),
        onEsicForm: () => apiFetch(`/desk${base}/esic-form`, {}, accessToken ?? undefined) as Promise<EsicFormView>,
        onClose: () => post('/close'),
      }}
    />
  );
}
