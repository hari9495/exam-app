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

    // EVERY icon link is updated, not just the first, and this is deliberate.
    // Next renders <link rel="icon"> from app/icon.png, and React re-inserts its
    // own copy during hydration -- so head genuinely ends up with two of them
    // (confirmed in production, not theorised). Browsers choose between
    // duplicates unpredictably, so updating only the first would have shown the
    // product icon instead of the organisation's whenever the other won.
    //
    // Deleting React's node would be the other option, but removing DOM that
    // React manages risks a reconciliation error later. Pointing them all at
    // the same href is inert by comparison and correct whichever one wins.
    const links = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
    if (links.length === 0) {
      const created = document.createElement('link');
      created.rel = 'icon';
      document.head.appendChild(created);
    }

    for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')) {
      if (logoUrl) {
        // The org logo is arbitrary in size and format, so drop the hints Next
        // set for its own 512x512 PNG -- leaving them would describe it wrongly.
        link.removeAttribute('sizes');
        link.removeAttribute('type');
        link.href = logoUrl;
      } else {
        link.href = DEFAULT_ICON;
      }
    }

    // No cleanup that restores defaults: this runs on every branding/pathname
    // change anyway, and resetting on unmount would blank the tab for a frame
    // during navigation between two branded pages. Logging out re-renders a
    // consumer with name/logoUrl null, which restores the defaults above.
  }, [name, logoUrl, pathname]);
}
