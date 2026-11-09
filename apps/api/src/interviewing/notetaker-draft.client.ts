import type { AiProvider } from '@exam-platform/shared';

/** One drafted rating: the AI's suggestion for one scorecard skill, with a short note and a quote from the transcript. */
export interface DraftItem {
  itemId: string;
  skill: string;
  rating: number;
  note: string;
  quote: string;
}

export interface DraftInput {
  jobTitle: string;
  scaleMax: number;
  skills: { id: string; label: string; guidance: string | null }[];
  transcript: string;
}

/** The transcript part sent to the AI (only what is needed: no names, emails or ids are added by us). */
export const MAX_TRANSCRIPT_CHARS = 60_000;

/**
 * HIR-25 (founder decision 2): drafts one panellist's scorecard from the consented transcript, one rating per skill of
 * the interview's scorecard. A suggestion only: every rating is confirmed or changed by the panellist before submitting.
 * Replaces the older notes-to-scorecard client (its route POST interviews/:id/scorecard is removed).
 */
export async function draftScorecard(input: DraftInput, provider: AiProvider): Promise<DraftItem[]> {
  const schema = {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            skill: { type: 'string', description: 'The skill name exactly as given.' },
            rating: { type: 'integer', minimum: 1, maximum: input.scaleMax },
            note: { type: 'string', description: 'One sentence of evidence from the transcript.' },
            quote: { type: 'string', description: 'A short exact quote from the candidate in the transcript.' },
          },
          required: ['skill', 'rating', 'note', 'quote'],
        },
      },
    },
    required: ['items'],
  };
  const prompt = [
    `Draft an interview scorecard for the role "${input.jobTitle}" from the transcript below. Rate each skill 1 to ${input.scaleMax}.`,
    'Base every rating only on what the candidate said in the transcript; never invent evidence. Quote the candidate exactly. An interviewer will check and may change every rating.',
    `\nSkills:\n${input.skills.map((s) => `- ${s.label}${s.guidance ? ` (${s.guidance})` : ''}`).join('\n')}`,
    `\nTranscript:\n${input.transcript.slice(0, MAX_TRANSCRIPT_CHARS)}`,
  ].join('\n');
  const result = (await provider.generateStructured({ modelTier: 'standard', maxTokens: 1500, prompt, tool: { name: 'report_draft_scorecard', description: 'Report the drafted ratings.', schema } })) as unknown as { items?: unknown };
  return checkDraft(input, result?.items);
}

/** Keeps only well-formed ratings for the scorecard's own skills, in the scorecard's order (a malformed reply is refused). */
export function checkDraft(input: Pick<DraftInput, 'scaleMax' | 'skills'>, items: unknown): DraftItem[] {
  if (!Array.isArray(items)) throw new Error('The AI returned a malformed draft');
  const out: DraftItem[] = [];
  for (const s of input.skills) {
    const hit = items.find((x) => x && typeof x === 'object' && String((x as { skill?: unknown }).skill ?? '').trim().toLowerCase() === s.label.trim().toLowerCase()) as { rating?: unknown; note?: unknown; quote?: unknown } | undefined;
    if (!hit || !Number.isInteger(hit.rating) || (hit.rating as number) < 1 || (hit.rating as number) > input.scaleMax) continue;
    out.push({ itemId: s.id, skill: s.label, rating: hit.rating as number, note: String(hit.note ?? '').slice(0, 1000), quote: String(hit.quote ?? '').slice(0, 500) });
  }
  if (!out.length) throw new Error('The AI returned no usable ratings');
  return out;
}
