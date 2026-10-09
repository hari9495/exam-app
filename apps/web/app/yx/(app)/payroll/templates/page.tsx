'use client';

import { TemplatesLiveScreen, type Breakup, type FormulaCheck, type PayComponent, type SalaryTemplate, type SetupEntity } from '@yukthix/ui/pay';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { todayIndia } from '../../../../../lib/yx-time';

// Payroll › Salary templates (PAY-13, PAY-2.08): templates, formula checks and versions saved after a sample run.
export default function YxPayTemplatesPage() {
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const templates = usePay<SalaryTemplate[]>('/templates');
  const components = usePay<PayComponent[]>('/components');
  const write = usePayWrite();
  return (
    <TemplatesLiveScreen
      state={payState(templates, components)}
      onRetry={() => void templates.refetch()}
      entities={(entities.data ?? []).filter((x) => x.keys.includes('payroll.template.manage'))}
      templates={templates.data ?? null}
      components={components.data ?? null}
      today={todayIndia()}
      onCreate={(name, legalEntityId) =>
        write('/templates', {
          name,
          ...(legalEntityId ? { legalEntityId } : {}),
        })
      }
      onCheck={(text, codes) => write<FormulaCheck>('/formulas/check', { text, codes })}
      onValidate={(v) => write<{ sample: Breakup; codeWageFlag: boolean }>('/templates/validate', v)}
      onSaveVersion={(id, v) => write(`/templates/${encodeURIComponent(id)}/versions`, v)}
    />
  );
}
