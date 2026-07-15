# Live Exam Monitoring Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give recruiters a live "Live" tab on an exam's edit page showing a real-time candidate roster, presence, progress, and proctoring alerts for that exam, backed by the exam-runtime's already-built `/monitoring` WebSocket gateway.

**Architecture:** A new `useExamMonitoring(examId)` hook owns the entire Socket.IO connection lifecycle (connect, `join-exam`, listen for `roster:snapshot`/`roster:presence`/`attempt:status`/`proctoring:flag`/`error`, disconnect on unmount) and exposes plain React state; a new `LiveMonitoringPanel` component consumes that hook and renders stat tiles + a roster table + an alert feed using the existing design system. No backend changes — the gateway, its auth, and its permission gating are already built and tested.

**Tech Stack:** `socket.io-client` v4.7.5 (matching the version already used server-side in `apps/api`'s e2e tests), React, `@tanstack/react-query`-adjacent hook conventions (though this hook uses plain `useState`/`useEffect`, not react-query, since it's a persistent socket subscription, not a fetch), existing `components/ui` design system.

## Global Constraints

- Approved spec: `docs/superpowers/specs/2026-07-15-live-exam-monitoring-dashboard-design.md`.
- Recruiter only — the gateway's `join-exam` and every attempts-admin route already require `exam:manage`, which only `recruiter` holds; no permission changes in this plan.
- View-only this phase — no force-submit or messaging UI.
- Per-exam, not cross-exam — one `useExamMonitoring(examId)` instance per Live tab, matching `join-exam`'s single-`examId` contract.
- Lives as a new "Live" tab on the existing `/exams/[id]/edit` page, reusing the `Tabs` component already there — no new route.
- Socket connects to the exam-runtime origin derived from `NEXT_PUBLIC_EXAM_RUNTIME_API_BASE` (defaulting to `http://localhost:3002/api/v1`) with its `/api/v1` suffix stripped — no new env var.
- Alert feed is capped at the last 50 entries, newest first.
- Reuse the existing recruiter design system (`Table`, `Badge`, `Card`, `Toast`) — no new visual identity.

---

### Task 1: Types, `socket.io-client` dependency, and `useExamMonitoring` hook

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/lib/hooks/useExamMonitoring.ts`
- Test: `apps/web/lib/hooks/useExamMonitoring.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: types `RosterRow`, `ProctoringFlag`, `ConnectionStatus` (in `apps/web/lib/types.ts`); hook `useExamMonitoring(examId: string): { roster: RosterRow[]; alerts: ProctoringFlag[]; connectionStatus: ConnectionStatus; joinError: string | null }` (in `apps/web/lib/hooks/useExamMonitoring.ts`) — Task 2 consumes this hook directly by name.

- [ ] **Step 1: Add the `socket.io-client` dependency**

In `apps/web/package.json`, add to the `dependencies` object (alphabetically among the existing entries):

```json
    "socket.io-client": "^4.7.5",
```

Run: `cd apps/web && npm install`
Expected: installs cleanly, `apps/web/package-lock.json` (or the workspace root lockfile) updates.

- [ ] **Step 2: Add the monitoring types**

Append to the end of `apps/web/lib/types.ts`:

```ts
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface RosterRow {
  candidateId: string;
  candidateName: string;
  invitationId: string;
  attemptId: string | null;
  status: string;
  online: boolean;
  remainingSeconds: number | null;
  answeredCount: number | null;
  totalQuestions: number | null;
}

export interface ProctoringFlag {
  attemptId: string;
  candidateId: string;
  eventType: string;
  severity: string;
  occurredAt: string;
}
```

- [ ] **Step 3: Write the failing test for `useExamMonitoring`**

Create `apps/web/lib/hooks/useExamMonitoring.test.tsx`:

