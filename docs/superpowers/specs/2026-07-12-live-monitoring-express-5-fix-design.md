# Live-Monitoring Express-5 Fix (Bug #6036) — Design Spec

## 1. Context & Scope

Phase 6e's NestJS v10→v11 migration (commit `b269c17`) broke `apps/exam-runtime`'s `MonitoringGateway` (Socket.IO — staff watching candidate exam sessions live). All 4 `live-monitoring.e2e-spec.ts` tests fail with 30s timeouts; every real deployment since that migration has this proctoring feature completely broken. Root cause was rigorously diagnosed during Phase 6e via a controlled A/B test: `@nestjs/platform-express@11` pulls Express as a transitive dependency, which jumped `4.22.1` → `5.2.1`. Two documented community workarounds (`useWebSocketAdapter(new IoAdapter(app))`, `new IoAdapter(app.getHttpServer())`) and a full Express-4 pin attempt were tried and failed — the pin crashes the entire app's boot, since `@nestjs/platform-express@11` itself internally requires Express 5's `app.router` shape.

**Root cause, now confirmed at the source-code level (not inferred from symptoms) during this bug's own scoping:**

- `@nestjs/platform-express`'s `ExpressAdapter` does `this.httpServer = http.createServer(this.getInstance())` at app-creation time (`node_modules/@nestjs/platform-express/adapters/express-adapter.js:182`) — registering Express as the httpServer's **first** `'request'` listener, before any WebSocket gateway exists.
- `engine.io@6.6.9`'s `Server.attach()` does a plain `server.on("request", ...)` (`node_modules/engine.io/build/server.js:662`) — no `prependListener`, no priority mechanism. Since NestJS's Socket.IO gateway attaches later, during `app.listen()`, Engine.IO is **always** the second `'request'` listener on the shared httpServer, unconditionally.
- Node's `http.Server` invokes all `'request'` listeners for the same request/response pair, in registration order. Under Express 4, Express's own 404 for an unmatched `/socket.io/*` path evidently completed slowly/asynchronously enough that Engine.IO's second listener still got to respond first in practice. Express 5's rewritten router now completes that same 404 **synchronously**, winning the race and ending the response before Engine.IO's listener ever runs — confirmed via Phase 6e's own debug-log capture showing the actual HTTP response to Engine.IO's polling request is NestJS's own `NotFoundException` JSON body.

Neither previously-tried workaround touches *when Express itself responds* — the actual variable that changed between Express 4 and 5 — which is why both failed.

**Confirmed clean scope separation:** `apps/api` has zero `@WebSocketGateway`/`@nestjs/websockets`/`@nestjs/platform-socket.io` usage anywhere (grepped, zero matches). Only `apps/exam-runtime`'s `MonitoringGateway` (`apps/exam-runtime/src/monitoring/monitoring.gateway.ts`) uses Socket.IO. The separately-flagged `@types/express` mismatch (`apps/api/package.json` still declares `^4.17.21` while the actual runtime `express` is now `5.2.1`, transitively) is `apps/api`-only and has no functional overlap with the gateway fix — included in this same work per explicit approval, as a small, contained addition.

## 2. Architecture

In `apps/exam-runtime/src/main.ts`'s public app bootstrap (the app instance that owns `MonitoringGateway` — the internal app, bootstrapped separately in the same file, has no WebSocket gateway and needs no change), register a raw Express middleware via `app.use()` as the very first middleware in the stack — before `app.enableCors()`'s effect matters for this path, before `app.setGlobalPrefix()`, before `app.listen()`:

```ts
app.use((req, res, next) => {
  if (req.url.startsWith('/socket.io/')) return;
  next();
});
```

For any request whose URL starts with `/socket.io/` (Engine.IO's default path, matching this app's actual configuration — no custom `path` option is set anywhere in this codebase, confirmed by grep), the middleware returns immediately: it does not call `next()`, and it does not touch `res` in any way. This leaves the request/response pair exactly as Node's `http.Server` delivered it — untouched, headers unsent — for Engine.IO's already-registered second `'request'` listener to handle on its own turn, restoring the same practical outcome Express 4's slower response timing used to provide by accident.

For every other path, `next()` passes control into NestJS's normal routing pipeline, completely unaffected — this is a zero-risk, additive change for all non-Socket.IO traffic.

**`apps/api`'s `@types/express`**: bump from `^4.17.21` to a `^5.x` version compatible with the already-installed runtime `express@5.2.1` (exact target version to be confirmed against the npm registry at implementation time — `@types/express@^5` is the expected target, verified by checking it doesn't introduce new compile errors against this codebase's actual usage of Express-derived types, e.g. any `Request`/`Response` typed parameters).

## 3. File Structure

- **Modify** `apps/exam-runtime/src/main.ts` — add the middleware to the public app's bootstrap, before `app.listen()`.
- **Modify** `apps/api/package.json` — bump `@types/express` devDependency.
- **Modify** `package-lock.json` — regenerated by the `@types/express` bump.

No new files. No test-file-only changes are anticipated as their own line items — `live-monitoring.e2e-spec.ts` already exists and is the exact spec this fix must make pass again; no new spec is needed since the feature and its test already existed before Phase 6e's migration broke them.

## 4. Testing & Verification Approach

Matches this project's established required-gate discipline for anything touching this specific feature, since it was silently broken in production before Phase 6e's own e2e run caught it:

1. `apps/exam-runtime` unit suite (`npm run test:exam-runtime`) — confirm no regression, count at or above the current baseline (164/164, 19 suites, per Phase 6e's own final state).
2. `live-monitoring.e2e-spec.ts` run in isolation first — confirm all 4 tests pass (not the 30s timeouts currently occurring), before running anything broader.
3. Full `apps/api` e2e suite (`npm run test:api:e2e -- --runInBand`) — confirm no other regression from this change; expect 71/71 now (up from Phase 6e's disclosed 63/71, since this fix closes the one real regression — `tenant-isolation.e2e-spec.ts`'s pre-existing environmental failure is unrelated and expected to persist independently of this fix).
4. A live manual connection check via a real `socket.io-client` against the actual running dev server (not just the automated Jest suite) — this exact feature was broken in real deployments while its own e2e suite result was disclosed but not blocking, so an extra, genuinely-live confirmation beyond the test suite is warranted before considering this closed.
5. `apps/api` build (`npm run build --workspace=apps/api`) — confirm the `@types/express` bump doesn't introduce new compile errors.

## 5. Open Items

- The exact `@types/express` target version (`^5.x`, specific patch) is not pre-decided — to be confirmed empirically at implementation time by checking it resolves cleanly against `express@5.2.1` and doesn't break this codebase's existing Express-typed usage.
- This fix does not address the `webpack`/`postcss`/`uuid`/`ajv`/`qs` moderate/low findings still present in `npm audit` (Phase 6e's own designed scope boundary — this bug is specifically about the live-monitoring regression, not a fresh audit pass).
- No change to `apps/exam-runtime`'s internal (non-public) app is anticipated, since it has no WebSocket gateway — confirmed via `apps/exam-runtime/src/internal-app.module.ts`'s own module imports, which don't include `MonitoringModule`.
