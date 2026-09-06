import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import type { CustomFieldDefinition } from '../types';

// Web data layer for the Task 4 custom-fields config endpoints (org_admin-only, gated behind
// org:manage_settings). Copies usePipelines.ts's fetch-wrapper/invalidation conventions --
// every mutation invalidates the same ['custom-fields', entityType] key useCustomFields() queries under.

export function useCustomFields(entityType: 'candidate' | 'job') {
  const { accessToken } = useAuth();
  return useQuery<CustomFieldDefinition[]>({
    queryKey: ['custom-fields', entityType],
    queryFn: () => apiFetch(`/custom-fields?entityType=${entityType}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export interface CreateCustomFieldInput {
  entityType: 'candidate' | 'job';
  label: string;
  fieldType: 'text' | 'number' | 'date' | 'select';
  options?: string[];
  required?: boolean;
  showOnApply?: boolean;
  position?: number;
}

export function useCreateCustomField() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomFieldInput) =>
      apiFetch('/custom-fields', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<CustomFieldDefinition>,
    onSuccess: (def) => queryClient.invalidateQueries({ queryKey: ['custom-fields', def.entityType] }),
  });
}

export interface UpdateCustomFieldInput {
  id: string;
  entityType: 'candidate' | 'job';
  label?: string;
  options?: string[];
  required?: boolean;
  showOnApply?: boolean;
  position?: number;
}

export function useUpdateCustomField() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, entityType: _entityType, ...input }: UpdateCustomFieldInput) =>
      apiFetch(`/custom-fields/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<CustomFieldDefinition>,
    onSuccess: (def) => queryClient.invalidateQueries({ queryKey: ['custom-fields', def.entityType] }),
  });
}

export function useArchiveCustomField() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; entityType: 'candidate' | 'job' }) =>
      apiFetch(`/custom-fields/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: ['custom-fields', variables.entityType] }),
  });
}
