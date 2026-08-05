'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './DropdownMenu';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';

export type NumberFilterOperator = 'equals' | 'not_equals' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'above_average' | 'below_average';

export interface NumberFilterValue {
  operator: NumberFilterOperator | null;
  value?: number;
  value2?: number;
}

export const NO_NUMBER_FILTER: NumberFilterValue = { operator: null };

// Operators that need the user to type a threshold, in the order Excel's own
// Number Filters submenu lists them. Above/Below Average apply immediately on
// click instead -- there's nothing to type, the dataset supplies the number.
type ValueOperator = Exclude<NumberFilterOperator, 'above_average' | 'below_average'>;
const VALUE_OPERATORS: ValueOperator[] = ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'between'];

const OPERATOR_LABEL: Record<NumberFilterOperator, string> = {
  equals: 'Equals...',
  not_equals: 'Does Not Equal...',
  gt: 'Greater Than...',
  gte: 'Greater Than Or Equal To...',
  lt: 'Less Than...',
  lte: 'Less Than Or Equal To...',
  between: 'Between...',
  above_average: 'Above Average',
  below_average: 'Below Average',
};

function needsTwoValues(operator: ValueOperator): boolean {
  return operator === 'between';
}

export function matchesNumberFilter(value: number | null, filter: NumberFilterValue, average: number): boolean {
  if (!filter.operator) return true;
  if (value === null) return false;
  switch (filter.operator) {
    case 'equals':
      return filter.value !== undefined && value === filter.value;
    case 'not_equals':
      return filter.value !== undefined && value !== filter.value;
    case 'gt':
      return filter.value !== undefined && value > filter.value;
    case 'gte':
      return filter.value !== undefined && value >= filter.value;
    case 'lt':
      return filter.value !== undefined && value < filter.value;
    case 'lte':
      return filter.value !== undefined && value <= filter.value;
    case 'between':
      return filter.value !== undefined && filter.value2 !== undefined && value >= filter.value && value <= filter.value2;
    case 'above_average':
      return value > average;
    case 'below_average':
      return value < average;
    default:
      return true;
  }
}

const OPERATOR_SYMBOL: Record<ValueOperator, string> = {
  equals: '=',
  not_equals: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  between: '',
};

export function describeNumberFilter(filter: NumberFilterValue, unit = ''): string | null {
  if (!filter.operator) return null;
  if (filter.operator === 'above_average') return 'above average';
  if (filter.operator === 'below_average') return 'below average';
  if (filter.operator === 'between') return `${filter.value}${unit}–${filter.value2}${unit}`;
  return `${OPERATOR_SYMBOL[filter.operator]} ${filter.value}${unit}`;
}

// Excel-style "Number Filters" on a column header: an operator picklist (Equals,
// Greater Than, Between, ...) plus Above/Below Average, in place of a fixed set of
// buckets. Picking an operator that needs a threshold opens a small modal for it
// instead of an inline input in the dropdown -- Radix's menu closes/refocuses on
// interaction in ways that fight a text input living inside it.
export function NumberFilterHeader({
  label,
  value,
  onChange,
  unit = '',
}: {
  label: string;
  value: NumberFilterValue;
  onChange: (value: NumberFilterValue) => void;
  /** Appended after each number shown, e.g. '%'. */
  unit?: string;
}) {
  const [pendingOperator, setPendingOperator] = useState<ValueOperator | null>(null);
  const [input1, setInput1] = useState('');
  const [input2, setInput2] = useState('');
  const active = value.operator !== null;

  function openValueModal(operator: ValueOperator) {
    setPendingOperator(operator);
    // Prefill from the current filter only when reopening the same operator --
    // otherwise a stale "Greater Than" value would leak into a fresh "Equals".
    setInput1(value.operator === operator && value.value !== undefined ? String(value.value) : '');
    setInput2(value.operator === operator && value.value2 !== undefined ? String(value.value2) : '');
  }

  function closeModal() {
    setPendingOperator(null);
  }

  function applyValue() {
    if (!pendingOperator) return;
    const num1 = Number(input1);
    if (input1.trim() === '' || Number.isNaN(num1)) return;
    if (needsTwoValues(pendingOperator)) {
      const num2 = Number(input2);
      if (input2.trim() === '' || Number.isNaN(num2)) return;
      onChange({ operator: pendingOperator, value: Math.min(num1, num2), value2: Math.max(num1, num2) });
    } else {
      onChange({ operator: pendingOperator, value: num1 });
    }
    closeModal();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`Filter by ${label}`} className={`flex items-center gap-1 ${active ? 'text-primary' : ''}`}>
          {label}
          <ChevronDown size={12} />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {VALUE_OPERATORS.map((operator) => (
            <DropdownMenuItem
              key={operator}
              onSelect={() => openValueModal(operator)}
              className={value.operator === operator ? 'font-semibold text-primary' : ''}
            >
              {OPERATOR_LABEL[operator]}
            </DropdownMenuItem>
          ))}
          <div className="my-1 border-t border-recruiter-border" />
          <DropdownMenuItem
            onSelect={() => onChange({ operator: 'above_average' })}
            className={value.operator === 'above_average' ? 'font-semibold text-primary' : ''}
          >
            {OPERATOR_LABEL.above_average}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onChange({ operator: 'below_average' })}
            className={value.operator === 'below_average' ? 'font-semibold text-primary' : ''}
          >
            {OPERATOR_LABEL.below_average}
          </DropdownMenuItem>
          {active && (
            <>
              <div className="my-1 border-t border-recruiter-border" />
              <DropdownMenuItem onSelect={() => onChange(NO_NUMBER_FILTER)}>Clear Filter</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {pendingOperator && (
        <Modal open title={`Filter ${label}: ${OPERATOR_LABEL[pendingOperator]}`} onClose={closeModal}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              applyValue();
            }}
            className="flex flex-col gap-3"
          >
            <Input label={needsTwoValues(pendingOperator) ? 'From' : 'Value'} type="number" value={input1} onChange={setInput1} required />
            {needsTwoValues(pendingOperator) && <Input label="To" type="number" value={input2} onChange={setInput2} required />}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit">Apply</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
