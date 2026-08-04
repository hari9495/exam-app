'use client';

import { useState } from 'react';
import { Button, Input, Modal } from '../components/ui';

interface CandidateInput {
  name: string;
  email: string;
  phone: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
}

export function CandidateInviteForm({ onSubmit }: { onSubmit: (input: CandidateInput) => void }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  function reset() {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setErrors({});
  }

  function close() {
    setOpen(false);
    reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: FormErrors = {};
    if (!firstName.trim()) nextErrors.firstName = 'Complete this field.';
    if (!lastName.trim()) nextErrors.lastName = 'Complete this field.';
    if (!email.trim()) {
      nextErrors.email = 'Complete this field.';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    onSubmit({ name: `${firstName.trim()} ${lastName.trim()}`, email: email.trim(), phone });
    close();
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add candidate
      </Button>
      {open && (
        <Modal open title="Add candidate" onClose={close}>
          {/* noValidate: this form has its own styled inline validation (error prop
              below), matching the Salesforce reference's red-bordered "Complete this
              field." message -- native browser validation would otherwise block the
              submit event before that ever runs, and its own UI varies by browser. */}
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
            <Input
              label="First Name"
              value={firstName}
              onChange={(value) => {
                setFirstName(value);
                if (errors.firstName) setErrors((current) => ({ ...current, firstName: undefined }));
              }}
              error={errors.firstName}
              required
            />
            <Input
              label="Last Name"
              value={lastName}
              onChange={(value) => {
                setLastName(value);
                if (errors.lastName) setErrors((current) => ({ ...current, lastName: undefined }));
              }}
              error={errors.lastName}
              required
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(value) => {
                setEmail(value);
                if (errors.email) setErrors((current) => ({ ...current, email: undefined }));
              }}
              error={errors.email}
              required
            />
            <Input label="Phone" value={phone} onChange={setPhone} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button type="submit">Add candidate</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
