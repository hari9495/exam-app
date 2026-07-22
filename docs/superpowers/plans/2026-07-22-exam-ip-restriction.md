# Exam IP Restriction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A recruiter can set one allowed IP/CIDR range per exam; candidates redeeming or starting from outside it are hard-blocked with a message showing their observed IP, and each block is audit-logged.

**Architecture:** One nullable `Exam.allowedIpRange` column. Range parsing/matching lives in `packages/shared` (single source of truth used by both apps). apps/api validates the value at exam save time via a custom class-validator decorator. apps/exam-runtime enforces at `POST /candidate-auth/redeem` and `POST /attempt/start` using a `resolveClientIp()` helper (socket IP by default; first `X-Forwarded-For` hop only when `TRUST_PROXY=true`), failing closed on malformed stored ranges, and records an `attempt.blocked_ip` audit event via the shared `AuditService` (newly wired into exam-runtime).

**Tech Stack:** NestJS 11, Prisma 5 (SQL Server), class-validator, Node built-in `node:net` (`isIP`, `BlockList`) — no new dependencies. Jest for unit tests, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-07-22-exam-ip-restriction-design.md`

## Global Constraints

- Block message copy, verbatim: `Your network (<ip>) is not approved for this exam. Please contact the exam organizer.` where `<ip>` is the observed client IP.
- Audit event: `action: 'attempt.blocked_ip'`, `entityType: 'invitation'`, `entityId: <invitationId>`, `metadata: { observedIp, allowedIpRange, phase: 'redeem' | 'start' }`, `actorUserId: null`. Log BEFORE throwing.
- Malformed stored range ⇒ fail CLOSED (block + server-side error log). Never silently unrestricted.
- `null`/empty `allowedIpRange` ⇒ no check at all; behavior identical to today.
- Client IP: `req.ip` / socket address by default; first `X-Forwarded-For` hop only when `process.env.TRUST_PROXY === 'true'`. Normalize IPv4-mapped IPv6 (`::ffff:1.2.3.4` → `1.2.3.4`).
- No new npm dependencies.
- Migration note (environment quirk): if `prisma migrate dev` fails on the shadow-database permission and you fall back to `prisma db push`, re-apply the `audit_logs_actor_user_id_fkey` `ON DELETE SET NULL` fix afterwards (see `.claude`/project memory: every `db push` reverts it to `NO_ACTION`):
  ```sql
  ALTER TABLE [dbo].[audit_logs] DROP CONSTRAINT [audit_logs_actor_user_id_fkey];
  ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_actor_user_id_fkey] FOREIGN KEY ([actor_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
  ```

---

### Task 1: Shared IP-range utilities in packages/shared

**Files:**
- Create: `packages/shared/src/network/ip-range.ts`
- Create: `packages/shared/src/network/ip-range.spec.ts`
- Modify: `packages/shared/src/index.ts` (add export line)

**Interfaces:**
- Consumes: Node built-ins only (`node:net`).
- Produces (later tasks rely on these exact names):
  - `isValidIpRange(range: string): boolean` — true iff `range` is a bare IPv4/IPv6 address or valid CIDR (`a.b.c.d/0-32`, `<ipv6>/0-128`).
  - `isIpAllowed(ip: string, range: string): boolean` — exact match for bare-IP ranges, CIDR containment otherwise; returns `false` (fail closed) when `range` is malformed or `ip` is unparseable. Handles IPv4-mapped IPv6 input (`::ffff:203.0.113.4` matches range `203.0.113.0/24`).

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/network/ip-range.spec.ts`:

```typescript
import { isValidIpRange, isIpAllowed } from './ip-range';

describe('isValidIpRange', () => {
  it.each(['203.0.113.4', '2001:db8::1', '203.0.113.0/24', '203.0.113.0/0', '203.0.113.0/32', '2001:db8::/32'])(
    'accepts %s',
    (range) => expect(isValidIpRange(range)).toBe(true),
  );

  it.each(['', 'not-an-ip', '203.0.113.0/33', '203.0.113.0/-1', '203.0.113.0/', '/24', '203.0.113.4 extra', '999.0.0.1'])(
    'rejects %s',
    (range) => expect(isValidIpRange(range)).toBe(false),
  );
});

describe('isIpAllowed', () => {
  it('matches an exact bare IPv4', () => {
    expect(isIpAllowed('203.0.113.4', '203.0.113.4')).toBe(true);
    expect(isIpAllowed('203.0.113.5', '203.0.113.4')).toBe(false);
  });

  it('matches inside/outside an IPv4 CIDR', () => {
    expect(isIpAllowed('203.0.113.200', '203.0.113.0/24')).toBe(true);
    expect(isIpAllowed('203.0.114.1', '203.0.113.0/24')).toBe(false);
  });

  it('normalizes IPv4-mapped IPv6 client addresses', () => {
    expect(isIpAllowed('::ffff:203.0.113.4', '203.0.113.0/24')).toBe(true);
    expect(isIpAllowed('::ffff:203.0.114.1', '203.0.113.0/24')).toBe(false);
  });

  it('matches IPv6 CIDR', () => {
    expect(isIpAllowed('2001:db8::abcd', '2001:db8::/32')).toBe(true);
    expect(isIpAllowed('2001:db9::1', '2001:db8::/32')).toBe(false);
  });

  it('fails closed on a malformed range', () => {
    expect(isIpAllowed('203.0.113.4', 'garbage')).toBe(false);
    expect(isIpAllowed('203.0.113.4', '203.0.113.0/99')).toBe(false);
  });

  it('fails closed on an unparseable client ip', () => {
    expect(isIpAllowed('not-an-ip', '203.0.113.0/24')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "D:\exam app\packages\shared" && npx jest src/network/ip-range.spec.ts
```
Expected: FAIL — `Cannot find module './ip-range'`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/network/ip-range.ts`:

```typescript
import { BlockList, isIP } from 'node:net';

// A range is either a bare IP ("203.0.113.4") or CIDR ("203.0.113.0/24").
function parseRange(range: string): { addr: string; prefix: number; family: 'ipv4' | 'ipv6' } | null {
  const trimmed = range.trim();
  const slash = trimmed.indexOf('/');
  const addr = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const family = isIP(addr);
  if (family === 0) {
    return null;
  }
  const maxPrefix = family === 4 ? 32 : 128;
  let prefix = maxPrefix; // bare IP == /32 or /128
  if (slash !== -1) {
    const prefixPart = trimmed.slice(slash + 1);
    if (!/^\d+$/.test(prefixPart)) {
      return null;
    }
    prefix = Number(prefixPart);
    if (prefix < 0 || prefix > maxPrefix) {
      return null;
    }
  }
  return { addr, prefix, family: family === 4 ? 'ipv4' : 'ipv6' };
}

function normalizeIp(ip: string): { addr: string; family: 'ipv4' | 'ipv6' } | null {
  let candidate = ip.trim();
  // IPv4-mapped IPv6 (::ffff:203.0.113.4) -> plain IPv4 so it can match IPv4 ranges.
  if (candidate.toLowerCase().startsWith('::ffff:') && isIP(candidate.slice(7)) === 4) {
    candidate = candidate.slice(7);
  }
  const family = isIP(candidate);
  if (family === 0) {
    return null;
  }
  return { addr: candidate, family: family === 4 ? 'ipv4' : 'ipv6' };
}

export function isValidIpRange(range: string): boolean {
  return parseRange(range) !== null;
}

// ponytail: fail closed — any parse failure (range OR ip) means "not allowed".
export function isIpAllowed(ip: string, range: string): boolean {
  const parsedRange = parseRange(range);
  const parsedIp = normalizeIp(ip);
  if (!parsedRange || !parsedIp || parsedRange.family !== parsedIp.family) {
    return false;
  }
  const blockList = new BlockList();
  blockList.addSubnet(parsedRange.addr, parsedRange.prefix, parsedRange.family);
  return blockList.check(parsedIp.addr, parsedIp.family);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "D:\exam app\packages\shared" && npx jest src/network/ip-range.spec.ts
```
Expected: PASS, all tests green.

- [ ] **Step 5: Export from the package index**

In `packages/shared/src/index.ts`, append:

```typescript
export * from './network/ip-range';
```

- [ ] **Step 6: Rebuild shared and confirm both apps still compile**

```bash
cd "D:\exam app\packages\shared" && npm run build
cd "D:\exam app\apps\api" && npx tsc --noEmit -p tsconfig.json
cd "D:\exam app\apps\exam-runtime" && npx tsc --noEmit -p tsconfig.json
```
Expected: no errors. (The `prepare`/build step matters: both apps consume `@exam-platform/shared` from `dist/`.)

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/network/ packages/shared/src/index.ts
git commit -m "feat: add shared IP/CIDR range validation and matching utilities"
```

---

### Task 2: Schema + apps/api recruiter surface (column, DTO validation, service wiring)

**Files:**
- Modify: `apps/api/prisma/schema.prisma:256` (Exam model, after `walkInEnabled`)
- Create: `apps/api/prisma/migrations/20260722120000_exam_allowed_ip_range/migration.sql`
- Create: `apps/api/src/exams/dto/is-ip-or-cidr.decorator.ts`
- Modify: `apps/api/src/exams/dto/create-exam.dto.ts`
- Modify: `apps/api/src/exams/exams.service.ts` (`create()` ~line 102-121, `update()` ~line 202-216)
- Test: `apps/api/src/exams/exams.service.spec.ts` (extend)

**Interfaces:**
- Consumes: `isValidIpRange(range: string): boolean` from `@exam-platform/shared` (Task 1).
- Produces: `Exam.allowedIpRange: string | null` Prisma field (later tasks read `exam.allowedIpRange`); `CreateExamDto.allowedIpRange?: string` (also inherited by `UpdateExamDto` — check how `UpdateExamDto` is defined: if it's `PartialType(CreateExamDto)` nothing more is needed; if it re-declares fields, mirror the new field there).

- [ ] **Step 1: Add the schema column**

In `apps/api/prisma/schema.prisma`, `Exam` model, directly under `walkInEnabled`:

```prisma
  allowedIpRange          String?       @map("allowed_ip_range")
```

- [ ] **Step 2: Create the migration**

Create `apps/api/prisma/migrations/20260722120000_exam_allowed_ip_range/migration.sql`:

```sql
ALTER TABLE [dbo].[exams] ADD [allowed_ip_range] NVARCHAR(1000) NULL;
```

Apply it:

```bash
cd "D:\exam app\apps\api" && npx prisma migrate dev --name exam_allowed_ip_range
```

If `migrate dev` fails on the shadow-database permission (known in this environment), fall back to:

```bash
npx prisma db push
npx prisma migrate resolve --applied 20260722120000_exam_allowed_ip_range
```

…then re-apply the `audit_logs_actor_user_id_fkey` fix from Global Constraints (db push reverts it), and regenerate the client:

```bash
npx prisma generate
```

- [ ] **Step 3: Write the failing DTO-decorator test**

The decorator is pure logic wrapped for class-validator; test it through the shared validator plus a direct decorator smoke test inside the service spec is overkill — instead test validation behavior at the service-spec level in Step 6 and keep the decorator itself minimal. (No separate spec file for the decorator.)

- [ ] **Step 4: Write the decorator**

Create `apps/api/src/exams/dto/is-ip-or-cidr.decorator.ts`:

```typescript
import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidIpRange } from '@exam-platform/shared';

export function IsIpOrCidr(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIpOrCidr',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid IP address or CIDR range (e.g. 203.0.113.4 or 203.0.113.0/24)`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidIpRange(value);
        },
      },
    });
  };
}
```

- [ ] **Step 5: Add the DTO field**

In `apps/api/src/exams/dto/create-exam.dto.ts`, after `walkInEnabled`:

```typescript
  @IsOptional()
  @IsIpOrCidr()
  allowedIpRange?: string;
