import { Injectable } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JobProcessor } from './job-processor.interface';

@Injectable()
export class EchoProcessor implements JobProcessor {
  readonly type = 'echo';

  async process(input: unknown, _context: TenantContext): Promise<unknown> {
    return { echoed: input };
  }
}
