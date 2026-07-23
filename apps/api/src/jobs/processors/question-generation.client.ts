import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export interface GeneratedQuestionOption {
  text: string;
  isCorrect: boolean;
}

export interface GeneratedQuestion {
  type: string;
  text: string;
  options: GeneratedQuestionOption[];
}

function buildGenerateQuestionsSchema(count: number) {
  return {
    type: 'object' as const,
    properties: {
      questions: {
        type: 'array',
        maxItems: count,
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['single_mcq', 'multi_mcq', 'true_false'] },
            text: { type: 'string', description: 'The question stem.' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  isCorrect: { type: 'boolean' },
                },
                required: ['text', 'isCorrect'],
              },
            },
          },
          required: ['type', 'text', 'options'],
        },
      },
    },
    required: ['questions'],
  };
}

@Injectable()
export class QuestionGenerationClient {
  async generate(topic: string, difficulty: string, questionTypes: string[], count: number, aiProvider: AiProvider): Promise<GeneratedQuestion[]> {
    const prompt =
      `Generate ${count} multiple-choice exam question(s) about "${topic}" at "${difficulty}" difficulty. ` +
      `Use only these question types: ${questionTypes.join(', ')}. You decide how many questions to generate ` +
      'of each type, but the total must equal the requested count.\n\n' +
      'Follow these type rules exactly:\n' +
      '- single_mcq: exactly 1 correct option, at least 2 options total.\n' +
      '- multi_mcq: at least 1 correct option, at least 2 options total.\n' +
      '- true_false: exactly 2 options, exactly 1 correct.';

    const result = await aiProvider.generateStructured({
      modelTier: 'standard',
      maxTokens: 4096,
      prompt,
      tool: {
        name: 'report_generated_questions',
        description: 'Report a set of generated multiple-choice exam questions.',
        schema: buildGenerateQuestionsSchema(count),
      },
    });

    if (!Array.isArray(result.questions)) {
      throw new Error('AI provider returned malformed generated questions');
    }
    return result.questions as GeneratedQuestion[];
  }
}
