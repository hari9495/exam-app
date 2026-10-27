'use client';

import { MyDataScreen } from '@yukthix/ui/frame';
import type { AccessLog } from '@yukthix/ui/access';
import { usePeople } from '../../../../../lib/yx-people';
import { usePayDownload } from '../../../../../lib/yx-pay';

// Me › Privacy (PPL-33; P02 §7, YX-SEC-09): what the company holds about me by class, my data as a file, and who
// looked at my pay, identity, bank details and Confidential documents.
export default function YxPrivacyPage() {
  const log = usePeople<AccessLog>('/me/access-log');
  const download = usePayDownload();
  return (
    <MyDataScreen
      live={{
        state: log.isError ? 'error' : log.data ? 'ready' : 'loading',
        onRetry: () => void log.refetch(),
        log: log.data ?? null,
        onDownload: (format) => download(`/people/me/data?format=${format}`, `my-data.${format}`),
      }}
    />
  );
}
