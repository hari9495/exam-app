import { BadRequestException } from '@nestjs/common';
import { sendTwilioWhatsapp } from './twilio-whatsapp-transport';
import { WhatsappProviderAdapter, WhatsappSendArgs, WhatsappSendResult } from './types';

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

export const twilioWhatsappProvider: WhatsappProviderAdapter = {
  id: 'twilio',
  label: 'Twilio WhatsApp',
  configFields: [
    { key: 'accountSid', label: 'Account SID', secret: false, required: true },
    { key: 'authToken', label: 'Auth Token', secret: true, required: true },
    { key: 'from', label: 'From number', secret: false, required: true },
    // Reserved for the approved-template fast-follow (see design spec's "Out
    // of scope" note); not read by send() in v1 (free-text messages only).
    { key: 'templateName', label: 'Template name (future use)', secret: false, required: false },
  ],

  validateConfig(config: Record<string, unknown>): void {
    if (isBlank(config.accountSid) || isBlank(config.authToken) || isBlank(config.from)) {
      throw new BadRequestException('Twilio WhatsApp config requires accountSid, authToken, and from');
    }
  },

  async send(
    config: Record<string, unknown>,
    { to, body }: WhatsappSendArgs,
    fetchImpl?: typeof fetch,
  ): Promise<WhatsappSendResult> {
    return sendTwilioWhatsapp(
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
