'use client';

import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { ExitInterview } from '@yukthix/ui/frame';
import type { ExitWorkspace, InterviewAnswers } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../../../lib/yx-lifecycle';

const id = encodeURIComponent;

// People › Exits › one exit › Exit interview (PPL-21, HR): the leaver's answers and HR's notes, for the confidential exit key only.
export default function YxExitInterviewAnswersPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { id: caseId } = useParams<{ id: string }>();
  const exit = useLife<ExitWorkspace>(`/lifecycle/exits/${id(caseId)}`);
  const data = useLife<InterviewAnswers>(`/lifecycle/exits/${id(caseId)}/interview`);
  const write = useLifeWrite();
  const name = exit.data?.name ?? 'the leaver';
  return (
    <ExitInterview
      live={{
        kind: 'hr',
        // The API answers "not found" to anyone without the confidential exit key.
        state: (data.error as { status?: number } | null)?.status === 404 ? 'no-access' : loadState(exit, data),
        onRetry: () => void Promise.all([exit.refetch(), data.refetch()]),
        name,
        data: data.data ?? null,
        onNotes: async (notes) => {
          await write('PUT', `/lifecycle/exits/${id(caseId)}/interview`, { notes });
          toast({ tone: 'success', title: `Notes on ${name}'s exit interview saved` });
        },
        onBack: () => router.push(`/yx/people/exits/${id(caseId)}`),
      }}
    />
  );
}
