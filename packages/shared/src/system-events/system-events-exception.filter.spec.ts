import { BadRequestException, HttpException, InternalServerErrorException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { SystemEventsExceptionFilter } from './system-events-exception.filter';
import { SystemEventsService } from './system-events.service';

describe('SystemEventsExceptionFilter', () => {
  let record: jest.Mock;
  let filter: SystemEventsExceptionFilter;
  let superCatch: jest.SpyInstance;

  function httpHost(request: Record<string, unknown> = {}): ArgumentsHost {
    return {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
    } as unknown as ArgumentsHost;
  }

  beforeEach(() => {
    record = jest.fn().mockResolvedValue(undefined);
    filter = new SystemEventsExceptionFilter(
      { httpAdapter: {} } as never,
      { record } as unknown as SystemEventsService,
      'api',
    );
    // The response path is BaseExceptionFilter's job, not under test here.
    superCatch = jest.spyOn(Object.getPrototypeOf(SystemEventsExceptionFilter.prototype), 'catch').mockImplementation(() => undefined);
  });

  afterEach(() => superCatch.mockRestore());

  it('records an unhandled (non-HttpException) crash with request context and stack', () => {
    const host = httpHost({ method: 'POST', originalUrl: '/api/v1/exams', user: { organizationId: 'org-1', userId: 'u-1' } });
    filter.catch(new TypeError('boom'), host);

    expect(record).toHaveBeenCalledWith({
      organizationId: 'org-1',
      service: 'api',
      severity: 'error',
      message: 'TypeError: boom',
      context: expect.objectContaining({ status: 500, method: 'POST', route: '/api/v1/exams', userId: 'u-1', stack: expect.stringContaining('TypeError') }),
    });
    expect(superCatch).toHaveBeenCalled();
  });

  it('records deliberate 5xx HttpExceptions', () => {
    filter.catch(new InternalServerErrorException('it broke'), httpHost());
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  it('does not record 4xx responses -- expected request outcomes are not system failures', () => {
    filter.catch(new BadRequestException('bad input'), httpHost());
    expect(record).not.toHaveBeenCalled();
    expect(superCatch).toHaveBeenCalled();
  });

  it('records the candidate invitationId when present (exam-runtime requests)', () => {
    filter.catch(new HttpException('down', 503), httpHost({ user: { invitationId: 'inv-1' } }));
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ invitationId: 'inv-1', status: 503 }) }),
    );
  });

  it('survives non-http hosts (websocket gateway exceptions) without crashing', () => {
    const wsHost = { getType: () => 'ws', switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }) } as unknown as ArgumentsHost;
    filter.catch(new Error('socket blew up'), wsHost);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null }));
  });

  // PII regression guard: originalUrl includes the query string, and route is allow-listed
  // and forwarded to Sentry verbatim. A candidate-lookup query string must never survive into
  // the recorded context -- neither this DB sink nor the Sentry sink downstream of it.
  it('strips the query string from originalUrl before recording it as route', () => {
    const host = httpHost({ method: 'GET', originalUrl: '/api/v1/candidates/lookup?email=candidate@example.com' });
    filter.catch(new TypeError('boom'), host);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ route: '/api/v1/candidates/lookup' }) }),
    );
    const [recordedEntry] = record.mock.calls[0];
    expect(JSON.stringify(recordedEntry)).not.toContain('candidate@example.com');
  });
});

import { SentryReporter } from '../observability/sentry-reporter';

describe('SystemEventsExceptionFilter — Sentry sink', () => {
  let record: jest.Mock;
  let capture: jest.Mock;
  let superCatch: jest.SpyInstance;

  function httpHost(request: Record<string, unknown> = {}): ArgumentsHost {
    return {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
    } as unknown as ArgumentsHost;
  }

  function makeFilter() {
    record = jest.fn().mockResolvedValue(undefined);
    capture = jest.fn();
    return new SystemEventsExceptionFilter(
      { httpAdapter: {} } as never,
      { record } as unknown as SystemEventsService,
      'api',
      { capture } as unknown as SentryReporter,
    );
  }

  beforeEach(() => {
    superCatch = jest
      .spyOn(Object.getPrototypeOf(SystemEventsExceptionFilter.prototype), 'catch')
      .mockImplementation(() => undefined);
  });
  afterEach(() => superCatch.mockRestore());

  it('reports to both sinks for an unhandled crash', () => {
    const filter = makeFilter();
    filter.catch(new TypeError('boom'), httpHost({ method: 'GET', originalUrl: '/api/v1/exams' }));
    expect(record).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('does not report 4xx to Sentry, matching the DB sink', () => {
    const filter = makeFilter();
    filter.catch(new BadRequestException('nope'), httpHost());
    expect(record).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it('includes attemptId in the recorded context when the request carries one', () => {
    const filter = makeFilter();
    filter.catch(new TypeError('boom'), httpHost({ user: { attemptId: 'att-9' } }));
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ attemptId: 'att-9' }) }),
    );
  });

  it('still records to the DB when the Sentry sink throws', () => {
    record = jest.fn().mockResolvedValue(undefined);
    const filter = new SystemEventsExceptionFilter(
      { httpAdapter: {} } as never,
      { record } as unknown as SystemEventsService,
      'api',
      { capture: () => { throw new Error('sentry down'); } } as unknown as SentryReporter,
    );
    expect(() => filter.catch(new TypeError('boom'), httpHost())).not.toThrow();
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('works with no reporter supplied at all', () => {
    const localRecord = jest.fn().mockResolvedValue(undefined);
    const filter = new SystemEventsExceptionFilter(
      { httpAdapter: {} } as never,
      { record: localRecord } as unknown as SystemEventsService,
      'api',
    );
    expect(() => filter.catch(new TypeError('boom'), httpHost())).not.toThrow();
    expect(localRecord).toHaveBeenCalledTimes(1);
  });
});
