'use client';

import { useRouter } from 'next/navigation';
import { OnboardingBoardScreen, type ImportResult, type JoinerBoard } from '@yukthix/ui/lifecycle';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// People › Onboarding (PPL-11; M01 §3.5, LIFE-1.07): joiners before day one with their checklist progress. HR adds or
// imports joiners; a joiner becomes an employee on the joining day (founder D2). The API decides who sees whom.
export default function YxOnboardingPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const board = useLife<JoinerBoard>('/lifecycle/joiners');
  const places = useJoinerPlaces(perms.has('lifecycle.onboarding.manage'));
  const write = useLifeWrite();
  return (
    <OnboardingBoardScreen
      state={loadState(board)}
      onRetry={() => void board.refetch()}
      data={board.data ?? null}
      places={places}
      onOpen={(journeyId) => router.push(`/yx/people/onboarding/${encodeURIComponent(journeyId)}`)}
      onAdd={(input) => write('POST', '/lifecycle/joiners', input)}
      onImport={(csv, commit) => write<ImportResult>('POST', '/lifecycle/joiners/import', { csv, commit })}
    />
  );
}
