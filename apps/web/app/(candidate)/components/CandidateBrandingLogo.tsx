'use client';

import { useAttemptQuery } from '../../../lib/hooks/useAttempt';

export function CandidateBrandingLogo() {
  const { data } = useAttemptQuery();

  if (!data?.organizationLogoUrl) {
    return null;
  }

  return (
    <div className="flex justify-center px-4 pt-4">
      <img src={data.organizationLogoUrl} alt="Organization logo" className="h-10 w-auto object-contain" />
    </div>
  );
}
