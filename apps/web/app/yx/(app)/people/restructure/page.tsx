'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { RestructureWizard, type RestructurePreview, type RestructureSetup } from '@yukthix/ui/frame';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { useJoinerPlaces } from '../../../../../lib/yx-lifecycle';

const id = encodeURIComponent;

// People › Restructure (PPL-09): HR plans a bulk move inside a legal entity or between legal entities; every person is
// checked by the API (a dry run through the change engine) and the plan goes for one approval by another HR person
// (founder decision 21 Oct 2026: payroll does no HR work). Open restructures are listed at the top.
export default function YxRestructurePage() {
  const router = useRouter();
  const { toast } = useToast();
  const perms = useYxPermissions();
  const canPlan = perms.has('employee.change.manage');
  const setup = usePeople<RestructureSetup>(canPlan ? '/restructures/setup' : null);
  const places = useJoinerPlaces(canPlan);
  const write = usePeopleWrite();
  return (
    <RestructureWizard
      live={{
        state: setup.isError ? 'error' : setup.data ? 'ready' : 'loading',
        onRetry: () => void setup.refetch(),
        setup: setup.data ?? null,
        people: places.managers.map((m) => ({ id: m.value, name: m.label.split(',')[0], role: m.label.split(', ').slice(1).join(', ') || undefined })),
        onPreview: (input) => write<RestructurePreview>('POST', '/restructures/preview', input),
        onSend: async (input, title) => {
          const out = await write<{ id: string }>('POST', '/restructures', input);
          toast({ tone: 'success', title: `${title} sent for approval` });
          router.push(`/yx/people/restructure/${id(out.id)}`);
        },
        onOpen: (r) => router.push(`/yx/people/restructure/${id(r)}`),
      }}
    />
  );
}
