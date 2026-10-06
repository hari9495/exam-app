import { BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SmsFailure, SmsProviderAdapter, SmsSendArgs, SmsSendResult } from './types';

export interface DevSms {
  to: string;
  channel: 'sms' | 'whatsapp';
  text: string;
  sender: string | null;
  dltTemplateId: string | null;
  providerMsgId: string;
  at: Date;
}

/**
 * Local development and tests: messages stay in this in-memory sink (tests read `sent`) and never
 * leave the process. Refused in production. `simulate` makes a dev account fail on purpose, to try
 * failover locally.
 */
export class DevSmsSink {
  readonly sent: DevSms[] = [];
}
export const devSmsSink = new DevSmsSink();

const SIMULATE: SmsFailure[] = ['rejected', 'unavailable', 'unknown'];
const isProduction = () => process.env.NODE_ENV === 'production';
const logger = new Logger('DevSms');

export const devProvider: SmsProviderAdapter = {
  id: 'dev',
  label: 'Development sink (never sends)',
  configFields: [{ key: 'simulate', label: 'Simulate a failure (rejected / unavailable / unknown)', secret: false, required: false }],

  validateConfig(config: Record<string, unknown>): void {
    if (isProduction()) throw new BadRequestException('The development provider is not available in production');
    if (config.simulate !== undefined && !SIMULATE.includes(config.simulate as SmsFailure)) {
      throw new BadRequestException(`simulate must be one of ${SIMULATE.join(', ')}`);
    }
  },

  async send(config: Record<string, unknown>, args: SmsSendArgs): Promise<SmsSendResult> {
    if (isProduction()) return { ok: false, failure: 'rejected', error: 'development provider refused in production' };
    const simulate = config.simulate as SmsFailure | undefined;
    if (simulate) return { ok: false, failure: simulate, error: `simulated ${simulate} failure` };
    const providerMsgId = `dev-${randomUUID()}`;
    devSmsSink.sent.push({ to: args.to, channel: 'sms', text: args.body, sender: args.sender ?? null, dltTemplateId: args.dltTemplateId ?? null, providerMsgId, at: new Date() });
    logger.log(`sms to ${args.to.slice(0, 4)}****${args.to.slice(-2)} kept in the in-memory sink`);
    return { ok: true, providerMsgId };
  },
};
