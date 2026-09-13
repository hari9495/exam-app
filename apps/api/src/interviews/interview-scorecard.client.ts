import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export const SCORECARD_RECOMMENDATIONS = ['strong_yes', 'yes', 'no', 'strong_no'] as const;
export type ScorecardRecommendation = (typeof SCORECARD_RECOMMENDATIONS)[number];

export interface ScorecardCompetency {
  name: string;
  rating: number; // 1-5
  justification: string;
}

export interface GeneratedScorecard {
  recommendation: ScorecardRecommendation;
  summary: string;
  competencies: ScorecardCompetency[];
  strengths: string[];
  concerns: string[];
}

export interface ScorecardInput {
  jobTitle: string;
  jobDescription: string | null;
  notes: string; // raw interviewer notes / free text
}

const SCHEMA = {
  type: 'object' as const,
  properties: {
    recommendation: { type: 'string', enum: [...SCORECARD_RECOMMENDATIONS] },
    summary: { type: 'string', description: 'A 2-3 sentence overall assessment.' },
    competencies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The competency assessed, e.g. "Problem solving".' },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          justification: { type: 'string', description: 'One sentence grounded in the notes.' },
        },
        required: ['name', 'rating', 'justification'],
      },
    },
    strengths: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
  },
  required: ['recommendation', 'summary', 'competencies', 'strengths', 'concerns'],
};

@Injectable()
export class InterviewScorecardClient {
  async generate(input: ScorecardInput, aiProvider: AiProvider): Promise<GeneratedScorecard> {
    const lines = [
      `An interviewer assessed a candidate for the role "${input.jobTitle}". Turn their raw notes into a structured scorecard.`,
      'Base every rating and claim strictly on the notes provided; do not invent evidence. If the notes are thin, keep competencies few and say so in the summary.',
    ];
    if (input.jobDescription?.trim()) lines.push(`\nJob description (for context only):\n${input.jobDescription.trim()}`);
    lines.push(`\nInterviewer notes:\n${input.notes.trim()}`);

    const result = (await aiProvider.generateStructured({
      modelTier: 'standard',
      maxTokens: 1024,
      prompt: lines.join('\n'),
      tool: {
        name: 'report_scorecard',
        description: 'Report a structured interview scorecard derived from the interviewer notes.',
        schema: SCHEMA,
      },
    })) as unknown as GeneratedScorecard;

    if (!result || !(SCORECARD_RECOMMENDATIONS as readonly string[]).includes(result.recommendation)) {
      throw new Error('AI provider returned a malformed scorecard');
    }
    return {
      recommendation: result.recommendation,
      summary: typeof result.summary === 'string' ? result.summary : '',
      competencies: Array.isArray(result.competencies) ? result.competencies : [],
      strengths: Array.isArray(result.strengths) ? result.strengths : [],
      concerns: Array.isArray(result.concerns) ? result.concerns : [],
    };
  }
}