```

with the import at the top:

```typescript
import { IsIpOrCidr } from './is-ip-or-cidr.decorator';
```

Check `UpdateExamDto` (same directory): if it is NOT `PartialType(CreateExamDto)`, add the identical field + import there too.

- [ ] **Step 6: Write the failing service tests**

In `apps/api/src/exams/exams.service.spec.ts`, alongside the existing `walkInEnabled` tests (~line 302), add:

```typescript
  it('persists allowedIpRange on create', async () => {
    const tx = buildCreateTx(); // reuse whatever tx-mock helper the surrounding create() tests use; match local style
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.create(context, 'user-1', { title: 'Exam', allowedIpRange: '203.0.113.0/24' });

    expect(tx.exam.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ allowedIpRange: '203.0.113.0/24' }) }),
    );
  });

  it('persists allowedIpRange when provided on update, and clears it with null', async () => {
    // mirror the walkInEnabled update-test structure at line ~302
  });

  it('leaves allowedIpRange untouched when omitted from the update', async () => {
    // mirror the walkInEnabled omit-test structure at line ~324
  });
```

Copy the exact mock scaffolding style from the adjacent `walkInEnabled` tests — same `findFirst`/`update` mock shape.

Run: `cd "D:\exam app\apps\api" && npx jest src/exams/exams.service.spec.ts`
Expected: new tests FAIL (field not persisted yet).

- [ ] **Step 7: Wire the service**

In `apps/api/src/exams/exams.service.ts`:

`create()` (~line 106-118), add to the `data` object:

```typescript
          allowedIpRange: dto.allowedIpRange ?? null,
