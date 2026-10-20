'use client';

import { useToast } from '@yukthix/ui';
import { BuddyPanel, type LiveBuddies } from '@yukthix/ui/frame';
import { todayIst, useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { useJoinerPlaces, useLifeWrite } from '../../../../../lib/yx-lifecycle';

const id = encodeURIComponent;

// People › Buddies (PPL-41): the pool of colleagues who volunteer, their load, joiners still without a buddy and the
// buddy check-ins. Onboarding keys; assigning goes through the joiner's own buddy rule (never the manager, the cap).
export default function YxBuddiesPage() {
  const { toast } = useToast();
  const perms = useYxPermissions();
  const canManage = perms.has('lifecycle.onboarding.manage');
  const data = usePeople<NonNullable<LiveBuddies['data']>>('/buddies');
  const places = useJoinerPlaces(canManage);
  const write = usePeopleWrite();
  const lifeWrite = useLifeWrite();
  const nameOf = (employeeId: string) => data.data?.pool.find((b) => b.employeeId === employeeId)?.name ?? places.managers.find((m) => m.value === employeeId)?.label.split(',')[0] ?? 'The colleague';
  return (
    <BuddyPanel
      pool={[]}
      live={{
        state: data.isError ? 'error' : data.data ? 'ready' : 'loading',
        onRetry: () => void data.refetch(),
        today: new Date(`${todayIst()}T00:00:00`),
        data: data.data ?? null,
        people: places.managers.map((m) => ({ id: m.value, name: m.label.split(',')[0], role: m.label.split(', ').slice(1).join(', ') || undefined })),
        ...(canManage
          ? {
              onAdd: async (employeeId: string, cap: number) => {
                await write('POST', '/buddies', { employeeId, cap });
                toast({ tone: 'success', title: `${nameOf(employeeId)} added to the buddy pool` });
              },
              onRemove: async (employeeId: string) => {
                const name = nameOf(employeeId);
                await write('DELETE', `/buddies/${id(employeeId)}`);
                toast({ tone: 'success', title: `${name} removed from the buddy pool` });
              },
              onAssign: async (joiner: { id: string; version: number; name: string }, employeeId: string) => {
                await lifeWrite('PUT', `/lifecycle/joiners/${id(joiner.id)}/buddy`, { employeeId, version: joiner.version });
                await data.refetch();
                toast({ tone: 'success', title: `${nameOf(employeeId)} is now the buddy of ${joiner.name}` });
              },
            }
          : {}),
      }}
    />
  );
}
