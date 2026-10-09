'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MeSecurityScreen, type HistoryFilter, type LoginEventRow, type MfaStatus, type Page, type SessionRow } from '@yukthix/ui/auth';
import { useAuth } from '../../../../../lib/auth-context';
import { apiFetch } from '../../../../../lib/api-client';
import { addPasskey, confirmTotp, post, qs, startTotp } from '../../../../../lib/yx-security';

const RESULT: Record<HistoryFilter, string | undefined> = { all: undefined, success: 'success', failed: 'unsuccessful' };

// Me › Security (P12 §7; YX-IAM-03/06/10/11). Removing a factor, new recovery codes and mobile-number
// changes are step-up actions: apiFetch asks the person to confirm it's them and resends.
export default function YxMySecurityPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [page, setPage] = useState(1);
  const load = <T,>(key: unknown[], path: string) => ({ queryKey: ['yx', ...key], queryFn: (): Promise<T> => apiFetch(path, {}, token), enabled: Boolean(token) });

  const mfa = useQuery(load<MfaStatus>(['mfa'], '/auth/mfa'));
  const sessions = useQuery(load<SessionRow[]>(['sessions'], '/auth/sessions'));
  const history = useQuery(load<Page<LoginEventRow>>(['history', filter, page], `/auth/login-history${qs({ result: RESULT[filter], page, pageSize: 25 })}`));

  // Every change reloads what it can affect.
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['yx'] });
  const after = async <T,>(p: Promise<T>) => {
    const r = await p;
    await refresh();
    return r;
  };

  return (
    <MeSecurityScreen
      state={mfa.isError ? 'error' : mfa.data ? 'ready' : 'loading'}
      onRetry={refresh}
      mfa={mfa.data ?? null}
      sessions={sessions.data ?? null}
      history={history.data ?? null}
      historyState={history.isError ? 'error' : history.data ? 'ready' : 'loading'}
      historyFilter={filter}
      onHistoryFilter={(f) => {
        setFilter(f);
        setPage(1);
      }}
      onHistoryPage={setPage}
      onAddPasskey={() => after(addPasskey(token))}
      onStartTotp={() => startTotp(token)}
      onConfirmTotp={(code) => after(confirmTotp(code, token))}
      onRemoveFactor={(f) => after(apiFetch(`/auth/mfa/authenticators/${encodeURIComponent(f.id)}`, { method: 'DELETE' }, token))}
      onNewRecoveryCodes={async () => (await after(post('/auth/mfa/recovery-codes', token))).recoveryCodes}
      onSendMobileCode={async (mobileNumber) => (await post('/auth/otp/mobile', token, { mobileNumber })).mobileNumber}
      onVerifyMobile={(code) => after(post('/auth/otp/mobile/verify', token, { code }))}
      onRemoveMobile={() => after(apiFetch('/auth/otp/mobile', { method: 'DELETE' }, token))}
      onSignOutSession={(s) => after(apiFetch(`/auth/sessions/${encodeURIComponent(s.id)}`, { method: 'DELETE' }, token))}
      onSignOutOthers={() => after(post('/auth/sessions/revoke-others', token))}
    />
  );
}
