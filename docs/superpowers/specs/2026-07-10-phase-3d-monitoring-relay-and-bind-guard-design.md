# Phase 3d — Monitoring-Relay Removal & Internal Bind-Host Regression Guard Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-10
**Depends on:** Phase 3c (Internal Surface Hardening) — merged to `main` (commit `fe09f4b`). This spec directly addresses the two "Phase 3d entry criteria" that Phase 3c's final whole-branch review recorded in its own design doc's Open Items section.

---

## 1. Context and Scope

Phase 3c split `apps/exam-runtime`'s bootstrap into a public app (0.0.0.0) and an internal app (127.0.0.1, shared-secret-guarded). Mid-phase, a bug fix added `BroadcastRelayController`'s `/monitoring-relay/*` routes to the *public* app, so the internal app (which has no WebSocket connections of its own) could push live-monitoring events back into the public app's `MonitoringGateway` over HTTP. Its final review flagged two gaps:

1. `/monitoring-relay/*` sits on the public 0.0.0.0 listener, guarded only by the same shared secret as the rest of the internal surface — a leaked secret lets an off-host caller inject `attempt:status`/`message:sent` events into any exam's recruiter monitoring room. This partially undercuts the network-isolation goal Phase 3c was built around.
2. The internal app's `127.0.0.1` default bind host (`main.ts`'s `?? '127.0.0.1'`) has no automated regression guard — only a one-time manual `curl` check proved it today. A future edit to that default would silently expose the internal surface with no test failure.

**Goal of this sub-phase:** close both gaps at the code level.

### In scope
- Replace the HTTP-based monitoring relay with an in-process event bus, removing `/monitoring-relay/*` from the public listener entirely.
- Extract the internal app's bind-host default into a small, directly unit-testable function, with a test that fails loudly if the default ever changes.

### Explicitly out of scope (deferred to later sub-phases)
- **Custom domain + SSL automation, email domain verification, region-sharded deployment, load testing to 10K+ concurrent, autoscaling tuning** — the remaining Phase 3 roadmap items; each needs its own scoping session.
- **Any other change to the internal surface's authorization model** (mTLS, per-caller keys, request signing) — still not identified as a real gap for the current single-caller topology.
- **Splitting `apps/exam-runtime`'s two Nest apps into genuinely separate processes/hosts** — not on the roadmap; the in-process event bus this phase introduces assumes they stay co-located. If a future phase splits them, that phase reintroduces a relay (HTTP or otherwise) between them as part of that larger change — a small, well-contained addition at that point, not a reason to keep one now.

---

## 2. Removing the HTTP Monitoring Relay

### Shared in-process event bus

New file `apps/exam-runtime/src/monitoring/monitoring-event-bus.ts`: a small typed wrapper around Node's `EventEmitter`, exported as one module-level singleton.

```typescript
import { EventEmitter } from 'events';

export interface AttemptStatusEvent {
  examId: string;
  attemptId: string;
  candidateId: string;
  status: string;
}

export interface MessageSentEvent {
  examId: string;
  attemptId: string;
  candidateId: string;
  sentAt: Date;
}

class MonitoringEventBus extends EventEmitter {
  emitAttemptStatus(event: AttemptStatusEvent): void {
    this.emit('attempt-status', event);
  }

  onAttemptStatus(listener: (event: AttemptStatusEvent) => void): void {
    this.on('attempt-status', listener);
  }

  emitMessageSent(event: MessageSentEvent): void {
    this.emit('message-sent', event);
  }

  onMessageSent(listener: (event: MessageSentEvent) => void): void {
    this.on('message-sent', listener);
  }
}

export const monitoringEventBus = new MonitoringEventBus();
```

Both `apps/exam-runtime`'s public and internal Nest apps run in the same Node process (see Phase 3c, Section 2), so importing this module from either app's DI container resolves to the same object via Node's module cache — no Nest-level cross-container wiring is needed.

### Replacing the broadcaster

`RelayingAttemptStatusBroadcaster` (`relaying-attempt-status-broadcaster.ts`) and its spec are deleted. A new `EventBusAttemptStatusBroadcaster` (`event-bus-attempt-status-broadcaster.ts`) implements `AttemptStatusBroadcaster` by publishing directly onto `monitoringEventBus`:

```typescript
@Injectable()
export class EventBusAttemptStatusBroadcaster implements AttemptStatusBroadcaster {
  async emitAttemptStatus(examId: string, payload: { attemptId: string; candidateId: string; status: string }): Promise<void> {
    monitoringEventBus.emitAttemptStatus({ examId, ...payload });
  }

  async emitMessageSent(examId: string, payload: { attemptId: string; candidateId: string; sentAt: Date }): Promise<void> {
    monitoringEventBus.emitMessageSent({ examId, ...payload });
  }
}
```

No `fetch`, no JSON serialization, no `x-internal-secret` header — `sentAt` stays a real `Date` object end-to-end instead of round-tripping through an ISO string. `remote-monitoring-bridge.module.ts` (internal-app-only, `@Global()`) binds `ATTEMPT_STATUS_BROADCASTER` to `EventBusAttemptStatusBroadcaster` instead of the old relay class; nothing else about that module changes.

### New subscriber

