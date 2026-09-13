import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export interface OutreachEmailInput {
  candidateName: string;
  jobTitle: string;
  intent: string; // what the recruiter wants to say, e.g. "invite to a first-round interview"
  tone?: string | null; // e.g. "warm", "formal"
  candidateSummary?: string | null; // parsed résumé summary, when available
}

const SCHEMA = {
  type: 'object' as const,
  properties: {
    subject: { type: 'string', description: 'A short, specific email subject line.' },
    body: { type: 'string', description: 'The email body in plain text. Use {{placeholders}} for anything not supplied (e.g. {{time}}).' },
  },
  required: ['subject', 'body'],
};

@Injectable()
export class OutreachEmailClient {
  async generate(input: OutreachEmailInput, aiProvider: AiProvider): Promise<{ subject: string; body: string }> {
    const lines = [
      `Write a recruiting outreach email to ${input.candidateName}, a candidate for "${input.jobTitle}".`,
      `Purpose: ${input.intent}.`,
      `Tone: ${input.tone?.trim() || 'warm and professional'}. Keep it brief and personal; no corporate boilerplate. Use {{placeholders}} for details not provided.`,
    ];
    if (input.candidateSummary?.trim()) lines.push(`\nCandidate background (personalise lightly, do not over-reference):\n${input.candidateSummary.trim()}`);

    const result = await aiProvider.generateStructured({
      modelTier: 'standard',
      maxTokens: 800,
      prompt: lines.join('\n'),
      tool: { name: 'report_outreach_email', description: 'Report a drafted outreach email.', schema: SCHEMA },
    });

    if (typeof result.subject !== 'string' || typeof result.body !== 'string' || !result.body.trim()) {
      throw new Error('AI provider returned a malformed outreach email');
    }
    return { subject: result.subject, body: result.body };
  }
}