```tsx
import { renderHook, waitFor, act } from '@testing-library/react';
import { io } from 'socket.io-client';
import { AuthProvider } from '../auth-context';
import { useExamMonitoring } from './useExamMonitoring';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

type Handler = (...args: unknown[]) => void;

function createMockSocket() {
  const handlers: Record<string, Handler> = {};
  return {
    on: jest.fn((event: string, handler: Handler) => {
      handlers[event] = handler;
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
    trigger: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('useExamMonitoring', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'test-token' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('connects and joins the exam room once the socket connects', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    renderHook(() => useExamMonitoring('exam-1'), { wrapper });

    await waitFor(() => expect(io).toHaveBeenCalledWith('http://localhost:3002/monitoring', {
      auth: { token: 'test-token' },
      transports: ['websocket'],
    }));

    act(() => socket.trigger('connect'));
    expect(socket.emit).toHaveBeenCalledWith('join-exam', { examId: 'exam-1' });
  });

  it('applies the roster snapshot and reports connectionStatus as connected', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'), { wrapper });
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));

    const row = {
      candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1',
      status: 'invited', online: false, remainingSeconds: null, answeredCount: null, totalQuestions: null,
    };
    act(() => socket.trigger('roster:snapshot', [row]));

    expect(result.current.roster).toEqual([row]);
    expect(result.current.connectionStatus).toBe('connected');
  });

  it('applies a roster:presence update to the matching attempt only', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'), { wrapper });
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));
    act(() =>
      socket.trigger('roster:snapshot', [
        { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'in_progress', online: false, remainingSeconds: 100, answeredCount: 0, totalQuestions: 5 },
        { candidateId: 'c2', candidateName: 'Bob', invitationId: 'i2', attemptId: 'a2', status: 'in_progress', online: false, remainingSeconds: 100, answeredCount: 0, totalQuestions: 5 },
      ]),
    );

    act(() => socket.trigger('roster:presence', { attemptId: 'a1', candidateId: 'c1', online: true }));

    expect(result.current.roster.find((r) => r.attemptId === 'a1')?.online).toBe(true);
    expect(result.current.roster.find((r) => r.attemptId === 'a2')?.online).toBe(false);
  });

  it('applies an attempt:status update to the matching attempt', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'), { wrapper });
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));
    act(() =>
      socket.trigger('roster:snapshot', [
        { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'invited', online: false, remainingSeconds: null, answeredCount: null, totalQuestions: null },
      ]),
    );

    act(() => socket.trigger('attempt:status', { attemptId: 'a1', candidateId: 'c1', status: 'in_progress' }));

    expect(result.current.roster[0].status).toBe('in_progress');
  });

  it('accumulates proctoring:flag events newest-first, capped at 50', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'), { wrapper });
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));

    for (let i = 0; i < 52; i++) {
      act(() =>
        socket.trigger('proctoring:flag', {
          attemptId: 'a1', candidateId: 'c1', eventType: 'tab_switch', severity: 'medium', occurredAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
        }),
      );
    }

    expect(result.current.alerts).toHaveLength(50);
    expect(result.current.alerts[0].occurredAt).toBe('2026-01-01T00:00:51Z');
  });

  it('surfaces a join-exam error via joinError', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'), { wrapper });
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));
    act(() => socket.trigger('error', { message: 'Exam exam-1 not found' }));

    expect(result.current.joinError).toBe('Exam exam-1 not found');
  });

  it('disconnects the socket on unmount', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { unmount } = renderHook(() => useExamMonitoring('exam-1'), { wrapper });
    await waitFor(() => expect(io).toHaveBeenCalled());

    unmount();

    expect(socket.disconnect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd apps/web && npx jest lib/hooks/useExamMonitoring.test.tsx`
Expected: FAIL — `Cannot find module './useExamMonitoring'`.

- [ ] **Step 5: Implement `useExamMonitoring`**

Create `apps/web/lib/hooks/useExamMonitoring.ts`:

