import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export interface JobDescriptionInput {
  title: string;
  seniority?: string | null;
  keySkills?: string | null;
  notes?: string | null;
}

const SCHEMA = {
  type: 'object' as const,
  properties: {
    description: { type: 'string', description: 'A complete, ready-to-post job description in plain text with clear sections (overview, responsibilities, requirements, nice-to-haves).' },
  },
  required: ['description'],
};

@Injectable()
export class JobDescriptionClient {
  async generate(input: JobDescriptionInput, aiProvider: AiProvider): Promise<{ description: string }> {
    const lines = [
      `Write a job description for the role "${input.title}".`,
      'Use clear sections (a one-paragraph overview, Responsibilities, Requirements, Nice to have). Keep it concise and specific; no company boilerplate, no salary, no equal-opportunity legalese.',
    ];
    if (input.seniority?.trim()) lines.push(`Seniority: ${input.seniority.trim()}.`);
    if (input.keySkills?.trim()) lines.push(`Emphasise these skills: ${input.keySkills.trim()}.`);
    if (input.notes?.trim()) lines.push(`Extra context: ${input.notes.trim()}.`);

    const result = await aiProvider.generateStructured({
      modelTier: 'standard',
      maxTokens: 1500,
      prompt: lines.join('\n'),
      tool: { name: 'report_job_description', description: 'Report a ready-to-post job description.', schema: SCHEMA },
    });

    if (typeof result.description !== 'string' || !result.description.trim()) {
      throw new Error('AI provider returned an empty job description');
    }
    return { description: result.description };
  }
}
