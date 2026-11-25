'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { PolicyWriterScreen, type WriterDraft, type WriterHome } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

const id = encodeURIComponent;

// Helpdesk › Write policies with AI: the designed HLP-14 PolicyWriterScreen with `live`. A policy manager (policy.manage
// for the whole company) answers the questionnaire; the company's AI (or a YukthiX starter when AI is off) drafts the
// prose; the law check runs on the server and blocks approval; approving sends the text to Policy admin, where a second
// person publishes it. ?draft=<id> opens a draft. The API checks every rule.
function PolicyWriterPage() {
  const router = useRouter();
  const draftId = useSearchParams().get('draft');
  const home = useDesk<WriterHome>('/policy-writer');
  const draft = useDesk<WriterDraft>(draftId ? `/policy-writer/drafts/${id(draftId)}` : null);
  const write = useDeskWrite();
  const openDraft = (d: string | null) => router.replace(d ? `/yx/desk/policy-writer?draft=${id(d)}` : '/yx/desk/policy-writer');
  return (
    <PolicyWriterScreen
      live={{
        state: deskState(home),
        onRetry: () => void (draftId ? draft.refetch() : home.refetch()),
        home: home.data ?? null,
        draftId,
        draft: draft.data ?? null,
        draftState: draftId ? deskState(draft) : undefined,
        onOpenDraft: (d) => {
          if (!d) void home.refetch();
          openDraft(d);
        },
        onGenerate: (input) => write<{ id: string }>('/policy-writer/drafts', 'POST', input),
        onSave: (d, input) => write<{ version: number }>(`/policy-writer/drafts/${id(d)}`, 'PUT', input),
        onApprove: (d, version) => write<{ policyId: string; code: string; title: string; number: number }>(`/policy-writer/drafts/${id(d)}/approve`, 'POST', { version }),
        onOpenPolicy: (p) => router.push(`/yx/desk/policy-admin?policy=${id(p)}`),
        onDiscard: async (d, version) => {
          await write(`/policy-writer/drafts/${id(d)}/discard`, 'POST', { version });
        },
      }}
    />
  );
}

export default function YxPolicyWriterPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <PolicyWriterPage />
    </Suspense>
  );
}
