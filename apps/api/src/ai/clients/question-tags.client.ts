import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export interface QuestionTagsInput {
  text: string;
  options?: string[];
  availableTags: string[];
}

const SCHEMA = {
  type: 'object' as const,
  properties: {
    matched: {
      type: 'array',
      description: 'Tags chosen ONLY from the provided available-tags list that clearly apply to this question.',
      items: { type: 'string' },
    },
    suggested: {
      type: 'array',
      description: 'Up to 3 concise NEW tag names (topic/skill) that fit but are not in the available list. Omit if none.',
      items: { type: 'string' },
    },
  },
  required: ['matched', 'suggested'],
};

@Injectable()
export class QuestionTagsClient {
  async generate(input: QuestionTagsInput, aiProvider: AiProvider): Promise<{ matched: string[]; suggested: string[] }> {
    const lines = [
      'Tag this exam question. Pick applicable tags from the AVAILABLE TAGS list (use their exact spelling); do not invent variants of them.',
      input.availableTags.length ? `AVAILABLE TAGS: ${input.availableTags.join(', ')}` : 'AVAILABLE TAGS: (none yet)',
      `\nQuestion: ${input.text}`,
    ];
    if (input.options?.length) lines.push(`Options: ${input.options.join(' | ')}`);
    lines.push('\nAlso suggest at most 3 new tag names only if a clearly relevant topic/skill is missing from the list.');

    const result = await aiProvider.generateStructured({
      modelTier: 'fast',
      maxTokens: 400,
      prompt: lines.join('\n'),
      tool: { name: 'report_question_tags', description: 'Report applicable + suggested tags for an exam question.', schema: SCHEMA },
    });

    const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim()) : []);
    return { matched: arr(result.matched), suggested: arr(result.suggested) };
  }
}
