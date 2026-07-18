import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { IntegrityFlag } from './integrity-rules';

export interface IntegrityNarrativeContext {
  examTitle: string;
  level: string;
}

const INTEGRITY_NARRATIVE_TOOL = {
  name: 'report_integrity_narrative',
  description: 'Report a narrative summary of the integrity evidence found in a candidate exam attempt.',
  input_schema: {
    type: 'object' as const,
    properties: {
      narrative: {
        type: 'string',
        description:
          'A 3-5 sentence, plain-language narrative for a recruiter describing the evidence factually, without accusing the candidate of cheating.',
      },
    },
    required: ['narrative'],
  },
};

@Injectable()
export class ClaudeIntegrityClient {
  async writeNarrative(flags: IntegrityFlag[], context: IntegrityNarrativeContext, apiKey: string): Promise<string> {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      tools: [INTEGRITY_NARRATIVE_TOOL],
      tool_choice: { type: 'tool', name: 'report_integrity_narrative' },
      messages: [
        {
          role: 'user',
          content:
            'Write a factual, plain-language narrative (3-5 sentences) for a recruiter summarizing the integrity ' +
            `evidence found in exam "${context.examTitle}" (overall level: ${context.level}). Describe what was ` +
            'observed without accusing the candidate of cheating.\n\n' +
            `Flags:\n${JSON.stringify(flags, null, 2)}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block: { type: string }) => block.type === 'tool_use',
    ) as { type: 'tool_use'; input: unknown } | undefined;

    if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) {
      throw new Error('Claude did not return a valid report_integrity_narrative tool call');
    }

    const input = toolUse.input as { narrative?: unknown };
    if (typeof input.narrative !== 'string' || input.narrative.trim() === '') {
      throw new Error('Claude returned a malformed integrity narrative');
    }

    return input.narrative;
  }
}