```

(Do NOT repeat the `walkInEnabled` gap — this field must work at creation time.)

`update()` (~line 204-215), add alongside the `walkInEnabled` spread:

```typescript
          ...(dto.allowedIpRange !== undefined ? { allowedIpRange: dto.allowedIpRange || null } : {}),
```

(`|| null` so an empty string from a cleared form field stores as NULL = unrestricted, matching the spec's "null/empty = no restriction". Note: because the DTO validator rejects non-empty invalid strings, an empty string must bypass `@IsIpOrCidr` — verify `@IsOptional()` treats `''` as present; if validation rejects `''`, have the frontend send `undefined` for empty instead and drop the `|| null` here in favor of an explicit `allowedIpRange: null` sent by the frontend clear-path. Pick whichever the existing form's submit shape makes natural and cover it in the Step 6 update test.)

- [ ] **Step 8: Run the tests**

```bash
cd "D:\exam app\apps\api" && npx jest src/exams/exams.service.spec.ts && npx tsc --noEmit -p tsconfig.json
```
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260722120000_exam_allowed_ip_range/ apps/api/src/exams/
git commit -m "feat: Exam.allowedIpRange column with validated recruiter API surface"
```

---

### Task 3: exam-runtime enforcement — resolveClientIp, redeem/start checks, audit wiring

