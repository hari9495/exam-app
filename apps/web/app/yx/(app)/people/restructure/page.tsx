'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner, useToast } from '@yukthix/ui';
import { RestructureWizard, type FinishedRestructure, type RestructureDraftState, type RestructurePreview, type RestructureSetup } from '@yukthix/ui/frame';
import type { LetterTemplates } from '@yukthix/ui/lifecycle';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { useJoinerPlaces, useLife } from '../../../../../lib/yx-lifecycle';

const id = encodeURIComponent;

// People › Restructure (PPL-09): HR plans a bulk move inside a legal entity or between legal entities; every person is
// checked by the API (a dry run through the change engine) and the plan goes for one approval by another HR person
// (founder decision 21 Oct 2026: payroll does no HR work). Open restructures, the person's saved drafts and the finished
// restructures (done, rejected, cancelled: back to the record) are listed at the top; ?draft= continues a saved draft.
function Restructure() {
  const router = useRouter();
  const { toast } = useToast();
  const perms = useYxPermissions();
  const canPlan = perms.has('employee.change.manage');
  const draftId = useSearchParams()?.get('draft') ?? null;
  const setup = usePeople<RestructureSetup>(canPlan ? '/restructures/setup' : null);
  const drafts = usePeople<{ id: string; title: string; updatedAt: string }[]>(canPlan ? '/restructures/drafts' : null);
  const finished = usePeople<FinishedRestructure[]>(canPlan ? '/restructures?status=finished' : null);
  const draft = usePeople<{ id: string; state: RestructureDraftState }>(canPlan && draftId ? `/restructures/drafts/${id(draftId)}` : null);
  const templates = useLife<LetterTemplates>(canPlan ? '/letters/templates' : null);
  const letterTypes = [...new Map((templates.data?.templates ?? []).filter((t) => t.status === 'active').map((t) => [t.letterType, { value: t.letterType, label: t.name }])).values()];
  const places = useJoinerPlaces(canPlan);
  const write = usePeopleWrite();
  // A new wizard after "Save and exit" (the start page again, empty).
  const [round, setRound] = useState(0);
  const waiting = draftId && !draft.data && !draft.isError;
  return (
    <RestructureWizard
      key={`${draftId ?? 'new'}-${round}-${waiting ? 'wait' : 'ready'}`}
      live={{
        state: setup.isError ? 'error' : setup.data && !waiting ? 'ready' : 'loading',
        onRetry: () => void setup.refetch(),
        setup: waiting ? null : (setup.data ?? null),
        people: places.managers.map((m) => ({ id: m.value, name: m.label.split(',')[0], role: m.label.split(', ').slice(1).join(', ') || undefined })),
        letterTypes,
        drafts: drafts.data ?? [],
        // Hidden if it cannot load (the wizard still works).
        finished: finished.isError ? undefined : (finished.data ?? null),
        draft: draft.data ?? null,
        // "Pick people": the entity's employees from the directory (People › Directory reads the same list).
        onEntityPeople: async (e) =>
          (await write<{ rows: { id: string; kind: string; name: string; employeeCode?: string; location: { id: string; name: string | null } | null }[] }>('GET', `/workforce?legalEntityId=${id(e)}`)).rows
            .filter((r) => r.kind === 'employee')
            .map((r) => ({ id: r.id, name: r.name, code: r.employeeCode ?? '', locationId: r.location?.id ?? null, location: r.location?.name ?? null })),
        onPreview: (input) => write<RestructurePreview>('POST', '/restructures/preview', input),
        onSend: async (input, title) => {
          const out = await write<{ id: string }>('POST', '/restructures', input);
          toast({ tone: 'success', title: `${title} sent for approval` });
          router.push(`/yx/people/restructure/${id(out.id)}`);
        },
        onOpen: (r) => router.push(`/yx/people/restructure/${id(r)}`),
        onSaveDraft: async (state, title, existing) => {
          const body = { title, state };
          await (existing ? write('PUT', `/restructures/drafts/${id(existing)}`, body) : write('POST', '/restructures/drafts', body));
          toast({ tone: 'success', title: `${title} saved`, description: 'Continue it from Restructure.' });
          if (draftId) router.push('/yx/people/restructure');
          else setRound((n) => n + 1);
        },
        onContinueDraft: (d) => router.push(`/yx/people/restructure?draft=${id(d)}`),
        onDeleteDraft: async (d) => {
          await write('DELETE', `/restructures/drafts/${id(d)}`);
          toast({ tone: 'success', title: 'Draft deleted' });
        },
        onOpenPayroll: (run) => router.push(`/yx/payroll/runs/${id(run)}`),
      }}
    />
  );
}

export default function YxRestructurePage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <Restructure />
    </Suspense>
  );
}
