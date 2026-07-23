import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';
import { IntegrityFlag } from './integrity-rules';

export interface IntegrityNarrativeContext {
  examTitle: string;
  level: string;
}

@Injectable()
export class IntegrityNarrativeClient {
  async writeNarrative(flags: IntegrityFlag[], context: IntegrityNarrativeContext, aiProvider: AiProvider): Promise<string> {
    const prompt =
      'Write a factual, plain-language narrative (3-5 sentences) for a recruiter summarizing the integrity ' +
      `evidence found in exam "${context.examTitle}" (overall level: ${context.level}). Describe what was ` +
      'observed without accusing the candidate of cheating.\n\n' +
      `Flags:\n${JSON.stringify(flags, null, 2)}`;

    const result = await aiProvider.generateStructured({
      modelTier: 'fast',
      maxTokens: 512,
      prompt,
      tool: {
        name: 'report_integrity_narrative',
        description: 'Report a narrative summary of the integrity evidence found in a candidate exam attempt.',
        schema: {
          type: 'object',
          properties: {
            narrative: {
              type: 'string',
              description:
                'A 3-5 sentence, plain-language narrative for a recruiter describing the evidence factually, without accusing the candidate of cheating.',
            },
          },
          required: ['narrative'],
        },
      },
    });

    if (typeof result.narrative !== 'string' || result.narrative.trim() === '') {
      throw new Error('AI provider returned a malformed integrity narrative');
    }
    return result.narrative;
  }
}
