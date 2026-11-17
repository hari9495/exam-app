'use client';

import type { ReactNode } from 'react';
import { CandidateLegalContext } from '@yukthix/ui/assessments';
import { useAttemptQuery } from '../../../lib/hooks/useAttempt';

// AS-6 (answer 2237): every designed candidate page links the company's privacy notice for applicants and YukthiX's
// terms of use (the kit's candidate frame reads this once).
export function CandidateLegal({ children }: { children: ReactNode }) {
  const { data } = useAttemptQuery();
  return (
    <CandidateLegalContext.Provider value={{ privacyNotice: data?.privacyNotice ?? null, company: data?.organizationName ?? 'The company', termsHref: '/yx/legal/terms' }}>
      {children}
    </CandidateLegalContext.Provider>
  );
}
