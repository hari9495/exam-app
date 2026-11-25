'use client';

import { useState } from 'react';
import { TaxOnBehalfScreen, type LiveTaxOnBehalf } from '@yukthix/ui/pay';
import { useApi, useApiWrite } from '../../../../../lib/yx-pay-5j';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';

// Payroll › Tax centre › Declare for an employee (batch H part 2, E2): HR enters the tax declarations of someone without
// a login, with the same checks and window as their own (tax.regime.override; the API refuses one's own).
export default function YxPayTaxDeclarePage() {
  const [person, setPerson] = useState<LiveTaxOnBehalf['person']>(null);
  const path = person ? `/tax/employees/${encodeURIComponent(person.id)}/declarations` : null;
  const declarations = useApi<NonNullable<LiveTaxOnBehalf['declarations']>>(path);
  const write = useApiWrite();
  const search = usePeopleSearch();
  return (
    <TaxOnBehalfScreen
      live={{
        state: declarations.isError ? 'error' : declarations.isLoading ? 'loading' : 'ready',
        onRetry: () => void declarations.refetch(),
        onSearch: search,
        person,
        onPerson: setPerson,
        declarations: declarations.data ?? null,
        onDeclare: (line) => write(path!, { lines: [line] }),
      }}
    />
  );
}
