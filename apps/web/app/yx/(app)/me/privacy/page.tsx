'use client';

import { useToast } from '@yukthix/ui';
import { MyDataScreen, type PrivacyNominee } from '@yukthix/ui/frame';
import type { AccessLog } from '@yukthix/ui/access';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { usePayDownload } from '../../../../../lib/yx-pay';

// Me › Privacy (PPL-33; P02 §7, YX-SEC-09): what the company holds about me by class, my data as a file, and who
// looked at my pay, identity, bank details and Confidential documents. "Request a correction" goes to HR as a profile
// request (a fresh second factor, decided by someone else); "Nominate someone" names who acts for me on my data.
export default function YxPrivacyPage() {
  const { toast } = useToast();
  const log = usePeople<AccessLog>('/me/access-log');
  const me = usePeople<{ employeeId: string }>('/me');
  const nominee = usePeople<{ nominee: PrivacyNominee | null }>('/me/privacy-nominee');
  const write = usePeopleWrite();
  const download = usePayDownload();
  const id = me.data?.employeeId;
  return (
    <MyDataScreen
      live={{
        // 404: the sign-in has no employee record (an admin-only account); say so instead of "check your connection".
        state: log.isError ? ((log.error as { status?: number } | null)?.status === 404 ? 'no-record' : 'error') : log.data ? 'ready' : 'loading',
        onRetry: () => void log.refetch(),
        log: log.data ?? null,
        onDownload: (format) => download(`/people/me/data?format=${format}`, `my-data.${format}`),
        ...(id
          ? {
              onCorrect: async (value) => {
                await write('POST', `/employees/${encodeURIComponent(id)}/profile-requests`, { kind: 'correction', value });
                toast({ tone: 'success', title: 'Correction sent to HR', description: 'You see the answer in Change requests.' });
              },
            }
          : {}),
        nominee: nominee.data?.nominee ?? null,
        ...(nominee.data
          ? {
              onNominate: async (input) => {
                await write('PUT', '/me/privacy-nominee', input);
                await nominee.refetch();
                toast({ tone: 'success', title: `${input.name} is your nominee` });
              },
              onRemoveNominee: async () => {
                await write('POST', '/me/privacy-nominee/remove');
                await nominee.refetch();
                toast({ tone: 'success', title: 'Nominee removed' });
              },
            }
          : {}),
      }}
    />
  );
}
