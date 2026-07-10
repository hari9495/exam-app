import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface GeneratedQuestionOption {
  text: string;
  isCorrect: boolean;
}

export interface GeneratedQuestion {
  type: string;
  text: string;
  options: GeneratedQuestionOption[];
}

const GENERATE_QUESTIONS_TOOL = {
  name: 'report_generated_questions',
  description: 'Report a set of generated multiple-choice exam questions.',
  input_schema: {
    type: 'object' as const,
    properties: {
      questions: {
        type: 'array',
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
  },
};

@Injectable()
export class ClaudeQuestionGenerationClient {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async generate(topic: string, difficulty: string, questionTypes: string[], count: number): Promise<GeneratedQuestion[]> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      tools: [GENERATE_QUESTIONS_TOOL],
      tool_choice: { type: 'tool', name: 'report_generated_questions' },
      messages: [
        {
          role: 'user',
          content:
            `Generate ${count} multiple-choice exam question(s) about "${topic}" at "${difficulty}" difficulty. ` +
            `Use only these question types: ${questionTypes.join(', ')}. You decide how many questions to generate ` +
            'of each type, but the total must equal the requested count.\n\n' +
            'Follow these type rules exactly:\n' +
            '- single_mcq: exactly 1 correct option, at least 2 options total.\n' +
            '- multi_mcq: at least 1 correct option, at least 2 options total.\n' +
            '- true_false: exactly 2 options, exactly 1 correct.',
        },
      ],
    });

    const toolUse = response.content.find(
      (block: { type: string }) => block.type === 'tool_use',
    ) as { type: 'tool_use'; input: unknown } | undefined;

    if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) {
      throw new Error('Claude did not return a valid report_generated_questions tool call');
    }

    const input = toolUse.input as { questions?: unknown };
    if (!Array.isArray(input.questions)) {
      throw new Error('Claude returned malformed generated questions');
    }

    return input.questions as GeneratedQuestion[];
  }
}
