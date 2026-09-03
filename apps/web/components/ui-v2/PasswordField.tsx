import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { TextField } from './TextField';

export function PasswordField({
  id, label, value, onChange, required = false,
}: { id: string; label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <TextField
      id={id}
      label={label}
      type={show ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      required={required}
      autoComplete="current-password"
      trailing={
        <button
          type="button"
          onClick={() => setShow((p) => !p)}
          aria-label={show ? 'Hide characters' : 'Show characters'}
          style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--muted)', display: 'grid', placeItems: 'center' }}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      }
    />
  );
}
