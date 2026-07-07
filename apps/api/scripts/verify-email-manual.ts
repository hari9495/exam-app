import { EmailService } from '../src/email/email.service';

async function main() {
  const emailService = new EmailService();
  const result = await emailService.send({
    to: 'test-recipient@example.com',
    subject: 'Phase 1c manual verification',
    html: '<p>If you can see this in the Ethereal inbox, real SMTP delivery works.</p>',
  });
  console.log(result);
}

main();