**Files:**
- Create: `apps/exam-runtime/src/network/resolve-client-ip.ts`
- Create: `apps/exam-runtime/src/network/resolve-client-ip.spec.ts`
- Modify: `apps/exam-runtime/src/candidate-auth/candidate-auth.controller.ts:15-22` (redeem route)
- Modify: `apps/exam-runtime/src/candidate-auth/candidate-auth.service.ts:26-72` (`redeem()`)
- Modify: `apps/exam-runtime/src/attempts/attempt.controller.ts:25-29` (start route)
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts:185-204` (`start()`)
- Modify: `apps/exam-runtime/src/app.module.ts` (add `AuditModule` import)
- Modify: whichever module files provide `CandidateAuthService`/`AttemptService` if `AuditModule` needs importing per-module rather than globally — mirror how `PrismaModule` is currently made available (check whether it's `@Global()`; `AuditModule` in packages/shared may need the same treatment as its existing consumers in apps/api — copy that wiring pattern).
- Test: `apps/exam-runtime/src/candidate-auth/candidate-auth.service.spec.ts` (extend; create following the existing spec pattern in the folder if absent)
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts` (extend)

**Interfaces:**
- Consumes: `isIpAllowed(ip, range)` from `@exam-platform/shared` (Task 1); `exam.allowedIpRange` (Task 2); `AuditService.record(context, entry)` from `@exam-platform/shared`.
- Produces: `resolveClientIp(req: Request): string`; `CandidateAuthService.redeem(token: string, clientIp: string)`; `AttemptService.start(session, dto, clientIp: string)`. Task 5's e2e relies on the 403 message format from Global Constraints.

- [ ] **Step 1: Write the failing resolveClientIp tests**

Create `apps/exam-runtime/src/network/resolve-client-ip.spec.ts`:

