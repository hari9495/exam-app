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

  // $executeRaw is a tagged-template call: jest records [templateStrings, ...values]. The SQL text
  // is fixed; the values are what a bug would get wrong, so assert on both.
  function contextCall(executeRaw: jest.Mock) {
    const [strings, ...values] = executeRaw.mock.calls[0];
    return { sql: (strings as string[]).join('?'), values };
  }

  function expectTransactionLocalContext(executeRaw: jest.Mock, values: unknown[]) {
    // One round trip, nothing else: there is no reset step any more -- set_config(..., true) is
    // discarded by Postgres at COMMIT/ROLLBACK, so a pooled connection never keeps a tenant.
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const call = contextCall(executeRaw);
    for (const key of ['app.current_org', 'app.is_super_admin', 'app.current_user_id', 'app.record_visibility_governed']) {
      expect(call.sql).toContain(`set_config('${key}', ?, true)`);
    }
    expect(call.sql).not.toMatch(/false|SET\s+app|sp_set_session_context/i);
    expect(call.values).toEqual(values);
  }

  it('sets the tenant context transaction-locally in one parameterised call and returns the result', async () => {
    const executeRaw = jest.fn().mockResolvedValue(1);
    const tx = { $executeRaw: executeRaw };
    const { service, filteredTransaction, rawTransaction } = makeService((cb) => cb(tx));

    const result = await service.forTenant(context, async () => 'ok');

    expect(result).toBe('ok');
    expectTransactionLocalContext(executeRaw, ['org-1', 'off', '', 'off']);
    // Routing: forTenant must run through the soft-delete-filtered client's $transaction, never
    // the raw one -- that's the whole point of the recycle-bin fix.
    expect(filteredTransaction).toHaveBeenCalledTimes(1);
    expect(rawTransaction).not.toHaveBeenCalled();
  });

  it('sets the context before the callback runs', async () => {
    const order: string[] = [];
    const executeRaw = jest.fn(async () => order.push('context'));
    const { service } = makeService((cb) => cb({ $executeRaw: executeRaw }));

    await service.forTenant(context, async () => order.push('callback'));

    expect(order).toEqual(['context', 'callback']);
  });

  it('propagates a non-P2028 callback error unchanged', async () => {
    const executeRaw = jest.fn().mockResolvedValue(1);
    const { service } = makeService((cb) => cb({ $executeRaw: executeRaw }));

    await expect(
      service.forTenant(context, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('propagates an HttpException (business-logic 4xx/409) exactly as thrown', async () => {
    const { service } = makeService((cb) => cb({ $executeRaw: jest.fn().mockResolvedValue(1) }));
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
  });

  it('never runs the callback when setting the context fails', async () => {
    const fn = jest.fn();
    const { service } = makeService((cb) => cb({ $executeRaw: jest.fn().mockRejectedValue(new Error('db down')) }));

    await expect(service.forTenant(context, fn)).rejects.toThrow('db down');
    expect(fn).not.toHaveBeenCalled();
  });

  describe('record-visibility context (app.current_user_id / app.record_visibility_governed)', () => {
    it('sets the user id and governed=on for a governed role (recruiter)', async () => {
      const executeRaw = jest.fn().mockResolvedValue(1);
      const { service } = makeService((cb) => cb({ $executeRaw: executeRaw }));

      await service.forTenant({ organizationId: 'org-1', isSuperAdmin: false, userId: 'U1', role: 'recruiter' }, async () => 'ok');

      expectTransactionLocalContext(executeRaw, ['org-1', 'off', 'U1', 'on']);
    });

    it('sets governed=off for a non-governed role (org_admin) even with a userId, and super-admin on', async () => {
      const executeRaw = jest.fn().mockResolvedValue(1);
      const { service } = makeService((cb) => cb({ $executeRaw: executeRaw }));

      await service.forTenant({ organizationId: 'org-1', isSuperAdmin: true, userId: 'U2', role: 'org_admin' }, async () => 'ok');

      expectTransactionLocalContext(executeRaw, ['org-1', 'on', 'U2', 'off']);
    });

    it('sets empty org/user values (which match nothing) when the context has none', async () => {
      const executeRaw = jest.fn().mockResolvedValue(1);
      const { service } = makeService((cb) => cb({ $executeRaw: executeRaw }));

      await service.forTenant({ organizationId: null, isSuperAdmin: false, role: 'recruiter' }, async () => 'ok');

      expectTransactionLocalContext(executeRaw, ['', 'off', '', 'on']);
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

  describe('forTenantIncludingDeleted', () => {
    it('sets the context identically to forTenant, and returns the callback result', async () => {
      const executeRaw = jest.fn().mockResolvedValue(1);
      const { service } = makeService((cb) => cb({ $executeRaw: executeRaw }));

      const result = await service.forTenantIncludingDeleted(context, async () => 'ok');

      expect(result).toBe('ok');
      expectTransactionLocalContext(executeRaw, ['org-1', 'off', '', 'off']);
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

    it('propagates a callback error unchanged', async () => {
      const { service } = makeService((cb) => cb({ $executeRaw: jest.fn().mockResolvedValue(1) }));

      await expect(
        service.forTenantIncludingDeleted(context, async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
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
  // must still take a connection per call (no $transaction wrapper, no session context) while mapping pool exhaustion to the same 503 as forTenant -- but since a plain
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
