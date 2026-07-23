import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export interface ProctoringTimelineEvent {
  eventType: string;
  severity: string;
  elapsedSeconds: number;
}

export interface RiskAssessment {
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
}

const VALID_RISK_LEVELS = ['low', 'medium', 'high'];

@Injectable()
export class ProctoringRiskClient {
  async assessRisk(events: ProctoringTimelineEvent[], aiProvider: AiProvider): Promise<RiskAssessment> {
    const prompt =
      'Analyze this exam attempt\'s proctoring event timeline and assess cheating risk. ' +
      'Consider event severity, frequency, and clustering in time.\n\n' +
      `Events (chronological, seconds elapsed since attempt start):\n${JSON.stringify(events, null, 2)}`;

    const result = await aiProvider.generateStructured({
      modelTier: 'fast',
      maxTokens: 512,
      prompt,
      tool: {
        name: 'report_risk_assessment',
        description: 'Report a risk assessment for a candidate exam attempt based on its proctoring event timeline.',
        schema: {
          type: 'object',
          properties: {
            riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
            summary: { type: 'string', description: 'A short (1-2 sentence) human-readable explanation for a recruiter.' },
          },
          required: ['riskLevel', 'summary'],
        },
      },
    });

    if (!VALID_RISK_LEVELS.includes(result.riskLevel as string) || typeof result.summary !== 'string' || result.summary.trim() === '') {
      throw new Error('AI provider returned a malformed risk assessment');
    }
    return { riskLevel: result.riskLevel as RiskAssessment['riskLevel'], summary: result.summary };
  }
}
