import { JobDescriptionClient } from './clients/job-description.client';
import { OfferLetterClient } from './clients/offer-letter.client';
import { OutreachEmailClient } from './clients/outreach-email.client';
import { FunnelNarrativeClient } from './clients/funnel-narrative.client';

const provider = (payload: Record<string, unknown>) => ({ generateStructured: jest.fn().mockResolvedValue(payload), ping: jest.fn() });

describe('drafting clients', () => {
  it('JobDescriptionClient returns the description and includes the title in the prompt', async () => {
    const p = provider({ description: 'A great role' });
    const out = await new JobDescriptionClient().generate({ title: 'SRE', seniority: 'Staff' }, p);
    expect(out).toEqual({ description: 'A great role' });
    const req = p.generateStructured.mock.calls[0][0];
    expect(req.prompt).toContain('SRE');
    expect(req.prompt).toContain('Staff');
  });

  it('JobDescriptionClient throws on an empty description', async () => {
    await expect(new JobDescriptionClient().generate({ title: 'X' }, provider({ description: '   ' }))).rejects.toThrow();
  });

  it('OfferLetterClient returns the body', async () => {
    const out = await new OfferLetterClient().generate({ candidateName: 'Ada', jobTitle: 'Dev' }, provider({ body: 'Dear Ada' }));
    expect(out).toEqual({ body: 'Dear Ada' });
  });

  it('OutreachEmailClient returns subject + body and threads the intent', async () => {
    const p = provider({ subject: 'Hi', body: 'Body' });
    const out = await new OutreachEmailClient().generate({ candidateName: 'Ada', jobTitle: 'Dev', intent: 'schedule a call' }, p);
    expect(out).toEqual({ subject: 'Hi', body: 'Body' });
    expect(p.generateStructured.mock.calls[0][0].prompt).toContain('schedule a call');
  });

  it('OutreachEmailClient throws on a malformed payload', async () => {
    await expect(new OutreachEmailClient().generate({ candidateName: 'A', jobTitle: 'D', intent: 'x' }, provider({ subject: 'Hi' }))).rejects.toThrow();
  });

  it('FunnelNarrativeClient renders stage lines into the prompt and returns narrative + highlights', async () => {
    const p = provider({ narrative: 'Most drop at screen', highlights: ['tighten screening'] });
    const out = await new FunnelNarrativeClient().generate({ jobTitle: 'Dev', stages: [{ name: 'Applied', count: 100 }, { name: 'Screen', count: 20 }] }, p);
    expect(out.narrative).toBe('Most drop at screen');
    expect(out.highlights).toEqual(['tighten screening']);
    expect(p.generateStructured.mock.calls[0][0].prompt).toContain('Applied: 100');
  });
});
