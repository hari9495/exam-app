'use client';

import { useEffect, useState } from 'react';
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
      auth: { token: accessToken },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      setConnectionStatus('connected');
      socket.emit('join-exam', { examId });
    });

    socket.on('disconnect', () => {
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
  }, [accessToken, examId]);

  return { roster, alerts, connectionStatus, joinError };
}
