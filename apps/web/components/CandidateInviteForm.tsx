'use client';

import { useState } from 'react';
import { Button, Input } from '../components/ui';

interface CandidateInput {
  name: string;
  email: string;
  phone: string;
}

export function CandidateInviteForm({ onSubmit }: { onSubmit: (input: CandidateInput) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ name, email, phone });
    setName('');
    setEmail('');
    setPhone('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <Input label="Name" value={name} onChange={setName} required />
      <Input label="Email" type="email" value={email} onChange={setEmail} required />
      <Input label="Phone" value={phone} onChange={setPhone} />
      <Button type="submit">Add candidate</Button>
    </form>
  );
}
