'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, setUnauthorizedHandler } from './api-client';
import { decodeJwtPayload } from './jwt';

interface AuthContextValue {
  accessToken: string | null;
  organizationSlug: string | null;
  role: string | null;
  isLoading: boolean;
  login: (organizationSlug: string, accessToken: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SLUG_STORAGE_KEY = 'organizationSlug';

// Stashed by the login page right before it navigates to the SP-initiated SSO redirect, so the
// slug survives the round trip to the IdP and back. Deliberately a separate key from
// SLUG_STORAGE_KEY: that key represents an *authenticated* session's slug (set on login, cleared
// on logout, read on mount to restore UI before silentRefresh resolves) and is written even when
// the SSO attempt fails or is abandoned, which would otherwise leave a stale slug marked as if a
// real session existed.
export const SSO_PENDING_SLUG_KEY = 'ssoPendingOrganizationSlug';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [organizationSlug, setOrganizationSlug] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const accessTokenRef = useRef<string | null>(null);
  accessTokenRef.current = accessToken;
  const queryClient = useQueryClient();

  function applyToken(token: string | null) {
    setAccessToken(token);
    const payload = token ? decodeJwtPayload(token) : null;
    setRole(payload && typeof payload.role === 'string' ? payload.role : null);
  }

  async function silentRefresh(): Promise<string | null> {
    try {
      const result = await apiFetch('/auth/refresh', { method: 'POST', body: JSON.stringify({}) });
      applyToken(result.accessToken);
      return result.accessToken;
    } catch {
      applyToken(null);
      return null;
    }
  }

  useEffect(() => {
    setUnauthorizedHandler(silentRefresh);
    const storedSlug = typeof window !== 'undefined' ? window.sessionStorage.getItem(SLUG_STORAGE_KEY) : null;
    if (storedSlug) {
      setOrganizationSlug(storedSlug);
    }
    silentRefresh().finally(() => setIsLoading(false));
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function login(slug: string, token: string) {
    setOrganizationSlug(slug);
    applyToken(token);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SLUG_STORAGE_KEY, slug);
    }
  }

  async function logout() {
    await apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => undefined);
    applyToken(null);
    setOrganizationSlug(null);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(SLUG_STORAGE_KEY);
    }
    queryClient.removeQueries({ queryKey: ['currentUser'] });
  }

  return (
    <AuthContext.Provider value={{ accessToken, organizationSlug, role, isLoading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