```typescript
import { resolveClientIp } from './resolve-client-ip';
import type { Request } from 'express';

function fakeReq(overrides: { ip?: string; remoteAddress?: string; xff?: string }): Request {
  return {
    ip: overrides.ip,
    socket: { remoteAddress: overrides.remoteAddress },
    headers: overrides.xff !== undefined ? { 'x-forwarded-for': overrides.xff } : {},
  } as unknown as Request;
}

describe('resolveClientIp', () => {
  const originalTrustProxy = process.env.TRUST_PROXY;
  afterEach(() => {
    process.env.TRUST_PROXY = originalTrustProxy;
  });

  it('returns req.ip by default', () => {
    delete process.env.TRUST_PROXY;
    expect(resolveClientIp(fakeReq({ ip: '203.0.113.4', xff: '198.51.100.1' }))).toBe('203.0.113.4');
  });

  it('falls back to socket.remoteAddress when req.ip is missing', () => {
    delete process.env.TRUST_PROXY;
    expect(resolveClientIp(fakeReq({ remoteAddress: '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('uses the first X-Forwarded-For hop only when TRUST_PROXY=true', () => {
    process.env.TRUST_PROXY = 'true';
    expect(resolveClientIp(fakeReq({ ip: '10.0.0.1', xff: '198.51.100.1, 10.0.0.1' }))).toBe('198.51.100.1');
  });

  it('ignores an absent X-Forwarded-For even with TRUST_PROXY=true', () => {
    process.env.TRUST_PROXY = 'true';
    expect(resolveClientIp(fakeReq({ ip: '203.0.113.4' }))).toBe('203.0.113.4');
  });
});
```

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest src/network/resolve-client-ip.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement resolveClientIp**

Create `apps/exam-runtime/src/network/resolve-client-ip.ts`:

```typescript
import type { Request } from 'express';

// Socket address by default. X-Forwarded-For is attacker-controlled unless a trusted
// reverse proxy sets it, so it is honored only behind an explicit deployment opt-in
// (TRUST_PROXY=true, for when the VM ends up fronted by Nginx).
export function resolveClientIp(req: Request): string {
  if (process.env.TRUST_PROXY === 'true') {
    const header = req.headers['x-forwarded-for'];
    const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  return req.ip ?? req.socket?.remoteAddress ?? '';
}
```

Run the spec again — expected: PASS.

- [ ] **Step 3: Write the failing redeem-block tests**

