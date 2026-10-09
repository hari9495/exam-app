'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaySetupScreen, type LegalOption, type Registrations, type SetupEntity, type SetupState } from '@yukthix/ui/pay';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';

const STEP_PAGE = {
  pay_groups: 'pay-groups',
  components: 'components',
  templates: 'templates',
  payslip_layout: 'payslip-layout',
  registrations: 'setup',
} as const;

// Payroll › Set-up (PAY-16 / CMP-02, PAY-2.04): the checklist per legal entity, statutory registrations (a fresh
// second step on save) and dated legal options.
export default function YxPaySetupPage() {
  const router = useRouter();
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const e = entityId ? encodeURIComponent(entityId) : null;
  const statutory = !!entities.data?.find((x) => x.id === entityId)?.keys.includes('payroll.statutory.setup');
  const setup = usePay<SetupState>(e && entities.data?.find((x) => x.id === entityId)?.keys.includes('payroll.setup.manage') ? `/entities/${e}/setup` : null);
  const regs = usePay<Registrations>(e && statutory ? `/entities/${e}/statutory-registrations` : null);
  const options = usePay<LegalOption[]>(e && statutory ? `/entities/${e}/legal-options` : null);
  const write = usePayWrite();
  return (
    <PaySetupScreen
      state={payState(entities)}
      onRetry={() => void entities.refetch()}
      entities={entities.data ?? []}
      entityId={entityId}
      onEntity={setEntityId}
      setup={setup.data ?? null}
      registrations={regs.data ?? null}
      options={options.data ?? null}
      onSaveRegistrations={(rows) =>
        write(
          `/entities/${e}/statutory-registrations`,
          {
            registrations: rows.map((r) => ({
              statute: r.statute,
              state: r.state ?? undefined,
              status: r.status,
              registrationNo: r.registrationNo ?? undefined,
              startOn: r.startOn ?? undefined,
              appliedOn: r.appliedOn ?? undefined,
              responsiblePerson: r.responsiblePerson ?? undefined,
              responsibleDesignation: r.responsibleDesignation ?? undefined,
              version: r.version,
            })),
          },
          'PUT',
        )
      }
      onSetOption={(optionKey, value, validFrom) => write(`/entities/${e}/legal-options`, { optionKey, value, validFrom }, 'PUT')}
      onOpen={(step) => router.push(`/yx/payroll/${STEP_PAGE[step]}`)}
    />
  );
}
