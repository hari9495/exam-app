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

  it('returns the callback result and resets session context on success', async () => {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const tx = { $executeRaw: executeRaw };
    const service = makeService((cb) => cb(tx));

    const result = await service.forTenant(context, async () => 'ok');

    expect(result).toBe('ok');
    // set org, set super-admin, reset org, reset super-admin
    expect(executeRaw).toHaveBeenCalledTimes(4);
  });

  it('still resets session context when the callback throws a non-P2028 error', async () => {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const tx = { $executeRaw: executeRaw };
    const service = makeService((cb) => cb(tx));

    await expect(
      service.forTenant(context, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(executeRaw).toHaveBeenCalledTimes(4);
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
});
