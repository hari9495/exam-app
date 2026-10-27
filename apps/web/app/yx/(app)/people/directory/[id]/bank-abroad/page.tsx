'use client';

import { useParams } from 'next/navigation';
import { BankAbroad } from '../../../bank-abroad';

// People › a person's record › International bank details (PPL-46, HR).
export default function YxPersonBankAbroadPage() {
  const { id } = useParams<{ id: string }>();
  return <BankAbroad employeeId={id} back={`/yx/people/directory/${encodeURIComponent(id)}`} />;
}
