import { ErrorState } from '../../components/feedback';
import type { LoadState } from './types';
import type { WallData } from './report-types';

// The wall screen (SD-1.27): a desk's counts on a TV, outside the app, no sign-in. The reports themselves are the
// HLP-05 SLA dashboard (screens/ops/helpdesk-sla-live.tsx).

/** The wall screen itself (outside the app, no sign-in): big counts per desk. */
export function WallScreen({ state, wall, onRetry }: { state: LoadState | 'not-found'; wall: WallData | null; onRetry?: () => void }) {
  return (
    <div className="yx-wall" data-theme="dark">
      {state === 'not-found' && (
        <div className="yx-wall__message">
          <h1>This wall screen is switched off</h1>
          <p>The link no longer works. Ask your team lead for a new one.</p>
        </div>
      )}
      {state === 'error' && <ErrorState title="We couldn't load the wall screen." description="We will try again in a minute." onRetry={onRetry} />}
      {state === 'loading' && <p className="yx-wall__message">Loading…</p>}
      {state === 'ready' && wall && (
        <>
          <header className="yx-wall__head">
            <h1>{wall.name}</h1>
            <p>Last updated {new Date(wall.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · refreshes every minute</p>
          </header>
          <div className="yx-wall__desks">
            {wall.desks.map((d) => (
              <section key={d.name} className="yx-wall__desk" aria-label={d.name}>
                <h2>{d.name}</h2>
                <dl className="yx-wall__counts">
                  {(
                    [
                      ['Open', d.open, false],
                      ['Unassigned', d.unassigned, d.unassigned > 0],
                      ['Urgent (P1)', d.urgent, d.urgent > 0],
                      ['Due within an hour', d.dueWithinHour, d.dueWithinHour > 0],
                      ['Late', d.late, d.late > 0],
                      ['Solved today', d.solvedToday, false],
                    ] as [string, number, boolean][]
                  ).map(([label, n, warn]) => (
                    <div key={label} className="yx-wall__count" data-warn={warn || undefined}>
                      <dt>{label}</dt>
                      <dd>{n}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
