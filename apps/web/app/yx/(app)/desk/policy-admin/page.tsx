'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner, useToast } from '@yukthix/ui';
import { PolicyAdminScreen, type PendingPerson, type PolicyAdmin, type PolicyFile, type PolicyOptions, type PolicyRowAdmin } from '@yukthix/ui/desk';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { deskState, useDesk, useDeskDownload, useDeskUpload, useDeskWrite } from '../../../../../lib/yx-desk';

const id = encodeURIComponent;

// Helpdesk › Policy admin: the designed HLP-11 policy admin with `live`. HR (policy.manage) writes policies and their
// versions, chooses who they apply to, follows who has acknowledged, reminds and exports the evidence; a second person
// (policy.publish) publishes each version. ?policy=<id> opens one (notices link there). The API checks every rule.
function PolicyAdminPage() {
  const router = useRouter();
  const params = useSearchParams();
  const policyId = params.get('policy');
  const { toast } = useToast();
  const perms = useYxPermissions();
  const canManage = perms.has('policy.manage');
  const [dept, setDept] = useState<string | null>(null);
  const list = useDesk<PolicyRowAdmin[]>('/policies');
  const one = useDesk<PolicyAdmin>(policyId ? `/policies/${id(policyId)}` : null);
  const pending = useDesk<PendingPerson[]>(policyId ? `/policies/${id(policyId)}/pending${dept ? `?departmentId=${id(dept)}` : ''}` : null, { keepPrevious: true });
  const options = useDesk<PolicyOptions>(canManage ? '/policies/options' : null);
  const write = useDeskWrite();
  const upload = useDeskUpload();
  const download = useDeskDownload();
  const open = (p: string | null) => {
    setDept(null);
    router.replace(p ? `/yx/desk/policy-admin?policy=${id(p)}` : '/yx/desk/policy-admin');
  };
  return (
    <PolicyAdminScreen
      live={{
        state: deskState(list),
        onRetry: () => void list.refetch(),
        canManage,
        canPublish: perms.has('policy.publish'),
        policies: list.data ?? [],
        policyId,
        onOpen: (p) => (p && p === policyId ? void one.refetch() : open(p)),
        policy: one.data ?? null,
        policyState: policyId ? deskState(one) : undefined,
        pending: pending.data ?? [],
        pendingState: pending.isError ? 'error' : pending.data ? 'ready' : 'loading',
        deptFilter: dept,
        onDeptFilter: setDept,
        options: options.data ?? null,
        onCreate: (input) => write<{ id: string; code: string }>('/policies', 'POST', input),
        onUpdate: async (p, version, change) => {
          await write(`/policies/${id(p)}`, 'PATCH', { version, ...change });
        },
        onSaveDraft: (p, input) => write<{ version: number }>(`/policies/${id(p)}/draft`, 'PUT', input),
        onUpload: async (p, file) => (await upload(`/policies/${id(p)}/draft/files`, file)) as unknown as PolicyFile,
        onRemoveFile: async (p, f) => {
          await write(`/policies/${id(p)}/draft/files/${id(f)}/remove`, 'POST');
        },
        onSubmit: async (p, version) => {
          await write(`/policies/${id(p)}/submit`, 'POST', { version });
        },
        onPublish: (p, version) => write<{ notified: number }>(`/policies/${id(p)}/publish`, 'POST', { version }),
        onSendBack: async (p, version, note) => {
          await write(`/policies/${id(p)}/send-back`, 'POST', { version, note });
        },
        onRemind: (p, employeeIds) => write<{ sent: number; skipped: number }>(`/policies/${id(p)}/remind`, 'POST', employeeIds ? { employeeIds } : {}),
        onExport: (p) => download(`/policies/${id(p)}/evidence`, 'acknowledgements.csv'),
        onOpenFile: (p, f) => void download(`/policies/${id(p)}/files/${id(f)}`).catch((e: Error) => toast({ title: e.message })),
      }}
    />
  );
}

export default function YxPolicyAdminPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <PolicyAdminPage />
    </Suspense>
  );
}