```ts
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
      setRoster((current) => current.map((row) => (row.attemptId === payload.attemptId ? { ...row, status: payload.status } : row)));
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/web && npx jest lib/hooks/useExamMonitoring.test.tsx`
Expected: `Tests: 7 passed, 7 total`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/lib/types.ts apps/web/lib/hooks/useExamMonitoring.ts apps/web/lib/hooks/useExamMonitoring.test.tsx
git commit -m "feat: socket.io-client dependency, monitoring types, useExamMonitoring hook"
```

(Adjust the lockfile path in the `git add` if the workspace uses a root-level `package-lock.json` instead of a per-package one — check `git status` for which lockfile actually changed.)

---

### Task 2: `LiveMonitoringPanel` component and wiring into the exam edit page

**Files:**
- Create: `apps/web/components/LiveMonitoringPanel.tsx`
- Test: `apps/web/components/LiveMonitoringPanel.test.tsx`
- Modify: `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `useExamMonitoring(examId)` from Task 1, `Table`/`Badge`/`Card`/`useToast` from `components/ui`.
- Produces: `LiveMonitoringPanel({ examId }: { examId: string })` component, rendered inside a new `TabsContent value="live"` on the exam edit page.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/LiveMonitoringPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { ToastProvider } from './ui';
import { useExamMonitoring } from '../lib/hooks/useExamMonitoring';
import { LiveMonitoringPanel } from './LiveMonitoringPanel';

jest.mock('../lib/hooks/useExamMonitoring', () => ({ useExamMonitoring: jest.fn() }));

const now = new Date('2026-01-01T00:10:00Z');

function renderPanel(examId = 'exam-1') {
  return render(
    <ToastProvider>
      <LiveMonitoringPanel examId={examId} />
    </ToastProvider>,
  );
}

describe('LiveMonitoringPanel', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders stat tiles computed from the roster and alert feed', () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({
      roster: [
        { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'in_progress', online: true, remainingSeconds: 120, answeredCount: 2, totalQuestions: 5 },
        { candidateId: 'c2', candidateName: 'Bob', invitationId: 'i2', attemptId: 'a2', status: 'submitted', online: false, remainingSeconds: null, answeredCount: 5, totalQuestions: 5 },
      ],
      alerts: [
        { attemptId: 'a1', candidateId: 'c1', eventType: 'tab_switch', severity: 'medium', occurredAt: '2026-01-01T00:08:00Z' },
        { attemptId: 'a1', candidateId: 'c1', eventType: 'copy_paste', severity: 'low', occurredAt: '2025-01-01T00:00:00Z' },
      ],
      connectionStatus: 'connected',
      joinError: null,
    });

    renderPanel();

    expect(screen.getByText('Online now')).toBeInTheDocument();
    expect(screen.getByText('1', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Alerts (last 5 min)')).toBeInTheDocument();
  });

  it('renders the roster table with candidate rows', () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({
      roster: [
        { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'in_progress', online: true, remainingSeconds: 65, answeredCount: 2, totalQuestions: 5 },
      ],
      alerts: [],
      connectionStatus: 'connected',
      joinError: null,
    });

    renderPanel();

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('in_progress')).toBeInTheDocument();
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
    expect(screen.getByText('01:05')).toBeInTheDocument();
  });

  it('shows an empty state when no proctoring alerts have arrived', () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({ roster: [], alerts: [], connectionStatus: 'connected', joinError: null });

    renderPanel();

    expect(screen.getByText('No proctoring alerts yet.')).toBeInTheDocument();
  });

  it('shows the join error inline instead of the roster when one is present', () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({ roster: [], alerts: [], connectionStatus: 'connected', joinError: 'Exam exam-1 not found' });

    renderPanel();

    expect(screen.getByText('Exam exam-1 not found')).toBeInTheDocument();
    expect(screen.queryByText('No candidates invited yet.')).not.toBeInTheDocument();
  });

  it('shows a disconnected status indicator when the socket drops', () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({ roster: [], alerts: [], connectionStatus: 'disconnected', joinError: null });

    renderPanel();

    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('fires a one-time toast when connectionStatus transitions from connected to disconnected', () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({ roster: [], alerts: [], connectionStatus: 'connected', joinError: null });
    const { rerender } = renderPanel();

    expect(screen.queryByText('Live connection lost. Reconnecting…')).not.toBeInTheDocument();

    (useExamMonitoring as jest.Mock).mockReturnValue({ roster: [], alerts: [], connectionStatus: 'disconnected', joinError: null });
    rerender(
      <ToastProvider>
        <LiveMonitoringPanel examId="exam-1" />
      </ToastProvider>,
    );

    expect(screen.getByText('Live connection lost. Reconnecting…')).toBeInTheDocument();
  });

  it('does not fire the disconnect toast on initial mount, only on a connected-to-disconnected transition', () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({ roster: [], alerts: [], connectionStatus: 'disconnected', joinError: null });

    renderPanel();

    expect(screen.queryByText('Live connection lost. Reconnecting…')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest components/LiveMonitoringPanel.test.tsx`
Expected: FAIL — `Cannot find module './LiveMonitoringPanel'`.

- [ ] **Step 3: Implement `LiveMonitoringPanel`**

Create `apps/web/components/LiveMonitoringPanel.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useExamMonitoring } from '../lib/hooks/useExamMonitoring';
import { Table, Badge, Card, useToast, type Column } from './ui';
import { RosterRow, ConnectionStatus } from '../lib/types';

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  invited: 'default',
  in_progress: 'warning',
  submitted: 'success',
  auto_submitted: 'success',
  force_submitted: 'danger',
};

