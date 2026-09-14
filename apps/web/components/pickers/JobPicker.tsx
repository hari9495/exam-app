'use client';

// Server-side job/requisition picker: an async Combobox over GET /jobs?search= (debounced).
import { useRef, useState } from 'react';
import { Combobox } from '../ui-v2/Combobox';
import { useJobs } from '../../lib/hooks/usePipeline';
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue';
import type { JobStatus } from '../../lib/types';

export function JobPicker({
  value, onChange, status, placeholder = 'Choose job…', width = '100%', initialLabel, active,
}: {
  value: string;
  onChange: (v: string) => void;
  status?: JobStatus;
  placeholder?: string;
  width?: number | string;
  initialLabel?: string;
  active?: boolean;
}) {
  const [input, setInput] = useState('');
  const q = useDebouncedValue(input, 250);
  const { data, isFetching } = useJobs(status, q || undefined);
  const cache = useRef(new Map<string, string>());
  if (initialLabel && value) cache.current.set(value, initialLabel);
  const options = (data ?? []).map((j) => ({ value: j.id, label: j.title }));
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
