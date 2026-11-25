'use client';

import { BankAbroad } from '../../people/bank-abroad';

// Me › Bank details: my salary account abroad (PPL-46).
export default function YxMyBankAbroadPage() {
  return <BankAbroad employeeId={null} back="/yx/people/profile" />;
}
