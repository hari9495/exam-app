import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export interface DistractorsInput {
  stem: string;
  correctAnswers: string[];
  count: number;
}

const SCHEMA = {
  type: 'object' as const,
  properties: {
    distractors: {
      type: 'array',
      description: 'Plausible but INCORRECT answer options. Each must be clearly wrong, mutually distinct, and not a paraphrase of a correct answer.',
      items: { type: 'string' },
    },
  },
  required: ['distractors'],
};

@Injectable()
export class QuestionDistractorsClient {
  async generate(input: DistractorsInput, aiProvider: AiProvider): Promise<{ distractors: string[] }> {
    const prompt = [
      `Write ${input.count} plausible but INCORRECT multiple-choice options (distractors) for this question.`,
      `Question: ${input.stem}`,
      `Correct answer(s) (do NOT reproduce or paraphrase these): ${input.correctAnswers.join(' | ')}`,
      'Each distractor should be tempting to someone who half-knows the topic, roughly the same length/style as the correct answer, mutually distinct, and unambiguously wrong.',
    ].join('\n');

    const result = await aiProvider.generateStructured({
      modelTier: 'standard',
      maxTokens: 600,
      prompt,
      tool: { name: 'report_distractors', description: 'Report generated incorrect MCQ options.', schema: SCHEMA },
    });

    if (!Array.isArray(result.distractors)) throw new Error('AI provider returned a malformed distractor set');
    return { distractors: (result.distractors as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim()).slice(0, input.count) };
  }
}