In `apps/exam-runtime/src/candidate-auth/candidate-auth.service.spec.ts` (extend the existing spec; if the file doesn't exist, create it following the DI-mock pattern used by `attempt.service.spec.ts` in the sibling folder — mock `PrismaService`, `TenantPrismaService`, `JwtService`, `MonitoringGateway`, and now `AuditService`):

```typescript
  describe('IP restriction', () => {
    it('blocks redeem from a disallowed IP with the observed IP in the message, and audit-logs it', async () => {
      // invitation + exam mocks as in existing redeem tests, but exam.allowedIpRange = '203.0.113.0/24'
      await expect(service.redeem('tok', '198.51.100.7')).rejects.toThrow(
        'Your network (198.51.100.7) is not approved for this exam. Please contact the exam organizer.',
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: expect.any(String) }),
        expect.objectContaining({
          action: 'attempt.blocked_ip',
          entityType: 'invitation',
          metadata: expect.objectContaining({ observedIp: '198.51.100.7', phase: 'redeem' }),
        }),
      );
    });

    it('allows redeem from an IP inside the range', async () => {
      // same mocks, clientIp '203.0.113.50' -> resolves to a token pair, no audit call
    });

    it('skips the check entirely when allowedIpRange is null', async () => {
      // exam.allowedIpRange = null, any clientIp -> success, no audit call
    });

    it('fails closed when the stored range is malformed', async () => {
      // exam.allowedIpRange = 'garbage' -> ForbiddenException, audit called
    });
  });
```

Run: `npx jest src/candidate-auth` — expected: FAIL (redeem doesn't take a clientIp yet).

- [ ] **Step 4: Implement the redeem check**

`apps/exam-runtime/src/candidate-auth/candidate-auth.service.ts`:

- Add imports: `ForbiddenException` (from `@nestjs/common`), `AuditService`, `isIpAllowed` (from `@exam-platform/shared`).
- Inject `private readonly audit: AuditService` in the constructor.
- Change the signature to `async redeem(token: string, clientIp: string): Promise<CandidateTokenPair>`.
- After the `exam.status !== 'published'` check (line ~41-43), insert:

```typescript
    await this.enforceIpRestriction(exam, invitation.id, clientIp, 'redeem');
```

- Add the private helper (used by nothing else in this service; AttemptService gets its own copy of the same 12 lines in Step 6 — they live in different modules and the logic's single source of truth is `isIpAllowed`, so duplication of the thin wrapper is acceptable):

```typescript
  private async enforceIpRestriction(
    exam: { id: string; organizationId: string; allowedIpRange: string | null },
    invitationId: string,
    clientIp: string,
    phase: 'redeem' | 'start',
  ): Promise<void> {
    if (!exam.allowedIpRange) {
      return;
    }
    if (isIpAllowed(clientIp, exam.allowedIpRange)) {
      return;
    }
    await this.audit
      .record(
        { organizationId: exam.organizationId, isSuperAdmin: true },
        {
          actorUserId: null,
          action: 'attempt.blocked_ip',
          entityType: 'invitation',
          entityId: invitationId,
          metadata: { observedIp: clientIp, allowedIpRange: exam.allowedIpRange, phase },
        },
      )
      .catch(() => undefined); // audit is a side effect; never mask the block itself
    throw new ForbiddenException(
      `Your network (${clientIp}) is not approved for this exam. Please contact the exam organizer.`,
    );
  }
```

- Controller (`candidate-auth.controller.ts` redeem route): add `@Req() req: Request` param and pass the IP:

```typescript
  async redeem(@Body() dto: RedeemInvitationDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.candidateAuthService.redeem(dto.token, resolveClientIp(req));
```

with `import { resolveClientIp } from '../network/resolve-client-ip';` (Request is already imported in this file).

- Module wiring: import `AuditModule` from `@exam-platform/shared` into `apps/exam-runtime/src/app.module.ts`'s `imports` array (and into the candidate-auth/attempt feature modules' `imports` if provider resolution requires it — mirror exactly how apps/api modules consume `AuditModule` today; copy that pattern).

Run the Step 3 tests — expected: PASS.

- [ ] **Step 5: Write the failing start-block tests**

In `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, mirror the four Step 3 cases against `service.start(session, { consent: true }, clientIp)` with `phase: 'start'` in the audit assertion, plus one extra case:

```typescript
    it('does not IP-check an already-existing attempt (idempotent resume path)', async () => {
      // tx.attempt.findUnique resolves an existing attempt; disallowed clientIp
      // -> still returns { id, status } without throwing (resume must keep working
      //    even if the candidate's network changed mid-exam).
    });
```

Run: FAIL.

- [ ] **Step 6: Implement the start check**

`apps/exam-runtime/src/attempts/attempt.service.ts`:

- Imports: `ForbiddenException`, `AuditService`, `isIpAllowed`; inject `private readonly audit: AuditService`.
- Signature: `async start(session: CandidateSession, dto: StartAttemptDto = {}, clientIp = ''): Promise<{ id: string; status: string }>`.
- Inside the `forTenant` callback, AFTER the `existing` early-return (line ~190-192) and BEFORE the consent check, insert:

```typescript
      await this.enforceIpRestriction(exam, invitation.id, clientIp, 'start');
```

- Add the same private `enforceIpRestriction` helper as Task 3 Step 4 (identical 12 lines; `organizationId` is in scope from `resolveContext`, so type the first param as `{ id: string; allowedIpRange: string | null }` and pass `organizationId` as its own argument if that reads cleaner against this service's local style — keep the audit-entry shape and message identical either way).
- Controller (`attempt.controller.ts` start route):

```typescript
  @Post('start')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  start(@CurrentCandidate() candidate: CandidateSession, @Body() dto: StartAttemptDto, @Req() req: Request) {
    return this.attemptService.start(candidate, dto, resolveClientIp(req));
  }
```

adding `Req` to the `@nestjs/common` import, `import type { Request } from 'express';`, and the `resolveClientIp` import.

Run the Step 5 tests — expected: PASS.

- [ ] **Step 7: Full exam-runtime test + typecheck**

```bash
cd "D:\exam app\apps\exam-runtime" && npx jest && npx tsc --noEmit -p tsconfig.json
```
Expected: all green (existing suites must not regress — the default `clientIp = ''` keeps old call sites compiling, and `''` against a null range is a no-op).

- [ ] **Step 8: Commit**

```bash
git add apps/exam-runtime/src/
git commit -m "feat: enforce exam IP restriction at redeem and start with audit logging"
```

---

### Task 4: Frontend — exam builder field + types

**Files:**
- Modify: `apps/web/lib/types.ts` (`Exam` interface, ~line 102-117)
- Modify: `apps/web/components/ExamDetailsForm.tsx`
- Test: `apps/web/components/ExamDetailsForm.test.tsx` (extend, matching the existing walk-in toggle test style)

**Interfaces:**
- Consumes: `CreateExamDto.allowedIpRange` API field (Task 2).
- Produces: `Exam.allowedIpRange: string | null` frontend type; form submits `allowedIpRange: string | undefined` (undefined when blank — per the Task 2 Step 7 decision, blank means "send nothing" on create; on edit of an exam that HAD a value, blank must clear it, so the edit path sends `allowedIpRange: null`). Concretely: `allowedIpRange: allowedIpRange.trim() ? allowedIpRange.trim() : initialExam?.allowedIpRange ? null : undefined` — send `null` to clear only when there was a previous value. Verify against however Task 2 Step 7 landed; the update spread accepts `null` to clear and skips `undefined`. NOTE: if Task 2 chose DTO-level `''`-handling instead, simplify this to always send the trimmed string (`'' ` included) and delete the conditional.

- [ ] **Step 1: Add the type**

`apps/web/lib/types.ts`, `Exam` interface, after `walkInEnabled: boolean;`:

```typescript
  allowedIpRange: string | null;
```

- [ ] **Step 2: Write the failing form test**

In `apps/web/components/ExamDetailsForm.test.tsx`, following the existing walk-in checkbox test's render/submit pattern:

```tsx
  it('submits a trimmed allowedIpRange and omits it when blank', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Save" />);
    await userEvent.type(screen.getByLabelText(/allowed ip \/ cidr range/i), '  203.0.113.0/24  ');
    await userEvent.type(screen.getByLabelText('Title'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ allowedIpRange: '203.0.113.0/24' }));
  });

  it('prefills allowedIpRange from initialExam and sends null when cleared', async () => {
    // initialExam with allowedIpRange: '203.0.113.0/24'; clear the input; submit;
    // expect allowedIpRange: null in the payload.
  });
