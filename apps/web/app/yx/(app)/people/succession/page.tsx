'use client';

import { useToast } from '@yukthix/ui';
import { SuccessionScreen, type LiveSuccession } from '@yukthix/ui/frame';
import { loadState } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { useJoinerPlaces } from '../../../../../lib/yx-lifecycle';

const id = encodeURIComponent;

// People › Succession (PPL-26): critical positions and their nominated successors with readiness. Confidential:
// company-wide holders of succession.manage only; the API checks every call.
export default function YxSuccessionPage() {
  const { toast } = useToast();
  const data = usePeople<NonNullable<LiveSuccession['data']>>('/succession');
  const state = loadState(data);
  const places = useJoinerPlaces(state === 'ready');
  const write = usePeopleWrite();
  const nameOf = (employeeId: string) => places.managers.find((m) => m.value === employeeId)?.label.split(',')[0] ?? 'The person';
  return (
    <SuccessionScreen
      positions={[]}
      live={{
        state: state === 'no-access' ? 'forbidden' : state,
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        people: places.managers.map((m) => ({ id: m.value, name: m.label.split(',')[0], role: m.label.split(', ').slice(1).join(', ') || undefined })),
        onAddPosition: async (title, incumbentEmployeeId) => {
          await write('POST', '/succession', { title, incumbentEmployeeId });
          toast({ tone: 'success', title: `${title} added as a critical position` });
        },
        onNominate: async (p, employeeId, readiness) => {
          await write('PUT', `/succession/${id(p.id)}/successors`, { employeeId, readiness });
          toast({ tone: 'success', title: `${nameOf(employeeId)} nominated for ${p.title}` });
        },
        onRemove: async (p, s) => {
          await write('DELETE', `/succession/${id(p.id)}/successors/${id(s.id)}`);
          toast({ tone: 'success', title: `${s.name} removed as a successor for ${p.title}` });
        },
      }}
    />
  );
}
