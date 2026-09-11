import { BadRequestException } from '@nestjs/common';
import { sendTwilioSms } from '../twilio-transport';
import { SmsProviderAdapter, SmsSendArgs, SmsSendResult } from './types';

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

export const twilioProvider: SmsProviderAdapter = {
  id: 'twilio',
  label: 'Twilio',
  configFields: [
    { key: 'accountSid', label: 'Account SID', secret: false, required: true },
    { key: 'authToken', label: 'Auth Token', secret: true, required: true },
    { key: 'from', label: 'From number', secret: false, required: true },
  ],

  validateConfig(config: Record<string, unknown>): void {
    if (isBlank(config.accountSid) || isBlank(config.authToken) || isBlank(config.from)) {
      throw new BadRequestException('Twilio config requires accountSid, authToken, and from');
    }
  },

  async send(
    config: Record<string, unknown>,
    { to, body }: SmsSendArgs,
    fetchImpl?: typeof fetch,
  ): Promise<SmsSendResult> {
    return sendTwilioSms(
      {
        accountSid: config.accountSid as string,
        authToken: config.authToken as string,
        from: config.from as string,
        to,
        body,
      },
      fetchImpl,
    );
  },
};
