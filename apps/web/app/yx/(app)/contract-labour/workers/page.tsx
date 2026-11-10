'use client';

import { NoAccessState } from '@yukthix/ui';
import { WorkersScreen, type WorkersData } from '@yukthix/ui/desk';
import { useRouter } from 'next/navigation';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useClra, useClraWrite } from '../../../../../lib/yx-contract-labour';

const enc = encodeURIComponent;

// Contract labour › Contract workers (CL-2, CLB-02): the designed register with `live`. A contract worker is a person
// with the contract_worker role and a deployment (answer 624); the server checks age, the licence, the licence maximum and
// the same ID before anything is saved, with no override (635); only the last 4 Aadhaar digits are kept (636). Approval
// records the safety induction and issues the gate pass (632, 633). Readers need the contractor key; the compliance
// owners change; never while acting for someone else.
export default function YxContractWorkersPage() {
  const q = useClra<WorkersData>('/workers');
  const { accessToken } = useAuth();
  const write = useClraWrite();
  const router = useRouter();
  // CL-7 (answer 637): HR with the onboarding key converts a deployed worker (CLB-05).
  const perms = useYxPermissions();
  const state = loadState(q);
  if (state === 'no-access') return <NoAccessState what="contract workers" grantedBy="your HR team" />;
  return (
    <WorkersScreen
      workers={[]}
      contractors={[]}
      today={new Date()}
      live={{
        state: state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : 'error',
        data: q.data ?? null,
        onRetry: () => void q.refetch(),
        onCheck: async (input) => (await write<{ checks: { id: string; status: 'pass' | 'fail' | 'warn'; label: string; detail?: string }[] }>('POST', '/workers/check', input)).checks,
        onSend: (input) => write('POST', '/workers', input),
        onApprove: (id, version, induction) => write('POST', `/workers/${enc(id)}/approve`, { version, inductionOn: induction.on, inductionBy: induction.by }),
        onRelease: (id, version, on, reason) => write('POST', `/workers/${enc(id)}/release`, { version, on, reason }),
        // Answer 685: the minimum wage under the wage field.
        onConvert: perms.has('lifecycle.onboarding.manage') ? (id) => router.push(`/yx/contract-labour/workers/${enc(id)}/convert`) : undefined,
        onMinWage: (locationId, skill) => apiFetch(`/contract-labour/min-wage?locationId=${enc(locationId)}&skill=${enc(skill)}`, {}, accessToken ?? undefined) as Promise<{ monthly: string; daily: string; source: string; verify: boolean } | null>,
      }}
    />
  );
}
