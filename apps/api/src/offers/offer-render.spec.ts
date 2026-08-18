import { renderOfferTemplate } from './offer-render';

const ctx = {
  candidateName: 'Asha Rao',
  jobTitle: 'Backend Engineer',
  orgName: 'Acme',
  recruiterName: 'Priya',
  compensation: '$120,000 / year',
  startDate: 'January 6, 2026',
  offerExpiry: 'December 31, 2025',
  offerLink: 'https://x/offer/tok',
};

it('replaces every offer token', () => {
  const r = renderOfferTemplate(
    'Offer for {{jobTitle}}',
    'Dear {{candidateName}}, comp {{compensation}}, start {{startDate}}, respond {{offerLink}} by {{offerExpiry}} — {{recruiterName}} at {{orgName}}',
    ctx,
  );
  expect(r.subject).toBe('Offer for Backend Engineer');
  expect(r.body).toBe(
    'Dear Asha Rao, comp $120,000 / year, start January 6, 2026, respond https://x/offer/tok by December 31, 2025 — Priya at Acme',
  );
});

it('leaves unknown tokens untouched', () => {
  expect(renderOfferTemplate('{{nope}}', 'x', ctx).subject).toBe('{{nope}}');
});
