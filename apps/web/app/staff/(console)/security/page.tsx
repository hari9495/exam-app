'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import { MySecurity } from '../../../../components/auth/my-security';

// The staff member's own security keys and sign-ins, inside the console: the same page as YukthiX My security, plus
// their own console roles (answer 1166), read from GET /platform/my-roles (no console key needed).
export default function ConsoleMySecurityPage() {
  const { accessToken } = useAuth();
  const roles = useQuery<{ label: string; does: string[] }[]>({
    queryKey: ['console', 'my-roles'],
    queryFn: () => apiFetch('/platform/my-roles', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
    retry: false,
  });
  return <MySecurity staffRoles={roles.data ?? null} />;
}
