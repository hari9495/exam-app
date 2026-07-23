import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export interface CodeReviewInput {
  questionText: string;
  starterCode: string | null;
  codeLanguage: string;
  answerText: string;
  marks: number;
}

export interface CodeReviewResult {
  suggestedMarks: number;
  summary: string;
}

@Injectable()
export class CodeReviewClient {
  async review(input: CodeReviewInput, aiProvider: AiProvider): Promise<CodeReviewResult> {
    const prompt =
      `Review this candidate's code submission for a coding question worth ${input.marks} marks.\n\n` +
      `Question:\n${input.questionText}\n\n` +
      (input.starterCode ? `Starter code:\n${input.starterCode}\n\n` : '') +
      `Candidate's submission (${input.codeLanguage}):\n${input.answerText}`;

    const result = await aiProvider.generateStructured({
      modelTier: 'standard',
      maxTokens: 512,
      prompt,
      tool: {
        name: 'report_code_review',
        description: 'Report a suggested score and written critique for a candidate code submission.',
        schema: {
          type: 'object',
          properties: {
            suggestedMarks: {
              type: 'integer',
              description: "A suggested marks value between 0 and the question's total marks, based on correctness and quality.",
            },
            summary: {
              type: 'string',
              description: 'A short (2-4 sentence) critique for a recruiter, covering correctness, style, and any issues found.',
            },
          },
          required: ['suggestedMarks', 'summary'],
        },
      },
    });

    if (typeof result.suggestedMarks !== 'number' || typeof result.summary !== 'string' || result.summary.trim() === '') {
      throw new Error('AI provider returned a malformed code review');
    }
    return { suggestedMarks: result.suggestedMarks, summary: result.summary };
  }
}
