'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ChatLive, ChatMessage, ChatSession } from '@yukthix/ui/desk';
import { API_BASE } from './api-client';
import { useAuth } from './auth-context';

// SD-2.18: the live chat line (socket.io namespace /desk-chat on the API). The token is read fresh on each connect; the
// server re-checks the session every 30 seconds and drops the socket when it ends. Messages are sent over the socket;
// everything else (start, take, hand over, end) goes through the REST API.
const ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, '');

export interface ChatEvents {
  onMessage?: (m: ChatMessage & { sessionId: string }) => void;
  onState?: (s: Partial<ChatSession> & { id: string }) => void;
  onSeen?: (s: { sessionId: string; by: 'requester' | 'agent'; at: string }) => void;
  onQueue?: () => void;
}

export function useDeskChat(o: { sessionId: string | null; deskId?: string | null; events: ChatEvents }) {
  const { accessToken } = useAuth();
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const events = useRef(o.events);
  events.current = o.events;
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const s = io(`${ORIGIN}/desk-chat`, { auth: (cb: (d: { token: string | null }) => void) => cb({ token: tokenRef.current }), transports: ['websocket'] });
    socketRef.current = s;
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('chat:message', (m) => events.current.onMessage?.(m));
    s.on('chat:state', (x) => events.current.onState?.(x));
    s.on('chat:seen', (x) => events.current.onSeen?.(x));
    s.on('chat:queue', () => events.current.onQueue?.());
    s.on('chat:typing', () => {
      setTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(false), 3000);
    });
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
    // One socket per page; the token is read on each (re)connect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(accessToken)]);

  // Join the open chat's room and the desk queue room after every (re)connect.
  useEffect(() => {
    const s = socketRef.current;
    if (!s || !connected) return;
    if (o.sessionId) void s.emitWithAck('chat:join', { sessionId: o.sessionId }).then(() => s.emit('chat:seen', { sessionId: o.sessionId }));
    if (o.deskId) void s.emitWithAck('chat:watch', { deskId: o.deskId });
  }, [connected, o.sessionId, o.deskId]);

  const send = useCallback(async (sessionId: string, text: string, card?: unknown, fileId?: string) => {
    const s = socketRef.current;
    if (!s?.connected) throw new Error('Not connected. Wait a moment and try again.');
    const r = (await s.timeout(8000).emitWithAck('chat:send', { sessionId, text, ...(card ? { card } : {}), ...(fileId ? { fileId } : {}) })) as { error?: { message: string } };
    if (r?.error) throw new Error(r.error.message);
    return r;
  }, []);
  const seen = useCallback((sessionId: string) => socketRef.current?.emit('chat:seen', { sessionId }), []);
  const typingNow = useCallback((sessionId: string) => socketRef.current?.emit('chat:typing', { sessionId }), []);
  const live: ChatLive = { connected, typing };
  return { live, send, seen, typing: typingNow };
}
