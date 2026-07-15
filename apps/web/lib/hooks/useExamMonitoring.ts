'use client';

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../auth-context';
import { RosterRow, ProctoringFlag, ConnectionStatus } from '../types';

const EXAM_RUNTIME_API_BASE = process.env.NEXT_PUBLIC_EXAM_RUNTIME_API_BASE ?? 'http://localhost:3002/api/v1';
const EXAM_RUNTIME_ORIGIN = EXAM_RUNTIME_API_BASE.replace(/\/api\/v1\/?$/, '');
const MAX_ALERTS = 50;

interface UseExamMonitoringResult {
  roster: RosterRow[];
  alerts: ProctoringFlag[];
  connectionStatus: ConnectionStatus;
  joinError: string | null;
}

export function useExamMonitoring(examId: string): UseExamMonitoringResult {
  const { accessToken } = useAuth();
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [alerts, setAlerts] = useState<ProctoringFlag[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !examId) {
      return;
    }

    setRoster([]);
    setAlerts([]);
    setJoinError(null);
    setConnectionStatus('connecting');

    const socket = io(`${EXAM_RUNTIME_ORIGIN}/monitoring`, {
      // Read the token fresh on every (re)connection attempt instead of depending on
      // accessToken's exact value below, so a silentRefresh()-issued token swap (every
      // 15 minutes, per ACCESS_TOKEN_TTL_SECONDS) doesn't tear down this effect and wipe
      // the in-memory alert feed, which has no server-side replay (unlike roster, which
      // self-heals via roster:snapshot).
      auth: (cb: (data: { token: string | null }) => void) => cb({ token: tokenRef.current }),
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      setConnectionStatus('connected');
      socket.emit('join-exam', { examId });
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    socket.on('connect_error', () => {
      // Fires on a failed handshake (server down, rejected auth, etc.) rather than
      // 'disconnect', which only fires after a prior successful connection. Without
      // this, connectionStatus would stay 'connecting' forever on a failed handshake.
      setConnectionStatus('disconnected');
    });

    socket.on('error', (payload: { message: string }) => {
      setJoinError(payload.message);
    });

    socket.on('roster:snapshot', (rows: RosterRow[]) => {
      setRoster(rows);
    });

    socket.on('roster:presence', (payload: { attemptId: string; candidateId: string; online: boolean }) => {
      setRoster((current) => current.map((row) => (row.attemptId === payload.attemptId ? { ...row, online: payload.online } : row)));
    });

    socket.on('attempt:status', (payload: { attemptId: string; candidateId: string; status: string }) => {
      // ponytail: match by candidateId, not attemptId — a roster row's attemptId is
      // null until the candidate's first attempt:status event (they start as "invited"
      // with no attempt yet), so matching on attemptId can never hit on the very
      // transition this event exists to report. candidateId is stable from the initial
      // roster:snapshot onward.
      setRoster((current) =>
        current.map((row) => (row.candidateId === payload.candidateId ? { ...row, attemptId: payload.attemptId, status: payload.status } : row)),
      );
    });

    socket.on('proctoring:flag', (payload: ProctoringFlag) => {
      setAlerts((current) => [payload, ...current].slice(0, MAX_ALERTS));
    });

    return () => {
      socket.disconnect();
    };
    // accessToken is intentionally omitted: reconnecting on every refreshed token would
    // drop the in-memory alert feed (see auth callback comment above). Boolean(accessToken)
    // still re-runs this effect on its first arrival (login) and on logout (token -> null).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(accessToken), examId]);

  return { roster, alerts, connectionStatus, joinError };
}
