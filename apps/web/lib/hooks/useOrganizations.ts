import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Organization } from '../types';
import { useAuth } from '../auth-context';

export function useOrganizations() {
  const { accessToken } = useAuth();
  return useQuery<Organization[]>({
    queryKey: ['organizations'],
    queryFn: () => apiFetch('/organizations', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface CreateOrganizationInput {
  name: string;
  slug: string;
  region: string;
  adminEmail: string;
}

export function useCreateOrganization() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrganizationInput): Promise<Organization> =>
      apiFetch('/organizations', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
}
