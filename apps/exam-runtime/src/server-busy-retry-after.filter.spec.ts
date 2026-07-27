import { ArgumentsHost, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { POOL_EXHAUSTED_RESPONSE, POOL_EXHAUSTED_RETRY_AFTER_SECONDS } from '@exam-platform/shared';
import { ServerBusyRetryAfterFilter } from './server-busy-retry-after.filter';

function makeHost(type: 'http' | 'ws', response: { setHeader: jest.Mock }): ArgumentsHost {
  return {
    getType: () => type,
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ url: '/api/v1/attempt/start' }) }),
  } as unknown as ArgumentsHost;
}

describe('ServerBusyRetryAfterFilter', () => {
  let filter: ServerBusyRetryAfterFilter;
  let response: { setHeader: jest.Mock };
  let superCatch: jest.SpyInstance;

  beforeEach(() => {
    const adapterHost = { httpAdapter: {} } as HttpAdapterHost;
    filter = new ServerBusyRetryAfterFilter(adapterHost);
    response = { setHeader: jest.fn() };
    // The base filter owns actually writing the response; this suite is only
    // concerned with the header this subclass adds and with everything else
    // being passed through untouched.
    superCatch = jest
      .spyOn(Object.getPrototypeOf(ServerBusyRetryAfterFilter.prototype), 'catch')
      .mockImplementation(() => undefined);
  });

  afterEach(() => superCatch.mockRestore());

  it('sets Retry-After on the pool-exhaustion 503', () => {
    const exception = new HttpException(POOL_EXHAUSTED_RESPONSE, HttpStatus.SERVICE_UNAVAILABLE);

    filter.catch(exception, makeHost('http', response));

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', String(POOL_EXHAUSTED_RETRY_AFTER_SECONDS));
    expect(superCatch).toHaveBeenCalled();
  });

  it('leaves a 503 raised by anything else alone', () => {
    // Keyed on the body discriminator, not the status -- 503 is not exclusively
    // ours, and a foreign one carries no promise about when to come back.
    const exception = new HttpException({ error: 'upstream_down' }, HttpStatus.SERVICE_UNAVAILABLE);

    filter.catch(exception, makeHost('http', response));

    expect(response.setHeader).not.toHaveBeenCalled();
    expect(superCatch).toHaveBeenCalled();
  });

  it('passes unrelated exceptions straight through', () => {
    filter.catch(new BadRequestException('bad'), makeHost('http', response));

    expect(response.setHeader).not.toHaveBeenCalled();
    expect(superCatch).toHaveBeenCalled();
  });

  it('does not touch a non-HTTP context', () => {
    // A global filter also sees the monitoring WebSocket gateway, where
    // switchToHttp() yields nothing that can carry a header.
    const exception = new HttpException(POOL_EXHAUSTED_RESPONSE, HttpStatus.SERVICE_UNAVAILABLE);

    filter.catch(exception, makeHost('ws', response));

    expect(response.setHeader).not.toHaveBeenCalled();
    expect(superCatch).toHaveBeenCalled();
  });
});