```

Run: `cd "D:\exam app\apps\web" && npx jest components/ExamDetailsForm.test.tsx` — expected: FAIL.

- [ ] **Step 3: Implement the form field**

`apps/web/components/ExamDetailsForm.tsx`:

- `ExamDetailsValue` interface: add `allowedIpRange?: string | null;`
- State, next to `walkInEnabled` (line ~47): `const [allowedIpRange, setAllowedIpRange] = useState(initialExam?.allowedIpRange ?? '');`
- Submit object (line ~64-71), add:

```typescript
      allowedIpRange: allowedIpRange.trim()
        ? allowedIpRange.trim()
        : initialExam?.allowedIpRange
          ? null
          : undefined,
```

- Render, directly under the walk-in checkbox label (line ~127-130), reusing the project's `Input` primitive:

```tsx
      <Input
        label="Allowed IP / CIDR range (optional)"
        value={allowedIpRange}
        onChange={setAllowedIpRange}
        placeholder="e.g. 203.0.113.4 or 203.0.113.0/24"
      />
```

(Check `Input`'s props first — if it lacks `placeholder`, drop that prop rather than extending the primitive.)

- [ ] **Step 4: Run tests + typecheck**

```bash
cd "D:\exam app\apps\web" && npx jest components/ExamDetailsForm.test.tsx && npx tsc --noEmit -p tsconfig.json
```
Expected: form tests PASS; typecheck shows no NEW errors (pre-existing failures in `QuestionNavigator.test.tsx` / `login,forgot-password,reset-password` page tests are known-unrelated).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/types.ts apps/web/components/ExamDetailsForm.tsx apps/web/components/ExamDetailsForm.test.tsx
git commit -m "feat: allowed IP range field in the exam builder"
```

---

### Task 5: E2E + final verification

**Files:**
- Create: `apps/web/e2e/ip-restriction-golden-path.spec.ts`

**Interfaces:**
- Consumes: everything above end-to-end. Relies on the exact 403 message (Global Constraints) surfacing on the candidate start page — the candidate frontend displays thrown API error messages on redeem failure (same surface that shows "This invitation was revoked").

**Environment for all runs (per project norms):** dev servers on web=3002/api=3501/exam-runtime=3502, API + exam-runtime running with `NODE_ENV=test` set (Playwright doesn't set it; without it `STRICT_AUTH_THROTTLE`'s real 5-logins/60s limit breaks multi-test runs). Redis container `examapp-redis-1` must be up (`docker start examapp-redis-1`).

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/ip-restriction-golden-path.spec.ts`. Localhost's observed IP in this environment is `::1` or `127.0.0.1` — a restriction of `203.0.113.0/24` can never match it, and a restriction of `127.0.0.0/8` plus checking both isn't needed: assert block with the unmatchable range, then clear the range and assert recovery.

```typescript
import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

