'use client';

import { useEffect, useState } from 'react';
import { ToPayLiveScreen, type ExpenseJournalView, type ToPayData } from '@yukthix/ui/expenses';
import { loadState, todayIst } from '../../../../../lib/yx-org';
import { useExp, useExpDownload, useExpWrite } from '../../../../../lib/yx-expenses';

// Expenses › To pay (EXP-06, M05 batch E3): approved claims to the next payroll or a bank file, bank files released by
// someone else, and the month's expense journal. The API checks expense.payout.manage for the legal entity.
export default function YxExpenseToPayPage() {
  const data = useExp<ToPayData>('/to-pay');
  const write = useExpWrite();
  const download = useExpDownload();
  const [entity, setEntity] = useState<string | null>(null);
  const [month, setMonth] = useState(() => todayIst().slice(0, 7));
  useEffect(() => {
    if (!entity && data.data?.entities.length) setEntity(data.data.entities[0].id);
  }, [data.data, entity]);
  const journal = useExp<ExpenseJournalView>(entity ? `/journal?entityId=${encodeURIComponent(entity)}&month=${month}` : null);
  return (
    <ToPayLiveScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      data={data.data ?? null}
      journal={journal.data ?? null}
      journalEntity={entity}
      journalMonth={month}
      onJournal={(e, m) => {
        setEntity(e);
        setMonth(m);
      }}
      onToPayroll={(claimIds) => write('POST', '/to-pay/payroll', { claimIds })}
      onPayout={(claimIds, debitAccount) => write('POST', '/payouts', { claimIds, debitAccount })}
      onDownload={(b) => download(`/payouts/${encodeURIComponent(b.id)}/file`)}
      onRelease={(b, phrase) => write('POST', `/payouts/${encodeURIComponent(b.id)}/release`, { phrase })}
      onCancel={(b, reason) => write('POST', `/payouts/${encodeURIComponent(b.id)}/cancel`, { reason })}
      onResults={(b, rows) => write('POST', `/payouts/${encodeURIComponent(b.id)}/results`, { rows })}
      onExportJournal={async () => {
        const out = await write<{ fileName: string; csv: string }>('POST', '/journal/export', { entityId: entity, month });
        const url = URL.createObjectURL(new Blob([out.csv], { type: 'text/csv' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = out.fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }}
      onPosted={(id) => write('POST', `/journal/${encodeURIComponent(id)}/posted`)}
    />
  );
}
