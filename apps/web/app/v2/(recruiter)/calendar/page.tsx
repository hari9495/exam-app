'use client';

// Personal calendar connections (Zoho #22): each staff member links their OWN Google/Microsoft
// account so confirmed interviews land on their calendar with an auto Meet/Teams link, and their
// existing commitments block self-book slots. v2 primitives + tokens (Workfox Azure). The connect
// flow is a full-page redirect to the provider; the API callback returns here with a status query.
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarClock, Check } from 'lucide-react';
import { useCalendarConnections, useDisconnectCalendar } from '../../../../lib/hooks/useCalendar';
import { useAuth } from '../../../../lib/auth-context';
import { apiFetch } from '../../../../lib/api-client';
// Imported directly from Button.tsx, not the ui-v2 barrel: the barrel re-exports DataTable, which
// pulls @tanstack/react-table (ESM) into jest and breaks the page test.
import { Button } from '../../../../components/ui-v2/Button';
import { STATUS } from '../../../../components/ui-v2/viz';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '16px 20px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const sectionTitle: React.CSSProperties = { fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: 0 };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };

function CalendarConnections() {
  const { accessToken } = useAuth();
  const { data: connections, isLoading } = useCalendarConnections();
  const disconnect = useDisconnectCalendar();
  const params = useSearchParams();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const justConnected = params.get('calendarConnected');
  const callbackError = params.get('calendarError');

  async function handleConnect(provider: string) {
    setError(null);
    setConnecting(provider);
    try {
      const { authUrl } = await apiFetch(`/calendar/${provider}/connect`, {}, accessToken ?? undefined);
      window.location.href = authUrl; // hand off to the provider's consent screen
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the connection');
      setConnecting(null);
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Calendar</h1>
        <p style={{ ...desc, marginTop: 6 }}>
          Connect your calendar so confirmed interviews appear on it with a video link, and your busy times keep
          self-booking slots free.
        </p>
      </div>

      {justConnected && (
        <p role="status" style={{ ...card, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: STATUS.ok, borderColor: `color-mix(in srgb, ${STATUS.ok} 30%, var(--hair))` }}>
          Calendar connected.
        </p>
      )}
      {callbackError && (
        <p role="alert" style={{ ...card, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'var(--danger)', borderColor: 'color-mix(in srgb, var(--danger) 30%, var(--hair))' }}>
          {callbackError === 'denied' ? 'Connection was cancelled.' : 'Could not connect that calendar. Please try again.'}
        </p>
      )}
      {error && <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger)', margin: '0 0 12px' }}>{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isLoading && <p style={desc}>Loading…</p>}
        {connections?.map((c) => (
          <div key={c.provider} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 11, background: c.connected ? 'color-mix(in srgb, var(--org-primary) 14%, transparent)' : 'color-mix(in srgb, var(--ink) 6%, transparent)', color: c.connected ? 'var(--org-primary)' : muted, flexShrink: 0 }}>
                <CalendarClock size={20} />
              </span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={sectionTitle}>{c.label}</h2>
                  {c.connected && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, borderRadius: 99, padding: '2px 10px', background: `color-mix(in srgb, ${STATUS.ok} 14%, transparent)`, color: STATUS.ok }}>
                      <Check size={12} /> Connected
                    </span>
                  )}
                </div>
                <p style={{ ...desc, marginTop: 4 }}>
                  {c.connected
                    ? c.connectedEmail ?? 'Your account is linked.'
                    : c.configured
                      ? 'Not connected.'
                      : 'Not available on this workspace yet.'}
                </p>
              </div>
            </div>
            {c.connected ? (
              <button
                type="button"
                className="v2-hoverbtn"
                onClick={() => disconnect.mutate(c.provider)}
                disabled={disconnect.isPending}
                style={{ fontSize: 13, fontWeight: 500, padding: '9px 16px', borderRadius: 9, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: ink, cursor: 'pointer' }}
              >
                Disconnect
              </button>
            ) : (
              <Button onClick={() => handleConnect(c.provider)} loading={connecting === c.provider} disabled={!c.configured}>
                Connect
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function V2CalendarPage() {
  // useSearchParams requires a Suspense boundary in this Next version.
  return (
    <Suspense fallback={null}>
      <CalendarConnections />
    </Suspense>
  );
}
