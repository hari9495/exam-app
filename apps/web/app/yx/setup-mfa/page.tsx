'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MfaEnrolScreen, type MfaStatus } from '@yukthix/ui/auth';
import { Spinner } from '@yukthix/ui';
import { useAuth } from '../../../lib/auth-context';
import { apiFetch } from '../../../lib/api-client';
import { useLanding } from '../../../lib/yx-landing';
import { addPasskey, confirmTotp, startTotp } from '../../../lib/yx-security';
import { nextFromLocation } from '../../../lib/safe-next';

// First sign-in for an account whose role needs a second step (P12 §6.1 steps 2–3, §8 grace).
export default function YxSetupMfaPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { accessToken, isLoading, role } = useAuth();
  const token = accessToken ?? undefined;
  const status = useQuery<MfaStatus>({ queryKey: ['yx', 'mfa'], queryFn: () => apiFetch('/auth/mfa', {}, token), enabled: Boolean(accessToken) });
  // Where this person works: YukthiX unless they hold exam/ATS permissions.
  const { landing: home, ready } = useLanding();
  // Back to the page whose session ran out (?next=, validated), else home.
  const landing = nextFromLocation() ?? home;
  // YukthiX staff: a security key only (the API offers them nothing else either).
  const staff = role === 'super_admin';

  useEffect(() => {
    if (!isLoading && !accessToken) router.replace('/yx/sign-in');
  }, [isLoading, accessToken, router]);
  // Already set up (or never needed): nothing to do here.
  useEffect(() => {
    if (ready && status.data && (status.data.factors.length > 0 || !status.data.required)) router.replace(landing);
  }, [ready, status.data, landing, router]);

  if (!status.data || status.data.factors.length > 0 || !status.data.required) {
    return (
      <div className="yx-auth">
        {status.isError ? <p role="alert">We couldn&apos;t load your sign-in settings. Reload the page to try again.</p> : <Spinner label="Loading" size="md" />}
      </div>
    );
  }

  return (
    <MfaEnrolScreen
      allowedFactors={staff ? status.data.allowedFactors.filter((f) => f === 'passkey') : status.data.allowedFactors}
      dueAt={status.data.enrolmentDueAt}
      onAddPasskey={() => addPasskey(token)}
      onStartTotp={() => startTotp(token)}
      onConfirmTotp={(code) => confirmTotp(code, token)}
      // The next page must not see the cached "no second step yet" status (banners, the console's key check).
      onContinue={() => void queryClient.invalidateQueries({ queryKey: ['yx', 'mfa'] }).then(() => router.push(landing))}
    />
  );
}
