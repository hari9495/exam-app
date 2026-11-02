import { Injectable } from '@nestjs/common';
import type { AiProvider } from '@exam-platform/shared';

// PRF-17 "Help me draft": a starting text for the manager's review summary, from the person's goals, feedback they
// received and shared 1:1 notes in the review period. Names never go to the model: the person is "the employee" and
// authors are left out. The manager's text and rating stay final; the draft is only shown, never saved by itself.

export interface ReviewDraftInput {
  periodFrom: string;
  periodTo: string;
  goals: { title: string; weight: number; progress: number; confidence: string | null }[];
  feedback: { kind: string; text: string }[];
  sharedNotes: string[];
}

const SCHEMA = {
  type: 'object' as const,
  properties: {
    draft: { type: 'string', description: 'A 3-5 sentence review summary in plain English: results first with figures from the input, then one area to grow, with an example. Refer to the person only as "the employee".' },
  },
  required: ['draft'],
};

/** Strips the person's names from free text before it leaves (word-boundary, any case). */
export function withoutNames(text: string, names: string[]): string {
  let out = text;
  for (const n of names.filter((x) => x && x.length >= 2)) out = out.replace(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), 'the employee');
  return out;
}

@Injectable()
export class ReviewDraftClient {
  async generate(input: ReviewDraftInput, ai: AiProvider): Promise<{ draft: string }> {
    const prompt = [
      `Write a draft performance review summary for the period ${input.periodFrom} to ${input.periodTo}.`,
      'Use only the facts below. Do not invent results, dates or numbers. Describe behaviour and results, never personality, age, gender or health. Avoid vague praise without an example.',
      'Goals (title · weight % · progress % · latest confidence):',
      ...input.goals.map((g) => `- ${g.title} · ${g.weight}% · ${g.progress}% · ${g.confidence ?? 'no check-in'}`),
      input.feedback.length ? 'Feedback received (kind: text):' : 'No feedback received in the period.',
      ...input.feedback.map((f) => `- ${f.kind}: ${f.text}`),
      input.sharedNotes.length ? 'Shared 1:1 notes:' : '',
      ...input.sharedNotes.map((n) => `- ${n}`),
    ]
      .filter(Boolean)
      .join('\n');
    const result = await ai.generateStructured({ modelTier: 'standard', maxTokens: 600, prompt, tool: { name: 'report_review_draft', description: 'Report the draft review summary.', schema: SCHEMA } });
    if (typeof result.draft !== 'string' || !result.draft.trim()) throw new Error('AI provider returned an empty review draft');
    return { draft: result.draft.trim().slice(0, 4000) };
  }
}
