import { JobDescriptionClient } from './clients/job-description.client';
import { OfferLetterClient } from './clients/offer-letter.client';
import { OutreachEmailClient } from './clients/outreach-email.client';
import { FunnelNarrativeClient } from './clients/funnel-narrative.client';
import { QuestionTagsClient } from './clients/question-tags.client';
import { QuestionDistractorsClient } from './clients/question-distractors.client';

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

describe('question-bank clients', () => {
  it('QuestionTagsClient normalizes matched/suggested arrays and includes available tags in the prompt', async () => {
    const p = provider({ matched: ['SQL', '  ', 5], suggested: ['Joins'] });
    const out = await new QuestionTagsClient().generate({ text: 'Explain a LEFT JOIN', availableTags: ['SQL', 'Indexes'] }, p);
    expect(out.matched).toEqual(['SQL']); // blanks + non-strings dropped
    expect(out.suggested).toEqual(['Joins']);
    expect(p.generateStructured.mock.calls[0][0].prompt).toContain('SQL, Indexes');
  });

  it('QuestionDistractorsClient trims/caps to count and excludes the correct answer from the prompt intent', async () => {
    const p = provider({ distractors: ['3', '5', '22', '  ', 'extra'] });
    const out = await new QuestionDistractorsClient().generate({ stem: '2+2?', correctAnswers: ['4'], count: 3 }, p);
    expect(out.distractors).toEqual(['3', '5', '22']);
    expect(p.generateStructured.mock.calls[0][0].prompt).toContain('do NOT reproduce');
  });

  it('QuestionDistractorsClient throws on a malformed payload', async () => {
    await expect(new QuestionDistractorsClient().generate({ stem: 'q', correctAnswers: ['a'], count: 2 }, provider({ distractors: 'nope' }))).rejects.toThrow();
  });
});
