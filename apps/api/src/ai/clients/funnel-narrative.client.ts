import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export interface FunnelStage {
  name: string;
  count: number;
}
export interface FunnelNarrativeInput {
  jobTitle?: string | null;
  totalCandidates?: number | null;
  stages: FunnelStage[];
}

const SCHEMA = {
  type: 'object' as const,
  properties: {
    narrative: { type: 'string', description: 'A 2-4 sentence plain-language read of the hiring funnel: where candidates concentrate and where they drop off.' },
    highlights: { type: 'array', items: { type: 'string' }, description: 'Up to 3 short, specific observations or suggested next actions.' },
  },
  required: ['narrative', 'highlights'],
};

@Injectable()
export class FunnelNarrativeClient {
  async generate(input: FunnelNarrativeInput, aiProvider: AiProvider): Promise<{ narrative: string; highlights: string[] }> {
    const stageLines = input.stages.map((s) => `- ${s.name}: ${s.count}`).join('\n');
    const prompt = [
      `Summarise this hiring funnel${input.jobTitle ? ` for "${input.jobTitle}"` : ''} for a busy recruiter.`,
      input.totalCandidates != null ? `Total candidates: ${input.totalCandidates}.` : '',
      'Stage counts (in order):',
      stageLines,
      '\nBe factual and specific to these numbers; point at the largest drop-off. Do not invent data or benchmarks.',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await aiProvider.generateStructured({
      modelTier: 'fast',
      maxTokens: 500,
      prompt,
      tool: { name: 'report_funnel_narrative', description: 'Report a plain-language hiring-funnel summary.', schema: SCHEMA },
    });

    if (typeof result.narrative !== 'string' || !result.narrative.trim()) {
      throw new Error('AI provider returned an empty funnel narrative');
    }
    return { narrative: result.narrative, highlights: Array.isArray(result.highlights) ? (result.highlights as string[]) : [] };
  }
}
