import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { CreateLeadDto } from './dto/create-lead.dto';

// Fallback last: this is a landing-page contact form, not a transactional flow a user is
// waiting on, so a missing SMTP config on a dev machine shouldn't matter -- the platform
// mailbox is the same address production already sends from.
function notificationRecipient(): string {
  return process.env.LEADS_NOTIFICATION_EMAIL || process.env.SMTP_FROM_ADDRESS || process.env.SMTP_USER || 'no-reply@exam-platform.test';
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async create(dto: CreateLeadDto): Promise<void> {
    const lead = await this.prisma.lead.create({
      data: {
        name: dto.name,
        workEmail: dto.workEmail,
        company: dto.company,
        teamSize: dto.teamSize,
        message: dto.message,
      },
    });

    // Fire-and-forget, same pattern as invitation emails: the submitter's response
    // shouldn't wait on (or fail because of) an SMTP hiccup -- the lead is already saved.
    // EmailService.send() never rejects (it catches and logs internally), so check the
    // result instead of relying on .catch().
    this.email
      .send({
        to: notificationRecipient(),
        subject: `New Get Started lead: ${dto.company}`,
        html: `
          <p>New lead from the landing page.</p>
          <ul>
            <li><strong>Name:</strong> ${escapeHtml(dto.name)}</li>
            <li><strong>Work email:</strong> ${escapeHtml(dto.workEmail)}</li>
            <li><strong>Company:</strong> ${escapeHtml(dto.company)}</li>
            ${dto.teamSize ? `<li><strong>Team size:</strong> ${escapeHtml(dto.teamSize)}</li>` : ''}
          </ul>
          ${dto.message ? `<p><strong>Message:</strong><br/>${escapeHtml(dto.message).replace(/\n/g, '<br/>')}</p>` : ''}
        `,
      })
      .then((result) => {
        if (!result.success) {
          this.logger.error(`Failed to send lead notification email for lead ${lead.id}`);
        }
      });
  }
}
