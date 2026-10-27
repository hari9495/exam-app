'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { ProfileChangeRequest } from '@yukthix/ui/frame';
import type { ChangeForm, ProfileRequest, ProfileRequestInput } from '@yukthix/ui/access';
import { todayIst } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { useLifeWrite } from '../../../../../lib/yx-lifecycle';

// Me › Change requests (PPL-32): my own identity, bank and legal-name changes, each with its proof, sent to HR for
// approval (the API asks for a fresh second factor), and where each one stands.
export default function YxMyChangeRequestsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const form = usePeople<ChangeForm>('/me/change-form');
  const list = usePeople<{ rows: ProfileRequest[] }>('/profile-requests');
  const write = usePeopleWrite();
  const upload = useLifeWrite();
  const me = form.data?.employeeId;
  return (
    <ProfileChangeRequest
      today={new Date(`${todayIst()}T00:00:00`)}
      live={{
        state: form.isError || list.isError ? 'error' : form.data && list.data ? 'ready' : 'loading',
        onRetry: () => void Promise.all([form.refetch(), list.refetch()]),
        form: form.data ?? null,
        requests: (list.data?.rows ?? []).filter((r) => r.employeeId === me),
        onProof: async (kind, file) => {
          const body = new FormData();
          body.append('file', file);
          return (await upload<{ id: string }>('POST', `/documents/people/${encodeURIComponent(form.data!.personId)}/${form.data!.proofTypes[kind]}`, body)).id;
        },
        onSend: async (input: ProfileRequestInput) => {
          const r = await write<ProfileRequest>('POST', `/employees/${encodeURIComponent(me!)}/profile-requests`, input);
          toast({ tone: 'success', title: `${r.label} change sent for approval` });
        },
        onCancel: () => router.push('/yx/people/profile'),
      }}
    />
  );
}
