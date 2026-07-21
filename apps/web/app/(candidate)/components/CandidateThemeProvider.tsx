'use client';

import { useAttemptQuery } from '../../../lib/hooks/useAttempt';
import { onPrimaryTextColor } from '../../../lib/candidate-theme';

export function CandidateThemeProvider({ children }: { children: React.ReactNode }) {
  const { data } = useAttemptQuery();
  const primaryColor = data?.organizationPrimaryColor ?? null;

  const themeStyle = primaryColor
    ? ({
        '--color-candidate-primary': primaryColor,
        '--color-candidate-primary-light': 'color-mix(in srgb, var(--color-candidate-primary) 12%, white)',
        '--color-candidate-on-primary': onPrimaryTextColor(primaryColor),
      } as React.CSSProperties)
    : undefined;

  return (
    <div className="min-h-screen bg-candidate-bg" style={themeStyle}>
      {data?.organizationLogoUrl ? (
        <div className="flex justify-center px-4 pt-4">
          <img src={data.organizationLogoUrl} alt="Organization logo" className="h-10 w-auto object-contain" />
        </div>
      ) : null}
      {children}
    </div>
  );
}