test('candidate is blocked from a disallowed network and can start once the restriction is cleared', async ({ page, browser }) => {
  // Recruiter: create question + exam WITH an IP range that cannot match localhost
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('IP path: 2 + 2?');
  await page.getByLabel('Marks', { exact: true }).fill('5');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('4');
  await optionInputs.nth(1).fill('5');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `IP Restriction Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByLabel(/allowed ip \/ cidr range/i).fill('203.0.113.0/24');
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /IP path: 2 \+ 2\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `ip-path-${Date.now()}@example.com`;
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('IP Path Candidate');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.locator('.group', { hasText: candidateEmail }).getByRole('checkbox', { name: 'IP Path Candidate' }).click();
  const invitePromise = page.waitForResponse((r) => r.url().includes('/invitations') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send invitations' }).click();
  const inviteToken: string = (await (await invitePromise).json()).created[0].token;

  // Candidate: redeem from localhost — blocked with the message (incl. observed IP wording)
  const candidateContext = await browser.newContext();
  const candidatePage = await candidateContext.newPage();
  await candidatePage.goto(`/start?token=${inviteToken}`);
  await expect(candidatePage.getByText(/is not approved for this exam/i)).toBeVisible();

  // Recruiter: clear the restriction
  await page.getByRole('link', { name: 'Exams' }).click();
  await page.locator('.group', { hasText: examTitle }).getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel(/allowed ip \/ cidr range/i).fill('');
  await page.getByRole('button', { name: 'Save details' }).click();

  // Candidate: retry — now proceeds to the welcome page's practice step
  await candidatePage.goto(`/start?token=${inviteToken}`);
  await expect(candidatePage).toHaveURL(/\/welcome$/);
  await candidatePage.getByRole('button', { name: /skip practice/i }).click();
  await expect(candidatePage.getByText(examTitle)).toBeVisible();

  await candidateContext.close();
});
```

NOTE: the block-message assertion depends on where the `/start` page surfaces redeem errors. Before finalizing, run once and check the actual rendered error surface (`apps/web/app/(candidate)/start/page.tsx`) — adjust the locator to that page's error element if the plain-text match misses, but keep asserting on the `is not approved for this exam` substring.

- [ ] **Step 2: Run the new spec (twice)**

```bash
cd "D:\exam app\apps\web" && WEB_BASE_URL=http://localhost:3002 E2E_API_BASE=http://localhost:3501/api/v1 npx playwright test e2e/ip-restriction-golden-path.spec.ts --reporter=list
```
Expected: PASS, twice in a row.

- [ ] **Step 3: Full-suite regression**

```bash
cd "D:\exam app\apps\api" && npx jest
cd "D:\exam app\apps\exam-runtime" && npx jest
cd "D:\exam app\packages\shared" && npx jest
cd "D:\exam app\apps\web" && WEB_BASE_URL=http://localhost:3002 E2E_API_BASE=http://localhost:3501/api/v1 npx playwright test --reporter=list
```
Expected: all unit suites green; Playwright 13/13 (12 existing + 1 new).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/ip-restriction-golden-path.spec.ts
git commit -m "test: e2e coverage for exam IP restriction block and recovery"
```

---

## Self-Review Notes

- **Spec coverage:** column+null-default (T2), validated recruiter surface both create AND update (T2), enforcement at both redeem and start incl. observed-IP message (T3), fail-closed malformed range (T1 matcher + T3 tests), TRUST_PROXY opt-in with IPv4-mapped normalization (T1/T3), audit event with exact shape wired via newly-imported AuditModule (T3), frontend field + type (T4), e2e block-then-recover (T5). Out-of-scope list untouched. ✓
- **Known judgment point left to the implementer with both options spelled out:** empty-string-vs-null clearing semantics (T2 Step 7 / T4 interfaces) — the two tasks reference each other's decision explicitly.
- **Type consistency:** `redeem(token, clientIp)`, `start(session, dto, clientIp)`, `resolveClientIp(req)`, `isIpAllowed(ip, range)`, `isValidIpRange(range)` used identically across tasks. ✓
