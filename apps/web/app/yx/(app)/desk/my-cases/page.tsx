'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner, useToast } from '@yukthix/ui';
import { MyCasesScreen, type AskedQuestion, type AskedQuestionDetail, type MyCaseDetail, type MyCaseRow } from '@yukthix/ui/desk';
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
  // HLP-12 (founder answer 45): accidents the person reported, status only.
  const accidents = useDesk<MyCaseRow[]>('/accidents/mine');
  const cases = [...(list.data ?? []), ...(accidents.data ?? [])];
  const accident = cases.find((c) => c.id === openId)?.kind === 'accident';
  const one = useDesk<MyCaseDetail>(openId && list.data && accidents.data ? (accident ? `/accidents/mine/${id(openId)}` : `/my/cases/${id(openId)}`) : null);
  const write = useDeskWrite();
  // Batch F item 33 (answer 2573): questions from my team that I answer as their manager (?asked=<id> opens one).
  const askedId = params.get('asked');
  const asked = useDesk<AskedQuestion[]>('/my/asked');
  const askedOne = useDesk<AskedQuestionDetail>(askedId ? `/my/asked/${id(askedId)}` : null);
  const upload = useDeskUpload();
  const download = useDeskDownload();
  return (
    <MyCasesScreen
      live={{
        state: deskState(list, accidents),
        onRetry: () => void Promise.all([list.refetch(), accidents.refetch()]),
        today: todayIst(),
        cases,
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
        asked: asked.data
          ? {
              rows: asked.data,
              openId: askedId,
              onOpen: (q) => router.replace(q ? `/yx/desk/my-cases?asked=${id(q)}` : '/yx/desk/my-cases'),
              detail: askedOne.data ?? null,
              onAnswer: async (q, text, solve) => {
                await write(`/my/asked/${id(q)}/answer`, 'POST', { text, solve });
              },
            }
          : undefined,
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
