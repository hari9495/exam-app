'use client';

import { useQueryClient } from '@tanstack/react-query';
import { PayslipLayoutLiveScreen, type PayslipLayouts, type SetupEntity } from '@yukthix/ui/pay';
import { apiFetchBlob } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { useEntityChoice } from '../../../../../lib/yx-pay-5b';

// Payroll › Payslip layout (PAY-15, PAY-2.13): the blocks shown, a real PDF preview, then use it.
export default function YxPayslipLayoutPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const { list, entityId, setEntityId } = useEntityChoice(entities.data, 'payroll.setup.manage');
  const e = entityId ? encodeURIComponent(entityId) : null;
  const data = usePay<PayslipLayouts>(e ? `/entities/${e}/payslip-layout` : null);
  const write = usePayWrite();
  return (
    <PayslipLayoutLiveScreen
      state={payState(entities)}
      onRetry={() => void entities.refetch()}
      entities={list}
      entityId={entityId}
      onEntity={setEntityId}
      data={data.data ?? null}
      onSave={(blocks) => write(`/entities/${e}/payslip-layout`, { blocks, languages: ['en'] }, 'PUT')}
      onPreview={async () => {
        const { blob } = await apiFetchBlob(`/payroll/entities/${e}/payslip-layout/preview`, { method: 'POST' }, accessToken ?? undefined);
        window.open(URL.createObjectURL(blob), '_blank', 'noopener');
        await queryClient.invalidateQueries({ queryKey: ['payroll'] });
      }}
      onActivate={() => write(`/entities/${e}/payslip-layout/activate`)}
    />
  );
}
