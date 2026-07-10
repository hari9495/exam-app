import { Injectable } from '@nestjs/common';
import { JobProcessor } from './job-processor.interface';

@Injectable()
export class EchoProcessor implements JobProcessor {
  readonly type = 'echo';

  async process(input: unknown): Promise<unknown> {
    return { echoed: input };
  }
}
