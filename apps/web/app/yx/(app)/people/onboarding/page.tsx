'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { OnboardingBoard } from '@yukthix/ui/frame';
import { AddJoinerDrawer, ImportDrawer, type ImportResult, type JoinerBoard, type ReadyOffer } from '@yukthix/ui/lifecycle';
import { loadState, todayIst, useYxPermissions } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';
import { boardColumns } from '../../../../../lib/yx-onboarding';

// People › Onboarding (PPL-11, design audit step 3; M01 §3.5, LIFE-1.07): the designed board with accepted offers,
// joiners before day one and their first 30 days, each with checklist progress and the next task. HR adds or imports
// joiners; a joiner becomes an employee on the joining day (founder D2). The stage follows the dates, so cards are not
// dragged. The API decides who sees whom.
export default function YxOnboardingPage() {
  const sp = useScopeParams();
  const router = useRouter();
  const { toast } = useToast();
  const perms = useYxPermissions();
  const manage = perms.has('lifecycle.onboarding.manage');
  const board = useLife<JoinerBoard>(withParams('/lifecycle/joiners', sp.entity));
  const offers = useLife<ReadyOffer[]>(manage ? '/lifecycle/ready-to-onboard' : null);
  const places = useJoinerPlaces(manage);
  const write = useLifeWrite();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const today = board.data?.today ?? todayIst();
  const canAdd = Boolean(board.data?.canAdd);
  return (
    <OnboardingBoard
      key={board.data ? 'ready' : 'loading'}
      columns={board.data ? boardColumns(board.data.joiners, manage ? (offers.data ?? []) : null, today) : []}
      state={board.data ? 'ready' : 'loading'}
      live={{
        error: board.isError,
        noAccess: loadState(board) === 'no-access',
        onRetry: () => void board.refetch(),
        ...(canAdd ? { onAdd: () => setAdding(true), onImport: () => setImporting(true) } : {}),
        onOpenCard: (cardId) => router.push(cardId.startsWith('offer:') ? '/yx/people/ready-to-onboard' : `/yx/people/onboarding/${encodeURIComponent(cardId)}`),
        children: (
          <>
            {adding && (
              <AddJoinerDrawer
                places={places}
                today={today}
                onClose={() => setAdding(false)}
                onAdd={async (x) => {
                  await write('POST', '/lifecycle/joiners', x);
                  setAdding(false);
                  toast({ tone: 'success', title: `${x.givenName} added`, description: 'Their checklist has started.' });
                }}
              />
            )}
            {importing && (
              <ImportDrawer
                onClose={() => setImporting(false)}
                onImport={(csv, commit) => write<ImportResult>('POST', '/lifecycle/joiners/import', { csv, commit })}
                onDone={(n) => {
                  setImporting(false);
                  toast({ tone: 'success', title: `${n} ${n === 1 ? 'joiner' : 'joiners'} added` });
                }}
              />
            )}
          </>
        ),
      }}
    />
  );
}
