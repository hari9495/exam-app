import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface ProctoringTimelineEvent {
  eventType: string;
  severity: string;
  elapsedSeconds: number;
}

export interface RiskAssessment {
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
}

const RISK_ASSESSMENT_TOOL = {
  name: 'report_risk_assessment',
  description: 'Report a risk assessment for a candidate exam attempt based on its proctoring event timeline.',
  input_schema: {
    type: 'object' as const,
    properties: {
      riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
      summary: { type: 'string', description: 'A short (1-2 sentence) human-readable explanation for a recruiter.' },
    },
    required: ['riskLevel', 'summary'],
  },
};

const VALID_RISK_LEVELS = ['low', 'medium', 'high'];

@Injectable()
export class ClaudeProctoringClient {
  async assessRisk(events: ProctoringTimelineEvent[], apiKey: string): Promise<RiskAssessment> {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      tools: [RISK_ASSESSMENT_TOOL],
      tool_choice: { type: 'tool', name: 'report_risk_assessment' },
      messages: [
        {
          role: 'user',
          content:
            'Analyze this exam attempt\'s proctoring event timeline and assess cheating risk. ' +
            'Consider event severity, frequency, and clustering in time.\n\n' +
            `Events (chronological, seconds elapsed since attempt start):\n${JSON.stringify(events, null, 2)}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block: { type: string }) => block.type === 'tool_use',
    ) as { type: 'tool_use'; input: unknown } | undefined;

    if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) {
      throw new Error('Claude did not return a valid report_risk_assessment tool call');
    }

    const input = toolUse.input as { riskLevel?: unknown; summary?: unknown };
    if (!VALID_RISK_LEVELS.includes(input.riskLevel as string) || typeof input.summary !== 'string' || input.summary.trim() === '') {
      throw new Error('Claude returned a malformed risk assessment');
    }

    return { riskLevel: input.riskLevel as RiskAssessment['riskLevel'], summary: input.summary };
  }
}
