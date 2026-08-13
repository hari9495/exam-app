import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { SentryReporter } from '@exam-platform/shared';

// Flushes buffered Sentry events during Nest's own teardown (see enableShutdownHooks() in
// main.ts), which runs before Nest re-delivers SIGTERM/SIGINT so the OS can terminate the
// process. Deliberately NOT a bare process.on('SIGTERM'/'SIGINT') listener: registering one
// removes Node's default termination action for that signal, and this app's shutdown relies
// on that default running after Nest's teardown (see main.ts) -- a listener that never calls
// process.exit()/re-raises would silently prevent the process from ever exiting.
//
// Wrapped in try/catch even though SentryReporter.flush() already swallows its own errors and
// no-ops when disabled: this hook runs inside Nest's shutdown sequence, so it must not be able
// to throw under any circumstance, including a future change to flush() itself.
@Injectable()
export class SentryShutdownFlush implements OnApplicationShutdown {
  constructor(private readonly reporter: SentryReporter) {}

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.reporter.flush(2000);
    } catch {
      // Shutdown must not fail because telemetry could not drain.
    }
  }
}
