'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AllReferralsScreen } from '@yukthix/ui/hiring';
import { apiFetch } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';
import { allReferralRow, type ApiReferral } from '../../../../../../lib/yx-hiring-costs';

// Hiring › All referrals (founder answer 204): the designed HIR-12 HR view with `live`. HR (ats.referral.manage) or a
// recruiter who sees candidates; Mark bonus paid is refused by the API unless the bonus is due, and while acting for
// someone else. A paid bonus is added to Recruiting costs.
export default function YxAllReferralsPage() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ['referrals', '/referrals'], queryFn: () => apiFetch('/referrals', {}, accessToken ?? undefined) as Promise<ApiReferral[]>, enabled: Boolean(accessToken), retry: false });
  return (
    <AllReferralsScreen
      rows={(rows.data ?? []).map(allReferralRow)}
      state={rows.isError ? 'error' : rows.isSuccess ? 'ready' : 'loading'}
      live={{
        onRetry: () => void rows.refetch(),
        onMarkPaid: async (id) => {
          await apiFetch(`/referrals/${encodeURIComponent(id)}/reward`, { method: 'PATCH', body: JSON.stringify({ rewardStatus: 'paid' }) }, accessToken ?? undefined);
          await Promise.all([qc.invalidateQueries({ queryKey: ['referrals'] }), qc.invalidateQueries({ queryKey: ['hiring'] })]);
        },
      }}
    />
  );
}
