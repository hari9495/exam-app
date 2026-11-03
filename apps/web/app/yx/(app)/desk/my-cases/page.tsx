'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner, useToast } from '@yukthix/ui';
import { MyCasesScreen, type MyCaseDetail, type MyCaseRow } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskDownload, useDeskUpload, useDeskWrite } from '../../../../../lib/yx-desk';

const id = encodeURIComponent;
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

// Helpdesk › My cases: the designed HLP-07 screen with `live`. The person's own part of each case only: as the reporter
// the stage, dates and messages; as the respondent the notice, the papers shared, the reply date and the reply. ?case=<id>
// opens one (notices link there). The API checks every rule (docs/yukthix/helpdesk-design-map.md 4f).
function MyCases() {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get('case');
  const { toast } = useToast();
  const list = useDesk<MyCaseRow[]>('/my/cases');
  const one = useDesk<MyCaseDetail>(openId ? `/my/cases/${id(openId)}` : null);
  const write = useDeskWrite();
  const upload = useDeskUpload();
  const download = useDeskDownload();
  return (
    <MyCasesScreen
      live={{
        state: deskState(list),
        onRetry: () => void list.refetch(),
        today: todayIst(),
        cases: list.data ?? [],
        openId,
        onOpen: (c) => (c && c === openId ? void one.refetch() : router.replace(c ? `/yx/desk/my-cases?case=${id(c)}` : '/yx/desk/my-cases')),
        detail: one.data ?? null,
        detailState: openId ? deskState(one) : undefined,
        onSendMessage: async (c, body) => {
          await write(`/my/cases/${id(c)}/messages`, 'POST', { body });
        },
        onReply: async (c, input) => {
          await write(`/my/cases/${id(c)}/reply`, 'POST', input);
        },
        onAskMoreTime: async (c, reason) => {
          await write(`/my/cases/${id(c)}/more-time`, 'POST', { reason });
        },
        onUpload: async (c, file) => ({ id: (await upload(`/my/cases/${id(c)}/files`, file)).id }),
        onOpenFile: (c, f) => void download(`/my/cases/${id(c)}/files/${id(f)}`).catch((e: Error) => toast({ title: e.message })),
        onSpeakUp: () => router.push('/yx/desk/speakup'),
        onBack: () => router.push('/yx'),
      }}
    />
  );
}

export default function YxMyCasesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <MyCases />
    </Suspense>
  );
}
