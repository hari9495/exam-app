'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CardImportScreen, EXP_LINKS, type CardMapping, type CardPreview, type CardStatements, type CardStatementView } from '@yukthix/ui/expenses';
import { loadState } from '../../../../../lib/yx-org';
import { useExp, useExpGet, useExpWrite } from '../../../../../lib/yx-expenses';

// Expenses › Card statements (EXP-08, the designed screen with `live`): import a corporate card statement (CSV or Excel,
// the bank's columns mapped once), match its lines to claim lines, ask employees, close. ?id= opens a statement. The API
// checks expense.payout.manage company-wide and audits every view.
function CardStatementsPage() {
  const router = useRouter();
  const id = useSearchParams()?.get('id') ?? null;
  const list = useExp<CardStatements>('/card-statements');
  const one = useExp<CardStatementView>(id ? `/card-statements/${encodeURIComponent(id)}` : null);
  const write = useExpWrite();
  const get = useExpGet();
  const [fresh, setFresh] = useState(0);
  const form = (file: File, fields: Record<string, string>) => {
    const f = new FormData();
    f.append('file', file);
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    return f;
  };
  const base = id ? `/card-statements/${encodeURIComponent(id)}` : '';
  return (
    <CardImportScreen
      key={`${id ?? 'new'}:${fresh}`}
      live={{
        state: loadState(list),
        onRetry: () => void Promise.all([list.refetch(), id ? one.refetch() : null]),
        list: list.data ?? null,
        statement: id ? (one.data ?? null) : null,
        statementState: id ? loadState(one) : 'ready',
        onOpen: (next) => {
          setFresh((n) => n + 1);
          router.push(next ? `${EXP_LINKS.cards}?id=${encodeURIComponent(next)}` : EXP_LINKS.cards);
        },
        onPreview: (file, bankName) => write<CardPreview>('POST', '/card-statements/preview', form(file, bankName ? { bankName } : {})),
        onImport: (file, bankName, mapping: CardMapping, replace) => write<{ id: string; fullNumbersDropped: number }>('POST', '/card-statements', form(file, { bankName, mapping: JSON.stringify(mapping), ...(replace ? { replace: 'true' } : {}) })),
        onMatch: (line, claimLineId) => write('POST', `${base}/lines/${encodeURIComponent(line.id)}/match`, { claimLineId, version: line.version }),
        onChase: (line) => write('POST', `${base}/lines/${encodeURIComponent(line.id)}/chase`, { version: line.version }),
        onClose: (note) => write('POST', `${base}/close`, { version: one.data?.statement.version, ...(note.trim() ? { note: note.trim() } : {}) }),
        onLinkCard: (employeeId, bankName, last4) => write<{ lines: number }>('POST', '/cards', { employeeId, bankName, last4 }),
        onSearchPeople: (q) => get<{ id: string; name: string; code: string | null }[]>(`/cards/people?q=${encodeURIComponent(q)}`),
      }}
    />
  );
}

export default function YxCardStatementsPage() {
  return (
    <Suspense>
      <CardStatementsPage />
    </Suspense>
  );
}
