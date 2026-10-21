'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog, DatePicker, FormField, Select, TextArea, TextField, dayKey, useToast } from '@yukthix/ui';
import { AbscondingTimeline } from '@yukthix/ui/frame';
import type { AbscondingRow } from '@yukthix/ui/lifecycle';
import { todayIst } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

const id = encodeURIComponent;
const day = (iso: string) => new Date(`${iso}T00:00:00`);

// People › Absconding (PPL-24, design audit step 3; LIFE-5.05, YX-LC-17): the company's timeline for unauthorised
// absence, one person at a time: salary hold and alert, two notices with dispatch proof, then deemed abandonment.
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
  const [who, setWho] = useState<string | null>(null);
  const [last, setLast] = useState<Date | null>(null);
  const [text, setText] = useState('');
  return (
    <AbscondingTimeline
      today={day(today)}
      live={{
        state: data.isError ? 'error' : data.data ? 'ready' : 'loading',
        onRetry: () => void data.refetch(),
        rows: data.data?.rows ?? [],
        onStart: () => {
          setWho(null);
          setLast(null);
          setStarting(true);
        },
        onStop: (r) => {
          setText('');
          setStopping(r);
        },
        onResume: async (r) => {
          await write('POST', `/lifecycle/absconding/${id(r.id)}/resume`, { version: r.version });
          toast({ tone: 'success', title: `The timeline for ${r.name} runs again` });
        },
        onDispatch: (r, key) => {
          setText('');
          setDispatch({ r, key });
        },
        onOpenExit: (exitCaseId) => router.push(`/yx/people/exits/${id(exitCaseId)}`),
        children: (
          <>
            {starting && (
              <ConfirmDialog
                open
                onOpenChange={(o) => !o && setStarting(false)}
                size="md"
                title="Start an absconding timeline"
                consequence="The steps run on their days. Every step is recorded; you can stop it at any time."
                confirmLabel="Start timeline"
                confirmDisabled={!who || !last}
                onConfirm={async () => {
                  await write('POST', '/lifecycle/absconding', { employeeId: who!, lastPresentOn: dayKey(last!) });
                  setStarting(false);
                  toast({ tone: 'success', title: `Absconding timeline started for ${places.managers.find((m) => m.value === who)?.label.split(',')[0] ?? 'the employee'}` });
                }}
              >
                <FormField id="ab-who" label="Person" required>
                  <Select aria-label="Person" value={who} onChange={setWho} options={places.managers} searchable />
                </FormField>
                <FormField id="ab-last" label="Last day present" required>
                  <DatePicker value={last} onChange={setLast} max={day(today)} aria-label="Last day present" />
                </FormField>
              </ConfirmDialog>
            )}
            {stopping && (
              <ConfirmDialog
                open
                onOpenChange={(o) => !o && setStopping(null)}
                title={`Stop the absconding timeline for ${stopping.name}?`}
                consequence="No further notices go out. Regularise the absence in Time to release the salary hold."
                confirmLabel="Stop timeline"
                confirmDisabled={text.trim().length < 3}
                onConfirm={async () => {
                  await write('POST', `/lifecycle/absconding/${id(stopping.id)}/stop`, { reason: text.trim(), version: stopping.version });
                  toast({ tone: 'success', title: `The timeline for ${stopping.name} is stopped` });
                  setStopping(null);
                }}
              >
                <FormField id="ab-why" label="Reason" required>
                  <TextArea value={text} onChange={setText} rows={2} maxLength={500} />
                </FormField>
              </ConfirmDialog>
            )}
            {dispatch && (
              <ConfirmDialog
                open
                onOpenChange={(o) => !o && setDispatch(null)}
                title={`Dispatch proof for ${dispatch.r.name}`}
                consequence="The registered post's article number is kept with the notice."
                confirmLabel="Save"
                confirmDisabled={text.trim().length < 3}
                onConfirm={async () => {
                  await write('PUT', `/lifecycle/absconding/${id(dispatch.r.id)}/steps/${id(dispatch.key)}/dispatch`, { ref: text.trim(), version: dispatch.r.version });
                  toast({ tone: 'success', title: `Dispatch proof saved for ${dispatch.r.name}` });
                  setDispatch(null);
                }}
              >
                <FormField id="ab-ref" label="Article number" required>
                  <TextField value={text} onChange={setText} maxLength={60} />
                </FormField>
              </ConfirmDialog>
            )}
          </>
        ),
      }}
    />
  );
}
