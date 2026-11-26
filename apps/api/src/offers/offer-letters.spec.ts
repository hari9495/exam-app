import { offerEmailText, offerTemplateBlocks } from './offer-letters';

describe('offer templates as letters (answer 2515)', () => {
  const subject = 'Your offer from {{orgName}} for {{jobTitle}}';
  const body = 'Dear {{candidateName}},\n\nPay: {{compensation}} from {{startDate}}.\nAnswer by {{offerExpiry}}: {{offerLink}}\n{{recruiterName}}';

  it('maps each old field to its letter field and puts the subject first, in bold', () => {
    const b = offerTemplateBlocks(subject, body);
    expect(b[0]).toEqual({ runs: [{ text: 'Subject: Your offer from {{company_name}} for {{designation}}', bold: true }] });
    expect(b.map((x) => x.runs[0].text).slice(2)).toEqual(['Dear {{employee_name}},', '', 'Pay: {{offer_ctc}} from {{joining_date}}.', 'Answer by {{offer_expiry}}: {{offer_link}}', '{{signatory_name}}']);
  });

  it('never turns unknown or broken braces into a letter field', () => {
    const b = offerTemplateBlocks('Hi {{nope}}', 'a {{ b c }} d {{ e');
    expect(b[0].runs[0].text).toBe('Subject: Hi {nope}');
    expect(b[2].runs[0].text).toBe('a { b c } d { e');
  });

  it('round-trips back to the same email subject and body', () => {
    expect(offerEmailText(offerTemplateBlocks(subject, body))).toEqual({ subject, body });
  });

  it('a letter made in Letters: other fields and sections drop out of the email; no subject line gives the default', () => {
    const blocks = [{ runs: [{ text: '{{legal_entity}}' }] }, { runs: [{ text: '{{#probation}}On probation {{probation_months}} months.{{/probation}}' }] }, { runs: [{ text: 'Dear {{first_name}}' }] }];
    expect(offerEmailText(blocks)).toEqual({ subject: 'Your offer from {{orgName}} for {{jobTitle}}', body: '{{orgName}}\nOn probation  months.\nDear {{candidateName}}' });
  });
});
