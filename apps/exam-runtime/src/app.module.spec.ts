import { APP_FILTER } from '@nestjs/core';
import { AppModule } from './app.module';
import { ServerBusyRetryAfterFilter } from './server-busy-retry-after.filter';

// Pins the ordering the comment in app.module.ts depends on: Nest matches global filters in
// REVERSE registration order, so SystemEventsExceptionFilter (the catch-all) must be registered
// BEFORE ServerBusyRetryAfterFilter (the specific @Catch(HttpException) filter) or the specific
// filter would be shadowed and the server_busy 503 + Retry-After contract would silently break.
// Nothing else in the suite observes module registration order -- only this test does.
describe('AppModule APP_FILTER registration order', () => {
  it('registers SystemEventsExceptionFilter before ServerBusyRetryAfterFilter', () => {
    const providers = Reflect.getMetadata('providers', AppModule) as Array<Record<string, unknown>>;
    const filterProviders = providers.filter((provider) => provider?.provide === APP_FILTER);

    expect(filterProviders).toHaveLength(2);
    // First: the useFactory-based SystemEventsExceptionFilter registration.
    expect(filterProviders[0]).toHaveProperty('useFactory');
    expect(filterProviders[0]).not.toHaveProperty('useClass');
    // Second: the plain useClass ServerBusyRetryAfterFilter registration.
    expect(filterProviders[1]).toMatchObject({ useClass: ServerBusyRetryAfterFilter });
  });
});
