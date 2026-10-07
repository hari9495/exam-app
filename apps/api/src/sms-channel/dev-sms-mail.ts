import { Injectable } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { EmailService } from '../email/email.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { DevSms, devSmsSink } from '../sms/providers';

const DEV_FLAGS = ['DEV_SMS_LOG_TEXT', 'DEV_SMS_TO_MAIL'] as const;

// The development SMS / WhatsApp sink's laptop helpers. Refused outright in production (the API does
// not start), and DEV_SMS_TO_MAIL only ever hands codes to a mail catcher on this machine.
export function assertDevSmsFlags(env: NodeJS.ProcessEnv = process.env): boolean {
  const set = DEV_FLAGS.filter((flag) => env[flag]?.trim());
  if (set.length && env.NODE_ENV === 'production') throw new Error(`${set.join(', ')} is for local development only: unset it in production`);
  if (env.DEV_SMS_TO_MAIL?.trim() !== '1') return false;
  if (!['127.0.0.1', 'localhost', '::1'].includes(env.SMTP_HOST?.trim() ?? '')) {
    throw new Error('DEV_SMS_TO_MAIL needs SMTP_HOST on this machine (127.0.0.1 / localhost, e.g. Mailpit)');
  }
  return true;
}

export function devSmsAsMail(message: DevSms) {
  const display = parsePhoneNumberFromString(message.to)?.formatInternational() ?? message.to;
  return {
    to: `${message.to}@sms.local`,
    subject: `${message.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} to ${display}`,
    text: message.text,
    html: `<pre>${escapeHtml(message.text)}</pre>`,
  };
}

// DEV_SMS_TO_MAIL=1: every message the development sink keeps also lands in Mailpit (README
// "Sign-in on your laptop"), so codes by SMS / WhatsApp can be read like codes by email.
@Injectable()
export class DevSmsMail {
  constructor(email: EmailService) {
    if (assertDevSmsFlags()) devSmsSink.mirror = (message) => void email.send(devSmsAsMail(message));
  }
}
