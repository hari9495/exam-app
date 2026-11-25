'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { EXP_LINKS, TeamClaimsScreen, type TeamClaims } from '@yukthix/ui/expenses';
import { loadState, todayIst } from '../../../../../lib/yx-org';
import { useExp } from '../../../../../lib/yx-expenses';

// Team claims (round 2, founder answer 1): a manager's read-only list of their direct reports' claims, the drill of the
// EXP-01 manager cards. The API refuses (403) anyone with no one reporting to them; the page then shows no-access.
function Team() {
  const router = useRouter();
  const path = usePathname() ?? EXP_LINKS.team;
  const sp = useSearchParams();
  const today = todayIst();
  // A bad ?month= falls back to this month (the API would refuse it with 400).
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp?.get('month') ?? '') ? sp!.get('month')! : today.slice(0, 7);
  const over = sp?.get('over') === '1';
  const team = useExp<TeamClaims>(`/claims?view=team&month=${month}`);
  const go = (m: string, o: boolean) => router.replace(`${path}?month=${m}${o ? '&over=1' : ''}`, { scroll: false });
  return (
    <TeamClaimsScreen
      live={{
        state: loadState(team),
        onRetry: () => void team.refetch(),
        team: team.data ?? null,
        today,
        month,
        onMonth: (m) => go(m, over),
        over,
        onOver: (o) => go(month, o),
        onOpen: (id) => router.push(EXP_LINKS.claim(id)),
      }}
    />
  );
}

export default function YxTeamClaimsPage() {
  return (
    <Suspense>
      <Team />
    </Suspense>
  );
}
