'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner, useToast } from '@yukthix/ui';
import { PolicyLibraryScreen, type MyPolicy, type MyPolicyRow } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskDownload, useDeskWrite } from '../../../../../lib/yx-desk';

const id = encodeURIComponent;

// Helpdesk › Policies: the designed HLP-10 policy library with `live`. The person's own policies (the ones whose audience
// covers their job today), the exact current version and the acknowledgement. ?policy=<id> opens one (notices link
// there). The API checks every rule (audience, current version, once, typed name, one-time code).
function Policies() {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get('policy');
  const { toast } = useToast();
  const list = useDesk<{ policies: MyPolicyRow[]; typedName: boolean; managerAfterDays: number | null }>('/my/policies');
  const one = useDesk<MyPolicy>(openId ? `/my/policies/${id(openId)}` : null);
  const write = useDeskWrite();
  const download = useDeskDownload();
  return (
    <PolicyLibraryScreen
      live={{
        state: deskState(list),
        onRetry: () => void list.refetch(),
        policies: list.data?.policies ?? [],
        managerAfterDays: list.data?.managerAfterDays ?? null,
        openId,
        onOpen: (p) => (p && p === openId ? void one.refetch() : router.replace(p ? `/yx/desk/policies?policy=${id(p)}` : '/yx/desk/policies')),
        policy: one.data ?? null,
        policyState: openId ? deskState(one) : undefined,
        onAcknowledge: async (p, input) => {
          await write(`/my/policies/${id(p)}/acknowledge`, 'POST', input);
        },
        onSendCode: (p, versionId) => write<{ to: string; minutes: number }>(`/my/policies/${id(p)}/versions/${id(versionId)}/code`, 'POST'),
        onOpenFile: (p, f) => void download(`/my/policies/${id(p)}/files/${id(f)}`).catch((e: Error) => toast({ title: e.message })),
        onBack: () => router.push('/yx'),
      }}
    />
  );
}

export default function YxPoliciesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Policies />
    </Suspense>
  );
}
