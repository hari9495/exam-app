'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { AbscondingTimeline, DispatchProofDialog, StartAbscondingDialog, StopAbscondingDialog } from '@yukthix/ui/frame';
import type { AbscondingRow } from '@yukthix/ui/lifecycle';
import { todayIst, loadState } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

const id = encodeURIComponent;
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const NOTICE: Record<string, string> = { notice_1: 'Notice 1', notice_2: 'Notice 2' };

// People › Absconding (PPL-24, design audit step 3; LIFE-5.05, YX-LC-17): the company's timeline for unauthorised
// absence, one person at a time: salary hold and alert, two notices with dispatch proof, then deemed abandonment.
// The start, stop and dispatch-proof dialogs are the PPL-24 designed ones.
export default function YxAbscondingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const data = useLife<{ today: string; rows: AbscondingRow[] }>('/lifecycle/absconding');
  const places = useJoinerPlaces(true);
  const write = useLifeWrite();
  const today = data.data?.today ?? todayIst();
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState<AbscondingRow | null>(null);
  const [dispatch, setDispatch] = useState<{ r: AbscondingRow; key: string } | null>(null);
  return (
    <AbscondingTimeline
      today={day(today)}
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        rows: data.data?.rows ?? [],
        onStart: () => setStarting(true),
        onStop: (r) => setStopping(r),
        onResume: async (r) => {
          await write('POST', `/lifecycle/absconding/${id(r.id)}/resume`, { version: r.version });
          toast({ tone: 'success', title: `The timeline for ${r.name} runs again` });
        },
        onDispatch: (r, key) => setDispatch({ r, key }),
        onOpenExit: (exitCaseId) => router.push(`/yx/people/exits/${id(exitCaseId)}`),
        children: (
          <>
            {starting && (
              <StartAbscondingDialog
                people={places.managers}
                today={day(today)}
                onStart={async (employeeId, lastPresentOn) => {
                  await write('POST', '/lifecycle/absconding', { employeeId, lastPresentOn });
                  toast({ tone: 'success', title: `Absconding timeline started for ${places.managers.find((m) => m.value === employeeId)?.label.split(',')[0] ?? 'the employee'}` });
                }}
                onClose={() => setStarting(false)}
              />
            )}
            {stopping && (
              <StopAbscondingDialog
                name={stopping.name}
                onStop={async (reason) => {
                  await write('POST', `/lifecycle/absconding/${id(stopping.id)}/stop`, { reason, version: stopping.version });
                  toast({ tone: 'success', title: `The timeline for ${stopping.name} is stopped` });
                }}
                onClose={() => setStopping(null)}
              />
            )}
            {dispatch && (
              <DispatchProofDialog
                name={dispatch.r.name}
                notice={NOTICE[dispatch.key] ?? 'the notice'}
                onSave={async (ref) => {
                  await write('PUT', `/lifecycle/absconding/${id(dispatch.r.id)}/steps/${id(dispatch.key)}/dispatch`, { ref, version: dispatch.r.version });
                  toast({ tone: 'success', title: `Dispatch proof saved for ${dispatch.r.name}` });
                }}
                onClose={() => setDispatch(null)}
              />
            )}
          </>
        ),
      }}
    />
  );
}
