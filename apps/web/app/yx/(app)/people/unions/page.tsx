'use client';

import { useToast } from '@yukthix/ui';
import { UnionRegister, type LiveUnionRegister } from '@yukthix/ui/frame';
import { loadState } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { useJoinerPlaces } from '../../../../../lib/yx-lifecycle';
import { useScope } from '../../../../../lib/yx-shell';

const id = encodeURIComponent;

// People › Union register (PPL-39): unions per establishment, recognition and basis, period and office bearers, and
// how many workers signed check-off. Industrial relations (lifecycle.exit.manage) for the legal entities it reaches.
export default function YxUnionRegisterPage() {
  const { toast } = useToast();
  const { scope } = useScope();
  const data = usePeople<NonNullable<LiveUnionRegister['data']>>(`/unions${scope.entity ? `?legalEntityId=${id(scope.entity)}` : ''}`);
  const state = loadState(data);
  const places = useJoinerPlaces(state === 'ready');
  const write = usePeopleWrite();
  return (
    <UnionRegister
      rows={[]}
      live={{
        state: state === 'no-access' ? 'forbidden' : state,
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        locations: places.locations,
        onSave: async (unionId, input) => {
          await write(unionId ? 'PUT' : 'POST', unionId ? `/unions/${id(unionId)}` : '/unions', input);
          toast({ tone: 'success', title: unionId ? `${input.name} saved` : `${input.name} added to the union register` });
        },
      }}
    />
  );
}
