'use client';

/**
 * Last-resort boundary: catches errors thrown by the root layout itself. Because it REPLACES the
 * root layout, it must render its own <html>/<body>, and `globals.css` is not loaded — so this is
 * styled inline on purpose. Do not "tidy" it into Tailwind classes; they would not apply here.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#eceff3', fontFamily: 'system-ui, sans-serif' }}>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 1.5rem',
          }}
        >
          <div
            style={{
              maxWidth: '28rem',
              width: '100%',
              textAlign: 'center',
              background: '#ffffff',
              border: '1px solid #dbe0e6',
              borderRadius: '0.75rem',
              padding: '2.5rem 2rem',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#5c6875',
                marginBottom: '0.5rem',
              }}
            >
              Something went wrong
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.02em', color: '#1b2530', margin: 0 }}>
              Prudent Hire didn&rsquo;t load.
            </h1>
            <p style={{ marginTop: '0.75rem', fontSize: '14px', lineHeight: 1.6, color: '#5c6875' }}>
              The problem has been logged. Reloading usually clears it.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: '1.75rem',
                background: '#1b2530',
                color: '#ffffff',
                border: 0,
                borderRadius: '0.5rem',
                padding: '0.5rem 1rem',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            {error.digest && (
              <p
                style={{
                  marginTop: '1.5rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid #dbe0e6',
                  fontSize: '11px',
                  fontFamily: 'ui-monospace, monospace',
                  color: '#5c6875',
                }}
              >
                Reference: {error.digest}
              </p>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
