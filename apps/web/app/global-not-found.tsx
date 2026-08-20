import Link from 'next/link';
import './globals.css';
import { ErrorScreen } from '../components/ErrorScreen';

export const metadata = { title: 'Page not found | Prudent Hire' };

/**
 * The 404 for URLs that match no route at all — the only kind of 404 this app actually produces,
 * since nothing calls `notFound()`. Rendered OUTSIDE the root layout (Next 16 `globalNotFound`),
 * so it must supply its own <html>/<body> and import the stylesheet itself.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <ErrorScreen
          eyebrow="Error 404"
          title="We couldn't find that page."
          description="The link may be out of date, or the page may have moved. Check the address, or head back to a known-good starting point."
          actions={
            <Link
              href="/"
              className="rounded-lg bg-ink px-4 py-2 font-body text-sm font-semibold text-paper transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
            >
              Back to Prudent Hire
            </Link>
          }
        />
      </body>
    </html>
  );
}
