'use client';

import { useState } from 'react';
import { formatDate, useToast } from '@yukthix/ui';
import { PreboardingBatches } from '@yukthix/ui/frame';
import { AddMembersDialog, BatchDialog, type Batch, type JoinerBoard } from '@yukthix/ui/lifecycle';
import { todayIst, useYxPermissions, loadState } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { batchRows } from '../../../../../lib/yx-onboarding';

const id = encodeURIComponent;
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plus = (key: string, days: number) => iso(new Date(day(key).getTime() + days * 86_400_000));

// People › Pre-boarding batches (PPL-14, design audit step 3; LIFE-5.02): joiners who start together; a new batch day
// moves everyone and their checklists. The API checks every call.
export default function YxBatchesPage() {
  const { toast } = useToast();
  const perms = useYxPermissions();
  const canManage = perms.has('lifecycle.onboarding.manage');
  const data = useLife<{ today: string; rows: Batch[] }>('/lifecycle/batches');
  const board = useLife<JoinerBoard>(canManage ? '/lifecycle/joiners' : null);
  const places = useJoinerPlaces(canManage);
  const write = useLifeWrite();
  const [edit, setEdit] = useState<Batch | 'new' | null>(null);
  const [adding, setAdding] = useState<Batch | null>(null);
  const batches = data.data?.rows ?? [];
  const joiners = board.data?.joiners ?? [];
  const waiting = joiners.filter((j) => j.status === 'invited' && !j.batchId) as (JoinerBoard['joiners'][number] & { legalEntityId?: string })[];
  const find = (batchId: string) => batches.find((b) => b.id === batchId)!;
  const save = (batchId: string | null, x: Parameters<React.ComponentProps<typeof BatchDialog>['onSave']>[1]) => (batchId ? write('PUT', `/lifecycle/batches/${id(batchId)}`, x) : write('POST', '/lifecycle/batches', x));
  const today = data.data?.today ?? todayIst();
  return (
    <PreboardingBatches
      rows={batchRows(batches, joiners, places.entities)}
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        today: day(today),
        members: Object.fromEntries(batches.map((b) => [b.id, b.members.map((m) => ({ id: m.id, name: m.name, status: m.status, joiningOn: day(m.joiningOn) }))])),
        ...(canManage
          ? {
              onNew: () => setEdit('new'),
              onEdit: (batchId: string) => setEdit(find(batchId)),
              onAddMembers: (batchId: string) => setAdding(find(batchId)),
              onLetters: async (batchId: string) => {
                const b = find(batchId);
                const r = await write<{ issued: number; failed: { message: string }[] }>('POST', `/lifecycle/batches/${id(b.id)}/loi`);
                toast({ tone: r.failed.length ? 'error' : 'success', title: `${r.issued} letter${r.issued === 1 ? '' : 's'} of intent sent for ${b.name}`, ...(r.failed.length ? { description: `${r.failed.length} not sent: ${r.failed[0].message}` } : {}) });
              },
              onChangeDate: async (batchId: string, date: Date, reason: string, notify: boolean) => {
                const b = find(batchId);
                // The touchpoints move by the same days as the batch (PPL-14 Change date).
                const shift = Math.round((date.getTime() - day(b.joiningOn).getTime()) / 86_400_000);
                const r = await save(b.id, { name: b.name, legalEntityId: b.legalEntityId, joiningOn: iso(date), touchpoints: b.touchpoints.map((t) => ({ ...t, on: plus(t.on, shift) })), reason, notify, version: b.version }) as { moved: number; emailed: number };
                toast({ tone: 'success', title: `${b.name} now joins on ${formatDate(date)}`, ...(notify ? { description: `${r.emailed} of ${r.moved} members emailed their new date${r.emailed < r.moved ? ' (the others have no personal email)' : ''}.` } : {}) });
              },
            }
          : {}),
        children: (
          <>
            {edit && (
              <BatchDialog
                batch={edit === 'new' ? null : edit}
                entities={places.entities}
                today={today}
                onClose={() => setEdit(null)}
                onSave={async (batchId, x) => {
                  await save(batchId, x);
                  toast({ tone: 'success', title: `${x.name} saved` });
                }}
              />
            )}
            {adding && (
              <AddMembersDialog
                batch={adding}
                joiners={waiting.filter((j) => j.legalEntityId === adding.legalEntityId).map((j) => ({ value: j.id, label: `${j.name}, joins ${formatDate(day(j.joiningOn))}` }))}
                onClose={() => setAdding(null)}
                onAdd={async (b, ids) => {
                  await write('POST', `/lifecycle/batches/${id(b.id)}/members`, { preboardingIds: ids });
                  toast({ tone: 'success', title: `${ids.length} joiner${ids.length === 1 ? '' : 's'} added to ${b.name}` });
                }}
              />
            )}
          </>
        ),
      }}
    />
  );
}
