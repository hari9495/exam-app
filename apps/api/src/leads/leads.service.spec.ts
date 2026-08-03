import { Test } from '@nestjs/testing';
import { PrismaService } from '@exam-platform/shared';
import { LeadsService } from './leads.service';
import { EmailService } from '../email/email.service';

describe('LeadsService', () => {
  let service: LeadsService;
  let prisma: { lead: { create: jest.Mock } };
  let email: { send: jest.Mock };

  beforeEach(async () => {
    prisma = { lead: { create: jest.fn(async ({ data }) => ({ id: 'lead-1', ...data })) } };
    email = { send: jest.fn(async () => ({ success: true })) };
    const moduleRef = await Test.createTestingModule({
      providers: [LeadsService, { provide: PrismaService, useValue: prisma }, { provide: EmailService, useValue: email }],
    }).compile();
    service = moduleRef.get(LeadsService);
  });

  it('persists the lead with the submitted fields', async () => {
    await service.create({ name: 'Ada', workEmail: 'ada@acme.com', company: 'Acme', teamSize: '11-50', message: 'Hi' });

    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: { name: 'Ada', workEmail: 'ada@acme.com', company: 'Acme', teamSize: '11-50', message: 'Hi' },
    });
  });

  it('sends a notification email summarizing the lead', async () => {
    await service.create({ name: 'Ada', workEmail: 'ada@acme.com', company: 'Acme' });

    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'New Get Started lead: Acme',
        html: expect.stringContaining('ada@acme.com'),
      }),
    );
  });

  it('does not let a failed email send reject create()', async () => {
    email.send.mockResolvedValue({ success: false });

    await expect(
      service.create({ name: 'Ada', workEmail: 'ada@acme.com', company: 'Acme' }),
    ).resolves.toBeUndefined();
  });

  it('escapes HTML in submitted fields before building the notification email', async () => {
    await service.create({ name: '<script>alert(1)</script>', workEmail: 'ada@acme.com', company: 'Acme' });

    const html = email.send.mock.calls[0][0].html;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
