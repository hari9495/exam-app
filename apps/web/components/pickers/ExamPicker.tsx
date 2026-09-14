'use client';

// Server-side exam picker: an async Combobox that queries GET /exams?search= (debounced) instead of
// loading the whole exam list. A label cache keeps the chosen exam's title visible even when it isn't
// in the current search result set; `initialLabel` seeds it for a pre-selected value.
import { useRef, useState } from 'react';
import { Combobox } from '../ui-v2/Combobox';
import { useExams } from '../../lib/hooks/useExams';
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue';

export function ExamPicker({
  value, onChange, status, placeholder = 'Choose exam…', width = '100%', initialLabel, active,
}: {
  value: string;
  onChange: (v: string) => void;
  status?: string;
  placeholder?: string;
  width?: number | string;
  initialLabel?: string;
  active?: boolean;
}) {
  const [input, setInput] = useState('');
  const q = useDebouncedValue(input, 250);
  const { data, isFetching } = useExams(status, { search: q || undefined, pageSize: 20 });
  const cache = useRef(new Map<string, string>());
  if (initialLabel && value) cache.current.set(value, initialLabel);
  const options = (data?.data ?? []).map((e) => ({ value: e.id, label: e.title }));
  options.forEach((o) => cache.current.set(o.value, o.label));
  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      onSearch={setInput}
      loading={isFetching}
      selectedLabel={cache.current.get(value)}
      placeholder={placeholder}
      width={width}
      active={active ?? Boolean(value)}
    />
  );
}
