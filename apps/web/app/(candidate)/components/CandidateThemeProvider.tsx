'use client';

import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useAttemptQuery } from '../../../lib/hooks/useAttempt';
import { useDocumentBranding } from '../../../lib/hooks/useDocumentBranding';
import { onPrimaryTextColor } from '../../../lib/candidate-theme';

// The exam-taking screen packs real content (timer, questions) directly below
// the header, so it gets a compact logo -- the large, low-positioned logo is
// tuned for the sparse "terminal" screens (session-ended, invitation errors,
// welcome) where it visually anchors an otherwise mostly-empty page.
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
      <div className={clsx('flex shrink-0 justify-center px-4', isExamPage ? 'pt-4' : 'pt-28')}>
        {data?.organizationLogoUrl ? (
          <img
            src={data.organizationLogoUrl}
            alt="Organization logo"
            className={clsx('w-auto object-contain', isExamPage ? 'h-10' : 'h-24')}
          />
        ) : (
          <img
            src="/logo.png"
            alt="Prudent Hire"
            className={clsx('object-contain', isExamPage ? 'h-10 w-10' : 'h-24 w-24')}
          />
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
