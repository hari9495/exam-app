import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export interface OfferLetterInput {
  candidateName: string;
  jobTitle: string;
  orgName?: string | null;
  salary?: string | null;
  startDate?: string | null;
  notes?: string | null;
}

const SCHEMA = {
  type: 'object' as const,
  properties: {
    body: { type: 'string', description: 'The offer letter body in warm, professional plain text. Use {{placeholders}} for any detail not supplied.' },
  },
  required: ['body'],
};

@Injectable()
export class OfferLetterClient {
  async generate(input: OfferLetterInput, aiProvider: AiProvider): Promise<{ body: string }> {
    const lines = [
      `Draft an offer letter for ${input.candidateName} for the role "${input.jobTitle}"${input.orgName ? ` at ${input.orgName}` : ''}.`,
      'Warm and professional. Do not invent specifics: for any detail not given, leave a {{placeholder}} the recruiter can fill in.',
    ];
    if (input.salary?.trim()) lines.push(`Compensation: ${input.salary.trim()}.`);
    if (input.startDate?.trim()) lines.push(`Start date: ${input.startDate.trim()}.`);
    if (input.notes?.trim()) lines.push(`Extra context: ${input.notes.trim()}.`);

    const result = await aiProvider.generateStructured({
      modelTier: 'standard',
      maxTokens: 1200,
      prompt: lines.join('\n'),
      tool: { name: 'report_offer_letter', description: 'Report a drafted offer letter body.', schema: SCHEMA },
    });

    if (typeof result.body !== 'string' || !result.body.trim()) {
      throw new Error('AI provider returned an empty offer letter');
    }
    return { body: result.body };
  }
}
