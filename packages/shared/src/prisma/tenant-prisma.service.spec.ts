import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService, POOL_EXHAUSTED_RESPONSE } from './tenant-prisma.service';
import { PrismaService } from './prisma.service';

describe('TenantPrismaService', () => {
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  // `TenantPrismaService`'s constructor now calls `this.prisma.$extends(softDeleteExtension)`
  // to build the filtered client `forTenant` transacts through -- so every fake `prisma` needs a
  // `$extends` that hands back a filtered stand-in with its OWN `$transaction` spy. That's what
  // lets these tests both keep asserting on `forTenant`'s tx behavior (via `filteredTransaction`,
  // wired to the same `transactionImpl` every existing test already expects) and prove the
  // routing split: `forTenant` must go through the extended/filtered `$transaction`,
  // `forTenantIncludingDeleted` through the raw one -- never the other.
  function makeService(transactionImpl: (cb: (tx: any) => Promise<any>) => Promise<any>) {
    const filteredTransaction = jest.fn(transactionImpl);
    const rawTransaction = jest.fn(transactionImpl);
    const extends_ = jest.fn(() => ({ $transaction: filteredTransaction }));
    const prisma = { $transaction: rawTransaction, $extends: extends_ } as unknown as PrismaService;
    const service = new TenantPrismaService(prisma);
    return { service, filteredTransaction, rawTransaction, extends: extends_ };
  }

  // $executeRaw is a tagged-template call: jest records each invocation as
  // [templateStrings, ...interpolatedValues]. The reset statements hard-code
  // NULL/0 as literal SQL text (no interpolation), so the raw joined text is
  // what to assert on -- this fails if the reset is reordered, targets the
  // wrong session-context key, or resets to the wrong value.
  function resetSql(executeRaw: jest.Mock, callIndex: number) {
    return (executeRaw.mock.calls[callIndex][0] as string[]).join('');
  }

  // Set calls interpolate a value (org id, super-admin flag, user id,
  // governed flag), so unlike resetSql this also returns the interpolated
  // arg (calls[i][1]) alongside the literal SQL text around it.
  function setCall(executeRaw: jest.Mock, callIndex: number) {
    const call = executeRaw.mock.calls[callIndex];
    return { sql: (call[0] as string[]).join(''), value: call[1] };
  }

  // With no userId on the context, forTenant skips the app_current_user SET
  // entirely -- so the base fixture context always produces 3 set calls
  // (org, super-admin, governed) + 4 reset calls (governed, user, super-admin,
  // org) = 7 total. A context that also carries userId adds one more set
  // call (app_current_user) for 8 total.
  const UNGOVERNED_TOTAL_CALLS = 7;

  it('returns the callback result and resets session context to null/0 on success', async () => {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const tx = { $executeRaw: executeRaw };
    const { service, filteredTransaction, rawTransaction } = makeService((cb) => cb(tx));

    const result = await service.forTenant(context, async () => 'ok');

    expect(result).toBe('ok');
    // set org, set super-admin, set governed (no userId -> no app_current_user set),
    // reset governed, reset user, reset super-admin, reset org
    expect(executeRaw).toHaveBeenCalledTimes(UNGOVERNED_TOTAL_CALLS);
    // Super-admin is cleared first (mirrors "clear the more dangerous flag
    // first"), then org, then the record-visibility bit, then the user id --
    // the record-visibility keys are strictly less dangerous to strand than
    // super-admin/org, so they clear last.
    expect(resetSql(executeRaw, 3)).toBe("EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 0");
    expect(resetSql(executeRaw, 4)).toBe("EXEC sp_set_session_context @key = N'app_current_org', @value = NULL");
    expect(resetSql(executeRaw, 5)).toBe("EXEC sp_set_session_context @key = N'app_record_visibility_governed', @value = 0");
    expect(resetSql(executeRaw, 6)).toBe("EXEC sp_set_session_context @key = N'app_current_user', @value = NULL");
    // Routing: forTenant must run through the soft-delete-filtered client's $transaction, never
    // the raw one -- that's the whole point of the recycle-bin fix (the redirect must land on the
    // tx-scoped client, and this is the tx forTenant is supposed to open in the first place).
    expect(filteredTransaction).toHaveBeenCalledTimes(1);
    expect(rawTransaction).not.toHaveBeenCalled();
  });

  it('still resets session context to null/0 when the callback throws a non-P2028 error', async () => {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const tx = { $executeRaw: executeRaw };
    const { service } = makeService((cb) => cb(tx));

    await expect(
      service.forTenant(context, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(executeRaw).toHaveBeenCalledTimes(UNGOVERNED_TOTAL_CALLS);
    expect(resetSql(executeRaw, 3)).toBe("EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 0");
    expect(resetSql(executeRaw, 4)).toBe("EXEC sp_set_session_context @key = N'app_current_org', @value = NULL");
    expect(resetSql(executeRaw, 5)).toBe("EXEC sp_set_session_context @key = N'app_record_visibility_governed', @value = 0");
    expect(resetSql(executeRaw, 6)).toBe("EXEC sp_set_session_context @key = N'app_current_user', @value = NULL");
  });

  it('still resets session context when the callback throws an HttpException (business-logic 4xx/409)', async () => {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const tx = { $executeRaw: executeRaw };
    const { service } = makeService((cb) => cb(tx));
    const conflict = new HttpException('Attempt already submitted', HttpStatus.CONFLICT);

    let caught: unknown;
    try {
      await service.forTenant(context, async () => {
        throw conflict;
      });
    } catch (error) {
      caught = error;
    }

    // Must come back out exactly as thrown -- not turned into "server busy".
    expect(caught).toBe(conflict);
    expect((caught as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    expect(executeRaw).toHaveBeenCalledTimes(UNGOVERNED_TOTAL_CALLS);
    expect(resetSql(executeRaw, 3)).toBe("EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 0");
    expect(resetSql(executeRaw, 4)).toBe("EXEC sp_set_session_context @key = N'app_current_org', @value = NULL");
    expect(resetSql(executeRaw, 5)).toBe("EXEC sp_set_session_context @key = N'app_record_visibility_governed', @value = 0");
    expect(resetSql(executeRaw, 6)).toBe("EXEC sp_set_session_context @key = N'app_current_user', @value = NULL");
  });

  describe('record-visibility session context (app_current_user / app_record_visibility_governed)', () => {
    it('sets app_current_user and app_record_visibility_governed=1 for a governed role (recruiter), and resets both', async () => {
      const executeRaw = jest.fn().mockResolvedValue(undefined);
      const tx = { $executeRaw: executeRaw };
      const { service } = makeService((cb) => cb(tx));
      const governedContext = { organizationId: 'org-1', isSuperAdmin: false, userId: 'U1', role: 'recruiter' };

      const result = await service.forTenant(governedContext, async () => 'ok');

      expect(result).toBe('ok');
      // org, super-admin, user, governed (set) + governed, user, super-admin, org (reset)
      expect(executeRaw).toHaveBeenCalledTimes(8);
      const userSet = setCall(executeRaw, 2);
      expect(userSet.sql).toBe("EXEC sp_set_session_context @key = N'app_current_user', @value = ");
      expect(userSet.value).toBe('U1');
      const governedSet = setCall(executeRaw, 3);
      expect(governedSet.sql).toBe("EXEC sp_set_session_context @key = N'app_record_visibility_governed', @value = ");
      expect(governedSet.value).toBe(1);
      // Reset order: super-admin, org, then the record-visibility keys (governed, user) last.
      expect(resetSql(executeRaw, 4)).toBe("EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 0");
      expect(resetSql(executeRaw, 5)).toBe("EXEC sp_set_session_context @key = N'app_current_org', @value = NULL");
      expect(resetSql(executeRaw, 6)).toBe("EXEC sp_set_session_context @key = N'app_record_visibility_governed', @value = 0");
      expect(resetSql(executeRaw, 7)).toBe("EXEC sp_set_session_context @key = N'app_current_user', @value = NULL");
    });

    it('sets app_record_visibility_governed=0 for a non-governed role (org_admin) even with a userId present', async () => {
      const executeRaw = jest.fn().mockResolvedValue(undefined);
      const tx = { $executeRaw: executeRaw };
      const { service } = makeService((cb) => cb(tx));
      const adminContext = { organizationId: 'org-1', isSuperAdmin: true, userId: 'U2', role: 'org_admin' };

      await service.forTenant(adminContext, async () => 'ok');

      const governedSet = setCall(executeRaw, 3);
      expect(governedSet.sql).toBe("EXEC sp_set_session_context @key = N'app_record_visibility_governed', @value = ");
      expect(governedSet.value).toBe(0);
    });

    it('skips the app_current_user SET when the context has no userId', async () => {
      const executeRaw = jest.fn().mockResolvedValue(undefined);
      const tx = { $executeRaw: executeRaw };
      const { service } = makeService((cb) => cb(tx));
      const noUserContext = { organizationId: 'org-1', isSuperAdmin: false, role: 'recruiter' };

      await service.forTenant(noUserContext, async () => 'ok');

      // org, super-admin, governed (set; no app_current_user set at all) +
      // super-admin, org, governed, user (reset) = 7 total.
      expect(executeRaw).toHaveBeenCalledTimes(UNGOVERNED_TOTAL_CALLS);
      const governedSet = setCall(executeRaw, 2);
      expect(governedSet.sql).toBe("EXEC sp_set_session_context @key = N'app_record_visibility_governed', @value = ");
      expect(governedSet.value).toBe(1);
      // No call anywhere sets app_current_user to a real value -- only the
      // unconditional reset (to NULL) touches that key.
      const userSets = executeRaw.mock.calls.filter((call) => (call[0] as string[]).join('').includes('app_current_user') && (call[0] as string[]).join('') !== "EXEC sp_set_session_context @key = N'app_current_user', @value = NULL");
      expect(userSets).toHaveLength(0);
    });
  });

  it('maps a P2028 (transaction unavailable) rejection from $transaction to a 503 with the { error, message } shape', async () => {
    const p2028 = new Prisma.PrismaClientKnownRequestError('Unable to start a transaction in the given time', {
      code: 'P2028',
      clientVersion: '5.10.0',
    });
    const { service } = makeService(() => Promise.reject(p2028));
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    let caught: unknown;
    try {
      await service.forTenant(context, async () => 'unreachable');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HttpException);
    const httpError = caught as HttpException;
    expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(httpError.getResponse()).toEqual(POOL_EXHAUSTED_RESPONSE);
    // Candidate-facing message must not leak Prisma internals.
    expect(JSON.stringify(httpError.getResponse())).not.toMatch(/P2028|Prisma|transaction/i);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('P2028'));
    warnSpy.mockRestore();
  });

  // P2024 ("timed out fetching a new connection from the pool") is the non-transactional
  // counterpart to P2028 -- $transaction itself can reject with it before the callback ever
  // runs, if the pool is exhausted before an interactive transaction is even opened. An earlier
  // review flagged this code as unmatched by the original P2028-only guard; must map the same way.
  it('maps a P2024 (pool exhausted) rejection from $transaction to the same 503', async () => {
    const p2024 = new Prisma.PrismaClientKnownRequestError('Timed out fetching a new connection from the connection pool', {
      code: 'P2024',
      clientVersion: '5.10.0',
    });
    const { service } = makeService(() => Promise.reject(p2024));
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    let caught: unknown;
    try {
      await service.forTenant(context, async () => 'unreachable');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HttpException);
    const httpError = caught as HttpException;
    expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(httpError.getResponse()).toEqual(POOL_EXHAUSTED_RESPONSE);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('P2024'));
    warnSpy.mockRestore();
  });

  it('propagates a different Prisma error code unchanged', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.10.0',
    });
    const { service } = makeService(() => Promise.reject(p2002));

    await expect(service.forTenant(context, async () => 'unreachable')).rejects.toBe(p2002);
  });

  it('propagates a non-Prisma error unchanged', async () => {
    const genericError = new Error('connection refused');
    const { service } = makeService(() => Promise.reject(genericError));

    await expect(service.forTenant(context, async () => 'unreachable')).rejects.toBe(genericError);
  });

  describe('when the session-context reset itself fails', () => {
    // Simulates the P2028-expiry hazard: the callback ran against a
    // transaction that's now dead, so the first reset $executeRaw call
    // (app_is_super_admin, which runs first) rejects and short-circuits the
    // remaining three sequential reset awaits.
    function makeResetFailingTx() {
      const resetError = new Error('Transaction already closed');
      const executeRaw = jest
        .fn()
        .mockResolvedValueOnce(undefined) // set org
        .mockResolvedValueOnce(undefined) // set super-admin
        .mockResolvedValueOnce(undefined) // set governed (no userId in base `context` -> no app_current_user set)
        .mockRejectedValueOnce(resetError); // reset super-admin (runs first, throws)
      return { tx: { $executeRaw: executeRaw }, executeRaw, resetError };
    }

    it('still returns the callback result when the reset throws, and logs the failure', async () => {
      const { tx, executeRaw } = makeResetFailingTx();
      const { service } = makeService((cb) => cb(tx));
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      const result = await service.forTenant(context, async () => 'ok');

      // The caller must see the callback's own result -- not have it replaced
      // or masked by the reset failure. Only 4 calls: set org, set
      // super-admin, set governed, reset super-admin (which throws and
      // short-circuits the remaining three reset statements).
      expect(result).toBe('ok');
      expect(executeRaw).toHaveBeenCalledTimes(4);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('TENANT_SESSION_CONTEXT_RESET_FAILED'));
      // No connection string, org id, or candidate data in the log line.
      expect(errorSpy.mock.calls[0][0]).not.toMatch(/org-1/);
      errorSpy.mockRestore();
    });

    it('still surfaces the callback error (not the reset error) when both throw, and logs the reset failure', async () => {
      const { tx, executeRaw } = makeResetFailingTx();
      const { service } = makeService((cb) => cb(tx));
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const callbackError = new Error('callback boom');

      let caught: unknown;
      try {
        await service.forTenant(context, async () => {
          throw callbackError;
        });
      } catch (error) {
        caught = error;
      }

      // The caller must see the callback's own error -- the reset's error
      // must not mask it.
      expect(caught).toBe(callbackError);
      expect(executeRaw).toHaveBeenCalledTimes(4);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('TENANT_SESSION_CONTEXT_RESET_FAILED'));
      errorSpy.mockRestore();
    });
  });

  describe('forTenantIncludingDeleted', () => {
    it('sets and resets session context identically to forTenant, and returns the callback result', async () => {
      const executeRaw = jest.fn().mockResolvedValue(undefined);
      const tx = { $executeRaw: executeRaw };
      const { service } = makeService((cb) => cb(tx));

      const result = await service.forTenantIncludingDeleted(context, async () => 'ok');

      expect(result).toBe('ok');
      expect(executeRaw).toHaveBeenCalledTimes(UNGOVERNED_TOTAL_CALLS);
      expect(resetSql(executeRaw, 3)).toBe("EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 0");
      expect(resetSql(executeRaw, 4)).toBe("EXEC sp_set_session_context @key = N'app_current_org', @value = NULL");
      expect(resetSql(executeRaw, 5)).toBe("EXEC sp_set_session_context @key = N'app_record_visibility_governed', @value = 0");
      expect(resetSql(executeRaw, 6)).toBe("EXEC sp_set_session_context @key = N'app_current_user', @value = NULL");
    });

    // Routing: forTenantIncludingDeleted must run through the RAW client's $transaction, never
    // the filtered one -- that's what makes soft-deleted rows visible to it.
    it('routes through the raw client, not the soft-delete-filtered one', async () => {
      const executeRaw = jest.fn().mockResolvedValue(undefined);
      const tx = { $executeRaw: executeRaw };
      const { service, filteredTransaction, rawTransaction } = makeService((cb) => cb(tx));

      await service.forTenantIncludingDeleted(context, async () => 'ok');

      expect(rawTransaction).toHaveBeenCalledTimes(1);
      expect(filteredTransaction).not.toHaveBeenCalled();
    });

    it('still resets session context when the callback throws', async () => {
      const executeRaw = jest.fn().mockResolvedValue(undefined);
      const tx = { $executeRaw: executeRaw };
      const { service } = makeService((cb) => cb(tx));

      await expect(
        service.forTenantIncludingDeleted(context, async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(executeRaw).toHaveBeenCalledTimes(UNGOVERNED_TOTAL_CALLS);
      expect(resetSql(executeRaw, 3)).toBe("EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 0");
      expect(resetSql(executeRaw, 4)).toBe("EXEC sp_set_session_context @key = N'app_current_org', @value = NULL");
      expect(resetSql(executeRaw, 5)).toBe("EXEC sp_set_session_context @key = N'app_record_visibility_governed', @value = 0");
      expect(resetSql(executeRaw, 6)).toBe("EXEC sp_set_session_context @key = N'app_current_user', @value = NULL");
    });

    it('maps a P2028 rejection to the same 503 as forTenant', async () => {
      const p2028 = new Prisma.PrismaClientKnownRequestError('Unable to start a transaction in the given time', {
        code: 'P2028',
        clientVersion: '5.10.0',
      });
      const { service } = makeService(() => Promise.reject(p2028));
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      let caught: unknown;
      try {
        await service.forTenantIncludingDeleted(context, async () => 'unreachable');
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(HttpException);
      expect((caught as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect((caught as HttpException).getResponse()).toEqual(POOL_EXHAUSTED_RESPONSE);
      warnSpy.mockRestore();
    });
  });

  // ADO #6809: webcamSnapshot's two queries moved off forTenant onto the plain client (isolation
  // comes from an ID chain already resolved through the candidate's own invitationId, not from
  // organizationId/RLS, and neither query needs multi-statement atomicity). withoutTenantScope
  // must still take a connection per call (no $transaction wrapper, no session-context
  // set/reset) while mapping pool exhaustion to the same 503 as forTenant -- but since a plain
  // query never opens an interactive transaction, the pool-exhausted rejection it actually gets
  // is P2024 ("timed out fetching a new connection"), not forTenant's P2028. Round-1 fix: the
  // shared mapping now matches both codes (see rethrowMappingPoolExhaustion).
  describe('withoutTenantScope', () => {
    function makePlainService() {
      const transaction = jest.fn();
      const prisma = { $transaction: transaction, $extends: jest.fn(() => ({ $transaction: jest.fn() })) } as unknown as PrismaService;
      return { service: new TenantPrismaService(prisma), prisma, transaction };
    }

    it('runs fn directly against the plain client and returns its result, without opening a transaction', async () => {
      const { service, prisma, transaction } = makePlainService();

      const result = await service.withoutTenantScope(async (client) => {
        expect(client).toBe(prisma);
        return 'plain-result';
      });

      expect(result).toBe('plain-result');
      expect(transaction).not.toHaveBeenCalled();
    });

    it('maps a P2028 rejection to the same 503 as forTenant', async () => {
      const { service } = makePlainService();
      const p2028 = new Prisma.PrismaClientKnownRequestError('Unable to start a transaction in the given time', {
        code: 'P2028',
        clientVersion: '5.10.0',
      });
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      let caught: unknown;
      try {
        await service.withoutTenantScope(() => Promise.reject(p2028));
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(HttpException);
      const httpError = caught as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(httpError.getResponse()).toEqual(POOL_EXHAUSTED_RESPONSE);
      expect(JSON.stringify(httpError.getResponse())).not.toMatch(/P2028|Prisma|transaction/i);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('P2028'));
      warnSpy.mockRestore();
    });

    // This is the case that actually happens in production: a plain query blocked on the pool
    // rejects with P2024, not P2028 -- there's no interactive transaction here to reject with
    // P2028. Fails against a P2028-only guard (the round-1 gap: an unmapped 500, no warn line).
    it('maps a P2024 (pool exhausted) rejection to the same 503, since that is what a plain query actually gets', async () => {
      const { service } = makePlainService();
      const p2024 = new Prisma.PrismaClientKnownRequestError('Timed out fetching a new connection from the connection pool', {
        code: 'P2024',
        clientVersion: '5.10.0',
      });
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      let caught: unknown;
      try {
        await service.withoutTenantScope(() => Promise.reject(p2024));
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(HttpException);
      const httpError = caught as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(httpError.getResponse()).toEqual(POOL_EXHAUSTED_RESPONSE);
      expect(JSON.stringify(httpError.getResponse())).not.toMatch(/P2024|Prisma|transaction/i);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('P2024'));
      warnSpy.mockRestore();
    });

    it('propagates a non-P2028 error unchanged', async () => {
      const { service } = makePlainService();
      const genericError = new Error('connection refused');

      await expect(service.withoutTenantScope(() => Promise.reject(genericError))).rejects.toBe(genericError);
    });
  });
});
