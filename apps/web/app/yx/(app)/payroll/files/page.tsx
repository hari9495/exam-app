'use client';

import { PaymentsScreen, type ExchangeFiles } from '@yukthix/ui/pay';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { payState, usePay, usePayDownload, usePayWrite } from '../../../../../lib/yx-pay';

// Payroll › Payroll files (YX-INT-03, PAY-1.11; PAY-10 "Bank files" design): a single-use link per download; a second
// person releases a file.
export default function YxPayFilesPage() {
  const me = useCurrentUser();
  const files = usePay<ExchangeFiles>('/files');
  const write = usePayWrite();
  const download = usePayDownload();
  return (
    <PaymentsScreen
      live={{
        view: 'files',
        state: payState(files),
        onRetry: () => void files.refetch(),
        data: files.data ?? null,
        me: me.data?.name || me.data?.email || 'You',
        onDownload: async (f) => {
          const link = await write<{ path: string }>(`/files/${encodeURIComponent(f.id)}/link`);
          await download(link.path, f.fileName);
        },
        onRelease: (f, confirmation) => write(`/files/${encodeURIComponent(f.id)}/release`, { confirmation }),
      }}
    />
  );
}