const RECENT_ALERT_WINDOW_MS = 5 * 60 * 1000;

function formatRemaining(seconds: number | null): string {
  if (seconds === null) {
    return '—';
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatRelativeTime(occurredAt: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(occurredAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function LiveMonitoringPanel({ examId }: { examId: string }) {
  const { roster, alerts, connectionStatus, joinError } = useExamMonitoring(examId);
  const { toast } = useToast();
  const previousStatusRef = useRef<ConnectionStatus>(connectionStatus);

  useEffect(() => {
    if (previousStatusRef.current === 'connected' && connectionStatus === 'disconnected') {
      toast('Live connection lost. Reconnecting…', 'error');
    }
    previousStatusRef.current = connectionStatus;
  }, [connectionStatus, toast]);

  const onlineCount = roster.filter((row) => row.online).length;
  const inProgressCount = roster.filter((row) => row.status === 'in_progress').length;
  const submittedCount = roster.filter((row) => row.status === 'submitted' || row.status === 'auto_submitted' || row.status === 'force_submitted').length;
  const recentAlertsCount = alerts.filter((alert) => Date.now() - new Date(alert.occurredAt).getTime() <= RECENT_ALERT_WINDOW_MS).length;

  const rosterColumns: Column<RosterRow>[] = [
    { key: 'name', header: 'Candidate', render: (row) => row.candidateName, sortValue: (row) => row.candidateName },
    { key: 'status', header: 'Status', render: (row) => <Badge variant={STATUS_VARIANT[row.status] ?? 'default'}>{row.status}</Badge> },
    { key: 'online', header: 'Online', render: (row) => <Badge variant={row.online ? 'success' : 'default'}>{row.online ? 'Online' : 'Offline'}</Badge> },
    { key: 'remaining', header: 'Time remaining', render: (row) => formatRemaining(row.remainingSeconds) },
    {
      key: 'progress',
      header: 'Progress',
      render: (row) => (row.answeredCount !== null && row.totalQuestions !== null ? `${row.answeredCount} / ${row.totalQuestions}` : '—'),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="grid grid-cols-4 gap-4 flex-1">
          <Card>
            <p className="text-xs text-gray-500">Online now</p>
            <p className="text-2xl font-semibold">{onlineCount}</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">In progress</p>
            <p className="text-2xl font-semibold">{inProgressCount}</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">Submitted</p>
            <p className="text-2xl font-semibold">{submittedCount}</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">Alerts (last 5 min)</p>
            <p className="text-2xl font-semibold">{recentAlertsCount}</p>
          </Card>
        </div>
        <span className="ml-4 text-sm text-gray-500">
          {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting…' : 'Disconnected'}
        </span>
      </div>

      {joinError ? (
        <p role="alert" className="text-sm text-red-600">
          {joinError}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Table columns={rosterColumns} rows={roster} rowKey={(row) => row.candidateId} emptyMessage="No candidates invited yet." />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700">Proctoring alerts</h3>
            {alerts.length === 0 ? (
              <p className="text-sm text-gray-500">No proctoring alerts yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {alerts.map((alert, index) => {
                  const candidate = roster.find((row) => row.attemptId === alert.attemptId);
                  return (
                    <li key={`${alert.attemptId}-${alert.occurredAt}-${index}`} className="rounded border border-gray-200 p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{candidate?.candidateName ?? 'Unknown candidate'}</span>
                        <Badge variant={alert.severity === 'high' ? 'danger' : alert.severity === 'medium' ? 'warning' : 'default'}>{alert.severity}</Badge>
                      </div>
                      <p className="text-gray-600">{alert.eventType}</p>
                      <p className="text-xs text-gray-400">{formatRelativeTime(alert.occurredAt)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest components/LiveMonitoringPanel.test.tsx`
Expected: `Tests: 7 passed, 7 total`.

- [ ] **Step 5: Wire the Live tab into the exam edit page**

In `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`, add the import:

```tsx
import { LiveMonitoringPanel } from '../../../../../components/LiveMonitoringPanel';
```

Replace the `Tabs` block:

```tsx
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="sections">Sections &amp; Questions</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <ExamDetailsForm
            initialExam={exam}
            submitLabel="Save details"
            onSubmit={(input) => updateExam.mutate(input, { onSuccess: () => toast('Exam updated.') })}
          />
        </TabsContent>
        <TabsContent value="sections">
          <ExamSectionsPanel examId={exam.id} />
        </TabsContent>
      </Tabs>
```

with:

```tsx
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="sections">Sections &amp; Questions</TabsTrigger>
          <TabsTrigger value="live">Live</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <ExamDetailsForm
            initialExam={exam}
            submitLabel="Save details"
            onSubmit={(input) => updateExam.mutate(input, { onSuccess: () => toast('Exam updated.') })}
          />
        </TabsContent>
        <TabsContent value="sections">
          <ExamSectionsPanel examId={exam.id} />
        </TabsContent>
        <TabsContent value="live">
          <LiveMonitoringPanel examId={exam.id} />
        </TabsContent>
      </Tabs>
```

- [ ] **Step 6: Manually verify the tab renders without crashing**

Run: `cd apps/web && npx jest components/LiveMonitoringPanel.test.tsx lib/hooks/useExamMonitoring.test.tsx`
Expected: `Tests: 14 passed, 14 total` (7 + 7 from Task 1, confirming nothing broke).

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/LiveMonitoringPanel.tsx apps/web/components/LiveMonitoringPanel.test.tsx "apps/web/app/(recruiter)/exams/[id]/edit/page.tsx"
git commit -m "feat: Live tab with roster, stat tiles, and proctoring alert feed"
```

---

### Task 3: Playwright end-to-end scenario

**Files:**
- Create: `apps/web/e2e/live-monitoring-golden-path.spec.ts`

**Interfaces:**
- Consumes: the full recruiter exam-creation flow (existing pattern from `apps/web/e2e/recruiter-golden-path.spec.ts`), the candidate exam-start flow (existing pattern from `apps/web/e2e/candidate-golden-path.spec.ts`), and the Live tab from Task 2.
- Produces: end-to-end proof that a real candidate action (starting the exam in a second browser context) is reflected live on the recruiter's Live tab.

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/live-monitoring-golden-path.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

test('recruiter sees a candidate go live on the exam Live tab as they start their attempt', async ({ page, browser }) => {
  // Recruiter: create exam, question, section, publish, invite a candidate
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('Live path: 2 + 2?');
  await page.getByLabel('Marks', { exact: true }).fill('5');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('4');
  await optionInputs.nth(1).fill('5');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Live Path Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);
  const examUrl = page.url();

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /Live path: 2 \+ 2\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `live-path-${Date.now()}@example.com`;
  await page.getByLabel('Name').fill('Live Path Candidate');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.getByRole('row', { name: candidateEmail }).getByRole('checkbox', { name: 'Live Path Candidate' }).click();

  const invitePromise = page.waitForResponse((response) => response.url().includes('/invitations') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send invitations' }).click();
  const inviteResponse = await invitePromise;
  const inviteBody = await inviteResponse.json();
  const inviteToken: string = inviteBody.created[0].token;

  // Recruiter: open the exam's Live tab and wait for the roster to load
  await page.goto(examUrl);
  await page.getByRole('tab', { name: 'Live' }).click();
  await expect(page.getByText('Live Path Candidate')).toBeVisible();
  await expect(page.getByText('invited')).toBeVisible();

  // Candidate: start the exam in a second, independent browser context
  const candidateContext = await browser.newContext();
  const candidatePage = await candidateContext.newPage();
  await candidatePage.goto(`/start?token=${inviteToken}`);
  await expect(candidatePage).toHaveURL(/\/welcome/);
  await candidatePage.getByRole('button', { name: /start/i }).click();
  await expect(candidatePage).toHaveURL(/\/exam/);

  // Recruiter: the roster should flip to in_progress live, without a page reload
  await expect(page.getByText('in_progress')).toBeVisible({ timeout: 15_000 });

  await candidateContext.close();
});
```

- [ ] **Step 2: Confirm dev servers and run the spec**

Ensure `apps/api`, `apps/exam-runtime`, and `apps/web` dev servers are running (see this project's documented Docker/WSL2 port-reclaim workaround if the default ports 3000-3002 are unavailable — set `API_PORT`/`NEXT_PUBLIC_API_BASE`/`NEXT_PUBLIC_EXAM_RUNTIME_API_BASE`/`WEB_ORIGIN` accordingly across `apps/api/.env`, `apps/exam-runtime/.env`, and `apps/web/.env.local`, keeping them in sync).

Run: `cd apps/web && npx playwright test e2e/live-monitoring-golden-path.spec.ts`
Expected: `1 passed`.

- [ ] **Step 3: Run it a second time to confirm it isn't flaky**

Run: `cd apps/web && npx playwright test e2e/live-monitoring-golden-path.spec.ts`
Expected: `1 passed`, consistent with the first run.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/live-monitoring-golden-path.spec.ts
git commit -m "test: Playwright live exam monitoring golden-path e2e spec"
```

---

### Task 4: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full frontend unit suite**

Run: `cd apps/web && npm test`
Expected: all suites pass, including Task 1's `useExamMonitoring.test.tsx` (7 tests) and Task 2's `LiveMonitoringPanel.test.tsx` (5 tests).

- [ ] **Step 2: Full backend suites (regression check — no backend files were touched, but confirm nothing else drifted)**

Run from repo root: `npm run test:api && npm run test:api:e2e && npm run test:exam-runtime && npm run test:shared`
Expected: all pass. The pre-existing `ai-question-generation.e2e-spec.ts` flake (missing `ANTHROPIC_API_KEY` in this dev environment) is documented and unrelated — not a regression from this plan.

- [ ] **Step 3: Full Playwright suite**

Run: `cd apps/web && npx playwright test`
Expected: every existing golden path (recruiter, org-admin, candidate, panel) plus the new `live-monitoring-golden-path.spec.ts` all pass.

- [ ] **Step 4: Manual smoke check**

With dev servers running, manually log in as the seeded recruiter, open a published exam with at least one invited candidate, click the Live tab, and confirm: stat tiles render with correct counts, the roster table shows the candidate with the right status/online badge, and the "No proctoring alerts yet." empty state shows. If feasible, start the exam as that candidate in a second browser/incognito window and confirm the recruiter's roster updates live (status flips to `in_progress`, online badge flips to `Online`) without a page reload.

- [ ] **Step 5: Update the SDD progress ledger**

Append to `.superpowers/sdd/progress.md`:

```
## Live Exam Monitoring Dashboard
Task 1: complete (socket.io-client dependency, monitoring types, useExamMonitoring hook)
Task 2: complete (LiveMonitoringPanel component, wired into exam edit page's new Live tab)
Task 3: complete (Playwright live-monitoring-golden-path e2e spec)
Task 4: complete (final verification)
```
