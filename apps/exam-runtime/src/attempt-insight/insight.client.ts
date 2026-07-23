import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export interface TopicBreakdownEntry {
  topic: string;
  correct: number;
  total: number;
}

export interface ProctoringContext {
  riskLevel: string;
  summary: string;
}

export interface InsightInput {
  percentage: number;
  passFail: string;
  topicBreakdown: TopicBreakdownEntry[];
  proctoring: ProctoringContext | null;
}

@Injectable()
export class InsightClient {
  async generate(input: InsightInput, aiProvider: AiProvider): Promise<string> {
    const proctoringLine = input.proctoring
      ? `\n\nProctoring risk assessment: ${input.proctoring.riskLevel} risk. ${input.proctoring.summary}`
      : '';
    const prompt =
      "Write a short evaluation summary for a recruiter reviewing this candidate's exam attempt. " +
      `Overall result: ${input.percentage}% (${input.passFail}).\n\n` +
      `Per-topic performance:\n${JSON.stringify(input.topicBreakdown, null, 2)}${proctoringLine}`;

    const result = await aiProvider.generateStructured({
      modelTier: 'standard',
      maxTokens: 512,
      prompt,
      tool: {
        name: 'report_insight',
        description: 'Report a narrative evaluation summary for a candidate exam attempt.',
        schema: {
          type: 'object',
          properties: {
            summary: {
              type: 'string',
              description:
                'A short (2-4 sentence) human-readable evaluation summary for a recruiter, covering topic strengths/weaknesses and, if present, proctoring signals.',
            },
          },
          required: ['summary'],
        },
      },
    });

    if (typeof result.summary !== 'string' || result.summary.trim() === '') {
      throw new Error('AI provider returned a malformed insight summary');
    }
    return result.summary;
  }
}
