'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ReferralsScreen, type ReferInput } from '@yukthix/ui/hiring';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { loadState } from '../../../../../lib/yx-org';
import { referralRow, todayInIndia, type ApiReferral } from '../../../../../lib/yx-hiring-costs';

type Job = { id: string; title: string; location: string | null; department: string | null };

// Hiring › Referrals: the designed HIR-12 screen with `live`, for anyone signed in. My referrals and their bonus status;
// the bonus and its qualifying days are company settings (ats.referral.*). Referring while acting for someone else is
// refused by the API.
export default function YxReferralsPage() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const get = <T,>(path: string) => ({ queryKey: ['referrals', path], queryFn: () => apiFetch(path, {}, accessToken ?? undefined) as Promise<T>, enabled: Boolean(accessToken), retry: false });
  const mine = useQuery(get<ApiReferral[]>('/referrals/mine'));
  const jobs = useQuery(get<Job[]>('/referrals/jobs'));
  const policy = useQuery(get<{ bonusInr: number; qualifyDays: number }>('/referrals/policy'));
  const state = loadState(mine, jobs, policy);
  return (
    <ReferralsScreen
      jobs={(jobs.data ?? []).map((j) => ({ id: j.id, title: j.title, location: j.location ?? '' }))}
      referrals={(mine.data ?? []).map(referralRow)}
      today={todayInIndia()}
      live={{
        bonus: policy.data?.bonusInr ?? 0,
        qualifyDays: policy.data?.qualifyDays ?? 90,
        state: state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : 'error',
        onRetry: () => void Promise.all([mine.refetch(), jobs.refetch(), policy.refetch()]),
        onRefer: async (input: ReferInput) => {
          await apiFetch('/referrals', { method: 'POST', body: JSON.stringify({ ...input, resumeBase64: input.resumeBase64 ?? undefined }) }, accessToken ?? undefined);
          await qc.invalidateQueries({ queryKey: ['referrals'] });
        },
      }}
    />
  );
}
