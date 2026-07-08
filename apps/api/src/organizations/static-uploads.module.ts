import { Module, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { UPLOADS_ROOT } from './uploads-path';

// Mounts the /uploads static file server directly against the underlying HTTP
// adapter instance, resolved lazily inside `onModuleInit` rather than injected
// via a DI factory at module-compile time.
//
// `@nestjs/serve-static`'s `ServeStaticModule.forRoot()` looks tempting for this,
// but its `AbstractLoader` provider is a factory that reads `HttpAdapterHost.httpAdapter`
// at provider-resolution time. Under `Test.createTestingModule(...).compile()` (used by
// every e2e spec in this project), that resolution happens before `createNestApplication()`
// has attached the real HTTP adapter, so the factory silently falls back to a no-op loader
// and `/uploads/*` 404s — even though the exact same config works under `NestFactory.create()`
// in `main.ts`. Reading `httpAdapterHost.httpAdapter` inside `onModuleInit()` instead (which
// runs during `app.init()`, after the adapter is attached in both bootstrap styles) avoids
// that timing gap and serves files correctly in production and in e2e tests alike.
@Module({})
export class StaticUploadsModule implements OnModuleInit {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  onModuleInit() {
    this.httpAdapterHost.httpAdapter.useStaticAssets(UPLOADS_ROOT, { prefix: '/uploads' });
  }
}