New file `apps/exam-runtime/src/monitoring/monitoring-event-bus-bridge.ts`: a public-app-only `OnModuleInit` provider that subscribes to the bus and forwards events into the existing `MonitoringGateway`.

```typescript
@Injectable()
export class MonitoringEventBusBridge implements OnModuleInit {
  constructor(private readonly monitoringGateway: MonitoringGateway) {}

  onModuleInit(): void {
    monitoringEventBus.onAttemptStatus(({ examId, ...payload }) => this.monitoringGateway.emitAttemptStatus(examId, payload));
    monitoringEventBus.onMessageSent(({ examId, ...payload }) => this.monitoringGateway.emitMessageSent(examId, payload));
  }
}
```

Registered as a provider in `MonitoringModule` (imported only by the public app's `AppModule`, per Phase 3c's module graph — see `local-monitoring-bridge.module.ts`), so it's only ever instantiated once, in the process's public-app DI container. `MonitoringGateway` itself is untouched — it still only knows how to push to socket.io rooms, not where events come from.

### Deletions

- `broadcast-relay.controller.ts` and `broadcast-relay.controller.spec.ts`
- `dto/relay-attempt-status.dto.ts`, `dto/relay-message-sent.dto.ts`
- `BroadcastRelayController` removed from `MonitoringModule`'s `controllers` array
- `EXAM_RUNTIME_PUBLIC_URL` plumbing in `main.ts` (the comment and env-var assignment) and `apps/api/test/dual-app.ts` (the comment and env-var assignment) — it existed solely to point the old HTTP relay at the public app's own port and has no other reader (confirmed: no other file references it)

Net effect: the public app's 0.0.0.0 listener loses the `/monitoring-relay/*` routes entirely. The vulnerability class Phase 3c's review flagged — an off-host caller with the shared secret injecting monitoring events — no longer exists as an attack surface, rather than being defended against with stronger auth.

---

## 3. Internal Bind-Host Regression Guard

### Extracting the resolver

New file `apps/exam-runtime/src/bootstrap-config.ts`:

```typescript
export function resolveInternalBindHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.EXAM_RUNTIME_INTERNAL_HOST ?? '127.0.0.1';
}
```

`main.ts`'s `bootstrap()` calls `resolveInternalBindHost()` in place of the inline `process.env.EXAM_RUNTIME_INTERNAL_HOST ?? '127.0.0.1'` expression it passes to `internalApp.listen(...)`. Behavior is unchanged; the default is now a named, independently testable unit.

### Test

New `bootstrap-config.spec.ts` asserts:
- `resolveInternalBindHost({})` (no `EXAM_RUNTIME_INTERNAL_HOST` key) returns `'127.0.0.1'`
- `resolveInternalBindHost({ EXAM_RUNTIME_INTERNAL_HOST: '10.0.0.5' })` returns `'10.0.0.5'`

This directly guards the exact value Phase 3c's review was concerned about regressing, without needing to boot a real server or refactor `main.ts`'s self-invoking `bootstrap()` into something importable. The existing e2e test harness (`apps/api/test/dual-app.ts`) intentionally hardcodes `'127.0.0.1'` when booting the internal app for tests (see Phase 3c, Section 2) and so does not and should not exercise this resolver — it tests the DI-container wiring, not `main.ts`'s bootstrap logic, which is exactly the gap this unit test fills.

---

## 4. Testing Approach

- **Unit tests:**
  - `event-bus-attempt-status-broadcaster.spec.ts` (replaces the deleted relay spec): asserts `emitAttemptStatus`/`emitMessageSent` publish onto `monitoringEventBus` with the correct payload shape, including that `sentAt` stays a `Date` instance (not stringified).
  - `monitoring-event-bus-bridge.spec.ts`: asserts that events published on the bus are forwarded into the injected `MonitoringGateway`'s `emitAttemptStatus`/`emitMessageSent` with the same payload.
  - `bootstrap-config.spec.ts`: the default/override cases in Section 3.
- **e2e:** `live-monitoring.e2e-spec.ts` (one of the four existing dual-app specs) already exercises an internal-app-triggered event reaching a recruiter's socket end-to-end through the old HTTP relay. It must keep passing unchanged against the new in-process event bus — this is the real proof the cross-app wiring still works, not just that the unit tests pass in isolation. No new e2e spec is needed.
- **Deleted:** `broadcast-relay.controller.spec.ts` (tests a controller that no longer exists), `relaying-attempt-status-broadcaster.spec.ts` (tests a class that no longer exists).

---

## 5. Open Items / Deferred to Future Sub-Phases

- Custom domain + SSL automation, email domain verification, region-sharded deployment, load testing to 10K+ concurrent, autoscaling tuning — all separate, larger sub-phases per the original roadmap, each needing its own scoping session.
- Real network-edge enforcement (firewall/security group rules) — still waits on a future phase that deploys to real cloud infrastructure, per Phase 3c.
- If a future phase splits `apps/exam-runtime`'s public and internal apps into separate processes or hosts, the in-process event bus this phase introduces stops working and that phase must reintroduce some cross-process relay mechanism — flagged here as a load-bearing assumption of this design, not a blocking concern today.

No new entry criteria are being carried forward from this phase — both gaps it addresses are closed, not narrowed.
