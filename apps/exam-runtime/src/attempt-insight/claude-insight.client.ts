import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

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

const REPORT_INSIGHT_TOOL = {
  name: 'report_insight',
  description: 'Report a narrative evaluation summary for a candidate exam attempt.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: {
        type: 'string',
        description:
          'A short (2-4 sentence) human-readable evaluation summary for a recruiter, covering topic strengths/weaknesses and, if present, proctoring signals.',
      },
    },
    required: ['summary'],
  },
};

@Injectable()
export class ClaudeInsightClient {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async generate(input: InsightInput): Promise<string> {
    const proctoringLine = input.proctoring
      ? `\n\nProctoring risk assessment: ${input.proctoring.riskLevel} risk. ${input.proctoring.summary}`
      : '';

    const response = await this.client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 512,
      tools: [REPORT_INSIGHT_TOOL],
      tool_choice: { type: 'tool', name: 'report_insight' },
      messages: [
        {
          role: 'user',
          content:
            "Write a short evaluation summary for a recruiter reviewing this candidate's exam attempt. " +
            `Overall result: ${input.percentage}% (${input.passFail}).\n\n` +
            `Per-topic performance:\n${JSON.stringify(input.topicBreakdown, null, 2)}${proctoringLine}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block: { type: string }) => block.type === 'tool_use',
    ) as { type: 'tool_use'; input: unknown } | undefined;

    if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) {
      throw new Error('Claude did not return a valid report_insight tool call');
    }

    const parsed = toolUse.input as { summary?: unknown };
    if (typeof parsed.summary !== 'string' || parsed.summary.trim() === '') {
      throw new Error('Claude returned a malformed insight summary');
    }

    return parsed.summary;
  }
}
