import { Controller, Get, HttpException, HttpStatus, INestApplication, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { POOL_EXHAUSTED_RESPONSE, POOL_EXHAUSTED_RETRY_AFTER_SECONDS } from '@exam-platform/shared';
import { ServerBusyRetryAfterFilter } from '../src/server-busy-retry-after.filter';

// The unit spec stubs BaseExceptionFilter.catch, so it can prove the header
// logic but not that the filter is wired up correctly -- APP_FILTER +
// BaseExceptionFilter is exactly the combination that unit-tests green and
// then fails at runtime on a missing HttpAdapterHost. This drives a real HTTP
// response through a real Nest app registering the filter the same way
// AppModule does, and asserts on what a candidate's browser would receive.
@Controller('probe')
class ProbeController {
  @Get('server-busy')
  serverBusy(): never {
    throw new HttpException(POOL_EXHAUSTED_RESPONSE, HttpStatus.SERVICE_UNAVAILABLE);
  }

  @Get('other-503')
  otherUnavailable(): never {
    throw new HttpException({ error: 'upstream_down' }, HttpStatus.SERVICE_UNAVAILABLE);
  }

  @Get('not-found')
  notFound(): never {
    throw new HttpException('nope', HttpStatus.NOT_FOUND);
  }
}

@Module({
  controllers: [ProbeController],
  providers: [{ provide: APP_FILTER, useClass: ServerBusyRetryAfterFilter }],
})
class ProbeModule {}

describe('ServerBusyRetryAfterFilter (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('puts Retry-After on the wire for the pool-exhaustion 503', async () => {
    const response = await request(app.getHttpServer()).get('/probe/server-busy').expect(503);

    expect(response.headers['retry-after']).toBe(String(POOL_EXHAUSTED_RETRY_AFTER_SECONDS));
    // The body must survive the filter unchanged -- the client reads `error`
    // to distinguish this from any other 503.
    expect(response.body).toEqual(POOL_EXHAUSTED_RESPONSE);
  });

  it('leaves another 503 without a Retry-After', async () => {
    const response = await request(app.getHttpServer()).get('/probe/other-503').expect(503);

    expect(response.headers['retry-after']).toBeUndefined();
    expect(response.body).toEqual({ error: 'upstream_down' });
  });

  it('does not alter an unrelated exception', async () => {
    const response = await request(app.getHttpServer()).get('/probe/not-found').expect(404);

    expect(response.headers['retry-after']).toBeUndefined();
    expect(response.body).toEqual({ statusCode: 404, message: 'nope' });
  });
});
