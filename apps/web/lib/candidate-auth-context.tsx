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
