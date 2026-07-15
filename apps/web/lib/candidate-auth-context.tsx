'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { candidateApiFetch, setCandidateUnauthorizedHandler } from './candidate-api-client';

interface CandidateAuthContextValue {
  accessToken: string | null;
  isLoading: boolean;
  redeem: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const CandidateAuthContext = createContext<CandidateAuthContextValue | undefined>(undefined);

export function CandidateAuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function silentRefresh(): Promise<string | null> {
    try {
      const result = await candidateApiFetch('/candidate-auth/refresh', { method: 'POST', body: JSON.stringify({}) });
      setAccessToken(result.accessToken);
      return result.accessToken;
    } catch {
      setAccessToken(null);
      return null;
    }
  }

  useEffect(() => {
    setCandidateUnauthorizedHandler(silentRefresh);

    // /start redeems an invite token on mount (see start/page.tsx). If this
    // browser still has another candidate's refresh-token cookie from an
    // earlier session, an automatic silentRefresh() here would race that
    // redeem() call and could overwrite it with the stale candidate's
    // session. The token query param only ever appears on /start, so its
    // presence means redeem() — not silentRefresh() — is the one setting
    // accessToken for this page load.
    const isRedeemingInvite = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('token');
    if (isRedeemingInvite) {
      setIsLoading(false);
      return () => setCandidateUnauthorizedHandler(null);
    }

    silentRefresh().finally(() => setIsLoading(false));
    return () => setCandidateUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function redeem(token: string) {
    const result = await candidateApiFetch('/candidate-auth/redeem', { method: 'POST', body: JSON.stringify({ token }) });
    setAccessToken(result.accessToken);
  }

  async function logout() {
    await candidateApiFetch('/candidate-auth/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => undefined);
    setAccessToken(null);
  }

  return (
    <CandidateAuthContext.Provider value={{ accessToken, isLoading, redeem, logout }}>{children}</CandidateAuthContext.Provider>
  );
}

export function useCandidateAuth(): CandidateAuthContextValue {
  const context = useContext(CandidateAuthContext);
  if (!context) {
    throw new Error('useCandidateAuth must be used within CandidateAuthProvider');
  }
  return context;
}
