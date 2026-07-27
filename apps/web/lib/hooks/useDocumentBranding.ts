'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Product defaults, matching the static metadata in app/layout.tsx. An
// organisation with no branding configured must land exactly back on these.
const DEFAULT_TITLE = 'Prudent Hire';
const DEFAULT_ICON = '/icon.png';

// Applies an organisation's name and logo to the browser tab.
//
// This has to run on the client rather than through Next's `metadata` export.
// The org is only known after data loads, and on three different routes it is
// resolved three different ways -- from the slug typed on the login page, from
// the authenticated session on staff pages, and from the invitation token on
// candidate pages. A server-rendered title would have to resolve all three
// before render; a single effect covers them uniformly.
//
// `pathname` is a dependency for a non-obvious reason: on client-side
// navigation the App Router re-applies the static metadata from layout.tsx,
// which resets document.title back to "Prudent Hire". Without re-asserting on
// route change the branding would apply on first paint and then silently
// disappear the first time the user clicked a link.
export function useDocumentBranding(name: string | null | undefined, logoUrl: string | null | undefined): void {
  const pathname = usePathname();

  useEffect(() => {
    document.title = name || DEFAULT_TITLE;

    // Next emits <link rel="icon"> from app/icon.png. Reuse that element rather
    // than appending another: browsers pick unpredictably between duplicates.
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }

    // The org logo is arbitrary in size and aspect ratio, so drop the sizes/type
    // hints Next set for its own 512x512 PNG -- leaving them would describe the
    // file incorrectly.
    if (logoUrl) {
      link.removeAttribute('sizes');
      link.removeAttribute('type');
      link.href = logoUrl;
    } else {
      link.href = DEFAULT_ICON;
    }

    // No cleanup that restores defaults: this runs on every branding/pathname
    // change anyway, and resetting on unmount would blank the tab for a frame
    // during navigation between two branded pages. Logging out re-renders a
    // consumer with name/logoUrl null, which restores the defaults above.
  }, [name, logoUrl, pathname]);
}
