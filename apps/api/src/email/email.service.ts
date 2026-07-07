import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  success: boolean;
  previewUrl?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporterPromise: Promise<Transporter> | null = null;

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
        from: 'no-reply@exam-platform.test',
        to: input.to,
        subject: input.subject,
        html: input.html,
      });
      const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
      if (previewUrl) {
        this.logger.log(`Email sent, preview: ${previewUrl}`);
      }
      return { success: true, previewUrl };
    } catch (error) {
      this.logger.error(`Failed to send email to ${input.to}`, error as Error);
      return { success: false };
    }
  }

  private async getTransporter(): Promise<Transporter> {
    if (!this.transporterPromise) {
      this.transporterPromise = this.createTransporter().catch((error) => {
        this.transporterPromise = null;
        throw error;
      });
    }
    return this.transporterPromise;
  }

  private async createTransporter(): Promise<Transporter> {
    if (process.env.SMTP_HOST) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
    }
    const testAccount = await nodemailer.createTestAccount();
    this.logger.log(`No SMTP_HOST configured - using Ethereal test account: ${testAccount.user}`);
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  }
}
