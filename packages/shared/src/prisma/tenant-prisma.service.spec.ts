import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService, POOL_EXHAUSTED_RESPONSE } from './tenant-prisma.service';
import { PrismaService } from './prisma.service';

describe('TenantPrismaService', () => {
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  function makeService(transactionImpl: (cb: (tx: any) => Promise<any>) => Promise<any>) {
    const prisma = { $transaction: jest.fn(transactionImpl) } as unknown as PrismaService;
    return new TenantPrismaService(prisma);
  }

  // $executeRaw is a tagged-template call: jest records each invocation as
  // [templateStrings, ...interpolatedValues]. The reset statements hard-code
  // NULL/0 as literal SQL text (no interpolation), so the raw joined text is
  // what to assert on -- this fails if the reset is reordered, targets the
  // wrong session-context key, or resets to the wrong value.
  function resetSql(executeRaw: jest.Mock, callIndex: number) {
    return (executeRaw.mock.calls[callIndex][0] as string[]).join('');
  }

  it('returns the callback result and resets session context to null/0 on success', async () => {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const tx = { $executeRaw: executeRaw };
    const service = makeService((cb) => cb(tx));

    const result = await service.forTenant(context, async () => 'ok');

    expect(result).toBe('ok');
    // set org, set super-admin, reset org, reset super-admin
    expect(executeRaw).toHaveBeenCalledTimes(4);
    // Super-admin is cleared first: it's the more dangerous flag to strand
    // (full RLS bypass vs. single-org scoping) if a partial reset failure
    // short-circuits the second statement.
    expect(resetSql(executeRaw, 2)).toBe("EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 0");
    expect(resetSql(executeRaw, 3)).toBe("EXEC sp_set_session_context @key = N'app_current_org', @value = NULL");
  });

  it('still resets session context to null/0 when the callback throws a non-P2028 error', async () => {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const tx = { $executeRaw: executeRaw };
    const service = makeService((cb) => cb(tx));

    await expect(
      service.forTenant(context, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(executeRaw).toHaveBeenCalledTimes(4);
    // Super-admin is cleared first: it's the more dangerous flag to strand
    // (full RLS bypass vs. single-org scoping) if a partial reset failure
    // short-circuits the second statement.
    expect(resetSql(executeRaw, 2)).toBe("EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 0");
    expect(resetSql(executeRaw, 3)).toBe("EXEC sp_set_session_context @key = N'app_current_org', @value = NULL");
  });

  it('still resets session context when the callback throws an HttpException (business-logic 4xx/409)', async () => {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const tx = { $executeRaw: executeRaw };
    const service = makeService((cb) => cb(tx));
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
    expect(executeRaw).toHaveBeenCalledTimes(4);
    // Super-admin is cleared first: it's the more dangerous flag to strand
    // (full RLS bypass vs. single-org scoping) if a partial reset failure
    // short-circuits the second statement.
    expect(resetSql(executeRaw, 2)).toBe("EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 0");
    expect(resetSql(executeRaw, 3)).toBe("EXEC sp_set_session_context @key = N'app_current_org', @value = NULL");
  });

  it('maps a P2028 rejection from $transaction to a 503 with the { error, message } shape', async () => {
    const p2028 = new Prisma.PrismaClientKnownRequestError('Unable to start a transaction in the given time', {
      code: 'P2028',
      clientVersion: '5.10.0',
    });
    const service = makeService(() => Promise.reject(p2028));
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

  it('propagates a different Prisma error code unchanged', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.10.0',
    });
    const service = makeService(() => Promise.reject(p2002));

    await expect(service.forTenant(context, async () => 'unreachable')).rejects.toBe(p2002);
  });

  it('propagates a non-Prisma error unchanged', async () => {
    const genericError = new Error('connection refused');
    const service = makeService(() => Promise.reject(genericError));

    await expect(service.forTenant(context, async () => 'unreachable')).rejects.toBe(genericError);
  });

  describe('when the session-context reset itself fails', () => {
    // Simulates the P2028-expiry hazard: the callback ran against a
    // transaction that's now dead, so the two reset $executeRaw calls
    // (indices 2 and 3) reject too.
    function makeResetFailingTx() {
      const resetError = new Error('Transaction already closed');
      const executeRaw = jest
        .fn()
        .mockResolvedValueOnce(undefined) // set org
        .mockResolvedValueOnce(undefined) // set super-admin
        .mockRejectedValueOnce(resetError) // reset super-admin (runs first)
        .mockRejectedValueOnce(resetError); // reset org
      return { tx: { $executeRaw: executeRaw }, executeRaw, resetError };
    }

    it('still returns the callback result when the reset throws, and logs the failure', async () => {
      const { tx, executeRaw } = makeResetFailingTx();
      const service = makeService((cb) => cb(tx));
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      const result = await service.forTenant(context, async () => 'ok');

      // The caller must see the callback's own result -- not have it replaced
      // or masked by the reset failure. Only 3 calls: set org, set
      // super-admin, reset super-admin (which throws and short-circuits the
      // second reset statement).
      expect(result).toBe('ok');
      expect(executeRaw).toHaveBeenCalledTimes(3);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('TENANT_SESSION_CONTEXT_RESET_FAILED'));
      // No connection string, org id, or candidate data in the log line.
      expect(errorSpy.mock.calls[0][0]).not.toMatch(/org-1/);
      errorSpy.mockRestore();
    });

    it('still surfaces the callback error (not the reset error) when both throw, and logs the reset failure', async () => {
      const { tx, executeRaw } = makeResetFailingTx();
      const service = makeService((cb) => cb(tx));
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
      expect(executeRaw).toHaveBeenCalledTimes(3);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('TENANT_SESSION_CONTEXT_RESET_FAILED'));
      errorSpy.mockRestore();
    });
  });

  // ADO #6809: webcamSnapshot's two queries moved off forTenant onto the plain client (isolation
  // comes from an ID chain already resolved through the candidate's own invitationId, not from
  // organizationId/RLS, and neither query needs multi-statement atomicity). withoutTenantScope
  // must still take a connection per call (no $transaction wrapper, no session-context
  // set/reset) while reusing forTenant's exact P2028 -> 503 mapping, since a plain call still
  // draws from the same pool and can still hit it.
  describe('withoutTenantScope', () => {
    function makePlainService() {
      const transaction = jest.fn();
      const prisma = { $transaction: transaction } as unknown as PrismaService;
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

    it('propagates a non-P2028 error unchanged', async () => {
      const { service } = makePlainService();
      const genericError = new Error('connection refused');

      await expect(service.withoutTenantScope(() => Promise.reject(genericError))).rejects.toBe(genericError);
    });
  });
});
