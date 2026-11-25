'use client';

import { useRouter } from 'next/navigation';
import { CardImportScreen, EXP_LINKS, type MyCardLines } from '@yukthix/ui/expenses';
import { loadState } from '../../../../../lib/yx-org';
import { useExp, useExpWrite } from '../../../../../lib/yx-expenses';

// Expenses › Card lines to explain (EXP-08, the designed phone tiles; the same on a computer): an employee's own company
// card lines that finance could not match. Business adds the line to a claim (the receipt goes there); personal spend is
// recovered from salary. The API shows each person only their own lines.
export default function YxCardLinesPage() {
  const router = useRouter();
  const data = useExp<MyCardLines>('/card-lines/mine');
  const write = useExpWrite();
  return (
    <CardImportScreen
      employee={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onExplain: (line, choice) => write('POST', `/card-lines/${encodeURIComponent(line.id)}/explain`, { choice, version: line.version }),
        onOpenClaim: (id) => router.push(EXP_LINKS.claim(id)),
        onBack: () => router.push(EXP_LINKS.home),
      }}
    />
  );
}
