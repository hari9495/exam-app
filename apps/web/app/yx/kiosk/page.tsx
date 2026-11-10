'use client';

import { useCallback, useEffect, useState } from 'react';
import { KioskScreen, type KioskInfo, type KioskLeave, type KioskPunched, type KioskToday, type KioskTraining } from '@yukthix/ui/time';
import { VisitorKioskScreen, type KioskNeeds, type KioskResult, type LiveVisitorKiosk } from '@yukthix/ui/visitors';
import { API_BASE } from '../../../lib/api-client';

// TIM-13: the kiosk on a site tablet, outside the signed-in app. HR's one-time set-up key becomes this tablet's own
// secret, kept in this browser only (never in a URL) and sent as x-kiosk-token; a 401 means HR reset or revoked the
// kiosk, so the secret is forgotten and set-up shows again. People never sign in here: code + PIN or the ID card.
const KEY = 'yx-kiosk-token';
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const keep = (t: string | null) => {
  try {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private window): the kiosk works until the page is closed.
  }
};

export default function YxKioskPage() {
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<KioskInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);

  const call = useCallback(
    async <T,>(path: string, init: { method?: string; body?: unknown; person?: string } = {}, tok = token): Promise<T> => {
      let r: Response;
      try {
        // Visitor mode (Visitors slice 2) talks to /visitor-kiosk with the same tablet secret.
        r = await fetch(`${API_BASE}${path.startsWith('/visitor-kiosk') ? '' : '/kiosk'}${path}`, {
          method: init.method ?? 'GET',
          headers: { 'Content-Type': 'application/json', ...(tok ? { 'x-kiosk-token': tok } : {}), ...(init.person ? { 'x-kiosk-person': init.person } : {}) },
          ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        });
      } catch {
        setOffline(true);
        throw new Error('No connection. Check the Wi-Fi and try again.');
      }
      setOffline(false);
      const body = await r.json().catch(() => null);
      if (r.status === 401 && path !== '/setup') {
        keep(null);
        setToken(null);
        setInfo(null);
      }
      // The code (e.g. UNKNOWN_CODE) travels with the message so the screen can show the designed state.
      if (!r.ok) throw Object.assign(new Error((Array.isArray(body?.message) ? body.message[0] : body?.message) ?? 'That did not work. Try again.'), { code: body?.code });
      return body as T;
    },
    [token],
  );

  useEffect(() => {
    const t = read();
    setToken(t);
    if (!t) return setReady(true);
    void call<KioskInfo>('/me', {}, t)
      .then(setInfo, () => undefined)
      .finally(() => setReady(true));
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Answer 601: a tablet enrolled in visitor mode is the visitor kiosk (VIS-03), not the attendance kiosk.
  const [vInfo, setVInfo] = useState<LiveVisitorKiosk['info']>(null);
  const [vState, setVState] = useState<LiveVisitorKiosk['state']>('loading');
  const visitor = Boolean(token && (info as { mode?: string } | null)?.mode === 'visitor');
  const loadVisitor = useCallback(() => {
    setVState('loading');
    void call<NonNullable<LiveVisitorKiosk['info']>>('/visitor-kiosk/me').then(
      (i) => (setVInfo(i), setVState('ready')),
      () => setVState('error'),
    );
  }, [call]);
  useEffect(() => {
    if (visitor) loadVisitor();
  }, [visitor, loadVisitor]);
  if (visitor)
    return (
      <VisitorKioskScreen
        visit={{ id: '', name: '', mobile: '', company: '', purpose: 'Meeting', host: '', location: '', from: new Date(), to: new Date(), status: 'Expected' }}
        today={new Date()}
        live={{
          state: vState,
          onRetry: loadVisitor,
          info: vInfo,
          needs: (q) => call<KioskNeeds>('/visitor-kiosk/needs', { method: 'POST', body: { mobile: q.mobile, ...(q.typeId ? { typeId: q.typeId } : {}), ...(q.company ? { company: q.company } : {}) } }),
          walkIn: (input) =>
            call<KioskResult>('/visitor-kiosk/walk-ins', {
              method: 'POST',
              body: Object.fromEntries(Object.entries(input).filter(([, v]) => v !== null && v !== '')),
            }),
          status: (id) => call<KioskResult>(`/visitor-kiosk/walk-ins/${encodeURIComponent(id)}`),
          pass: (code) => call<KioskResult>('/visitor-kiosk/pass', { method: 'POST', body: { code } }),
          checkIn: (id, accepted) => call<KioskResult>(`/visitor-kiosk/visits/${encodeURIComponent(id)}/check-in`, { method: 'POST', body: Object.fromEntries(Object.entries(accepted).filter(([, v]) => v !== null)) }),
        }}
      />
    );

  return (
    <KioskScreen
      live={{
        state: !ready ? 'loading' : token && info ? 'ready' : token ? 'loading' : 'setup',
        info,
        offline,
        onSetup: async (code) => {
          const res = await call<{ token: string; kiosk: KioskInfo }>('/setup', { method: 'POST', body: { code } }, null);
          keep(res.token);
          setToken(res.token);
          setInfo(res.kiosk);
        },
        onIdentify: (input) => call<{ person: string; firstName: string }>('/identify', { method: 'POST', body: input }),
        onToday: (person) => call<KioskToday>('/person/today', { person }),
        onCheckCode: (code) => call('/code', { method: 'POST', body: { code } }),
        onTraining: (person) => call<KioskTraining>('/person/training', { person }),
        onMarkTraining: (person, id) => call(`/person/training/${encodeURIComponent(id)}`, { method: 'POST', body: { person } }),
        onLeave: (person) => call<KioskLeave>('/person/leave', { person }),
        onApplyLeave: (person, input) => call('/person/leave', { method: 'POST', body: { person, ...input } }),
        onPunch: async (person, kind) => {
          // One id per punch: a retry after a dropped connection is answered once, never a second punch.
          const item = { person, kind, clientRef: crypto.randomUUID(), punchedAt: new Date().toISOString() };
          try {
            return await call<KioskPunched>('/punch', { method: 'POST', body: item });
          } catch (e) {
            if (!(e instanceof Error) || !e.message.startsWith('No connection')) throw e;
            return call<KioskPunched>('/punch', { method: 'POST', body: item });
          }
        },
      }}
    />
  );
}
