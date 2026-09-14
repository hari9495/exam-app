'use client';

// Server-side staff-user picker: an async Combobox over GET /users?search= (debounced). Label cache
// keeps the chosen user visible when they're not in the current result set.
import { useRef, useState } from 'react';
import { Combobox } from '../ui-v2/Combobox';
import { useUsers } from '../../lib/hooks/useUsers';
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue';

export function UserPicker({
  value, onChange, placeholder = 'Choose user…', width = '100%', initialLabel, active,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number | string;
  initialLabel?: string;
  active?: boolean;
}) {
  const [input, setInput] = useState('');
  const q = useDebouncedValue(input, 250);
  const { data, isFetching } = useUsers({ search: q || undefined, pageSize: 20 });
  const cache = useRef(new Map<string, string>());
  if (initialLabel && value) cache.current.set(value, initialLabel);
  const options = (data?.data ?? []).map((u) => ({ value: u.id, label: u.name || u.email }));
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
