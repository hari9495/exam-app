'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, setUnauthorizedHandler } from './api-client';
import { decodeJwtPayload } from './jwt';

interface AuthContextValue {
  accessToken: string | null;
  organizationSlug: string | null;
  role: string | null;
  actingSuperAdmin: boolean;
  actingOrgName: string | null;
  isLoading: boolean;
  login: (organizationSlug: string, accessToken: string) => void;
  logout: () => Promise<void>;
  switchIntoOrg: (orgId: string) => Promise<void>;
  switchOutOfOrg: () => Promise<void>;
  impersonating: boolean;
  impersonatorEmail: string | null;
  impersonate: (userId: string) => Promise<void>;
  stopImpersonating: () => Promise<string | null>;
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

// A super_admin "switch into org" mints an access-only acting token; a token refresh (on mount,
// on any 401, or a page reload) reissues the BASE super_admin token and would silently drop the
// acting state, bouncing the user out of the org console. Persisting the acting org id lets
// silentRefresh re-enter the org so the acting session survives refreshes.
const ACTING_ORG_STORAGE_KEY = 'actingOrgId';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [actingSuperAdmin, setActingSuperAdmin] = useState(false);
  const [actingOrgName, setActingOrgName] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [impersonatorEmail, setImpersonatorEmail] = useState<string | null>(null);
  const [organizationSlug, setOrganizationSlug] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const accessTokenRef = useRef<string | null>(null);
  accessTokenRef.current = accessToken;
  // Guards against silentRefresh re-entering the acting org more than once (the switch-into call
  // itself goes through apiFetch, whose 401 handler is silentRefresh).
  const restoringActingRef = useRef(false);
  const queryClient = useQueryClient();

  function applyToken(token: string | null) {
    setAccessToken(token);
    const payload = token ? decodeJwtPayload(token) : null;
    setRole(payload && typeof payload.role === 'string' ? payload.role : null);
    setActingSuperAdmin(Boolean(payload?.actingSuperAdmin));
    setActingOrgName(payload && typeof payload.actingOrgName === 'string' ? payload.actingOrgName : null);
    setImpersonating(Boolean(payload?.impersonatorUserId));
    setImpersonatorEmail(payload && typeof payload.impersonatorEmail === 'string' ? payload.impersonatorEmail : null);
    // A super_admin has no organizationSlug of their own (they log in without one), so acting
    // into an org left it stuck empty -- which silently disabled useSsoStatus()'s per-org check
    // (it no-ops without a slug) and showed staff actions like "Reset password" for every user
    // regardless of whether the org they were viewing actually had SSO enabled (ADO #6849).
    if (payload && typeof payload.actingOrgSlug === 'string') {
      setOrganizationSlug(payload.actingOrgSlug);
    } else if (payload?.role === 'super_admin' && !payload?.actingSuperAdmin) {
      setOrganizationSlug(null);
    }
  }

  async function silentRefresh(): Promise<string | null> {
    try {
      const result = await apiFetch('/auth/refresh', { method: 'POST', body: JSON.stringify({}) });
      // Refresh returns the BASE session token. If the user was acting into an org, re-enter it so
      // the acting session (and the org sidebar / results it grants) survives the refresh.
      const actingOrgId = typeof window !== 'undefined' ? window.sessionStorage.getItem(ACTING_ORG_STORAGE_KEY) : null;
      const payload = decodeJwtPayload(result.accessToken);
      if (actingOrgId && !restoringActingRef.current && payload?.role === 'super_admin' && !payload?.actingSuperAdmin) {
        restoringActingRef.current = true;
        try {
          const switched = await apiFetch(
            `/auth/super-admin/switch-into/${actingOrgId}`,
            { method: 'POST', body: JSON.stringify({}) },
            result.accessToken,
          );
          applyToken(switched.accessToken);
          return switched.accessToken;
        } catch {
          // The org is gone or access was revoked -- fall back to the base super_admin session.
          if (typeof window !== 'undefined') window.sessionStorage.removeItem(ACTING_ORG_STORAGE_KEY);
        } finally {
          restoringActingRef.current = false;
        }
      }
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
      window.sessionStorage.removeItem(ACTING_ORG_STORAGE_KEY);
    }
    queryClient.removeQueries({ queryKey: ['currentUser'] });
  }

  async function switchIntoOrg(orgId: string): Promise<void> {
    const result = await apiFetch(
      `/auth/super-admin/switch-into/${orgId}`,
      { method: 'POST', body: JSON.stringify({}) },
      accessTokenRef.current ?? undefined,
    );
    applyToken(result.accessToken);
    if (typeof window !== 'undefined') window.sessionStorage.setItem(ACTING_ORG_STORAGE_KEY, orgId);
  }

  async function switchOutOfOrg(): Promise<void> {
    // Clear the persisted org first so the silentRefresh below returns to the base session
    // instead of re-entering the org we're trying to leave.
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(ACTING_ORG_STORAGE_KEY);
    await apiFetch(
      '/auth/super-admin/switch-out',
      { method: 'POST', body: JSON.stringify({}) },
      accessTokenRef.current ?? undefined,
    ).catch(() => undefined);
    await silentRefresh();
  }

  async function impersonate(userId: string): Promise<void> {
    const result = await apiFetch(
      `/auth/impersonate/${userId}`,
      { method: 'POST', body: JSON.stringify({}) },
      accessTokenRef.current ?? undefined,
    );
    applyToken(result.accessToken);
    queryClient.removeQueries({ queryKey: ['currentUser'] });
  }

  async function stopImpersonating(): Promise<string | null> {
    await apiFetch(
      '/auth/impersonate/stop',
      { method: 'POST', body: JSON.stringify({}) },
      accessTokenRef.current ?? undefined,
    ).catch(() => undefined);
    // silentRefresh restores the admin's own token from the (untouched) refresh cookie.
    // Return its role so the caller can navigate back to the admin's console rather than
    // leaving them on an impersonated-console route their real role can't access.
    const token = await silentRefresh();
    queryClient.removeQueries({ queryKey: ['currentUser'] });
    const payload = token ? decodeJwtPayload(token) : null;
    return payload && typeof payload.role === 'string' ? payload.role : null;
  }

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        organizationSlug,
        role,
        actingSuperAdmin,
        actingOrgName,
        isLoading,
        login,
        logout,
        switchIntoOrg,
        switchOutOfOrg,
        impersonating,
        impersonatorEmail,
        impersonate,
        stopImpersonating,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
