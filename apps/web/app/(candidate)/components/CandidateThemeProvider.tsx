'use client';

import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useAttemptQuery } from '../../../lib/hooks/useAttempt';
import { useDocumentBranding } from '../../../lib/hooks/useDocumentBranding';
import { onPrimaryTextColor } from '../../../lib/candidate-theme';

export function CandidateThemeProvider({ children }: { children: React.ReactNode }) {
  const { data } = useAttemptQuery();
  const primaryColor = data?.organizationPrimaryColor ?? null;
  // A candidate never sees a login screen, so the tab is their only cue about
  // whose assessment this is. The org here comes from the invitation token, not
  // a session.
  useDocumentBranding(data?.organizationName, data?.organizationLogoUrl);
  const pathname = usePathname();
  const isExamPage = pathname?.startsWith('/exam') ?? false;

  const themeStyle = primaryColor
    ? ({
        '--color-candidate-primary': primaryColor,
        '--color-candidate-primary-light': 'color-mix(in srgb, var(--color-candidate-primary) 12%, white)',
        '--color-candidate-on-primary': onPrimaryTextColor(primaryColor),
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      // The exam page is a fixed viewport shell (no page scroll) -- lock the whole candidate frame to
      // the screen height there so the logo bar + exam fill exactly one viewport. Other candidate pages
      // (welcome/consent) keep min-h-screen so their content can grow and scroll normally.
      className={clsx('flex flex-col bg-candidate-bg', isExamPage ? 'h-screen overflow-hidden' : 'min-h-screen')}
      style={themeStyle}
    >
      <div className="flex shrink-0 items-center gap-2.5 border-b border-candidate-border bg-white px-5 py-3.5">
        <img
          src={data?.organizationLogoUrl || '/logo.png'}
          alt={data?.organizationName ? `${data.organizationName} logo` : 'Prudent Hire'}
          className="h-8 w-8 shrink-0 rounded object-contain"
        />
        <span className="text-[15px] font-bold tracking-tight text-candidate-text">
          {data?.organizationName || 'Prudent Hire'}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
