import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

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

const REPORT_CODE_REVIEW_TOOL = {
  name: 'report_code_review',
  description: 'Report a suggested score and written critique for a candidate code submission.',
  input_schema: {
    type: 'object' as const,
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
};

@Injectable()
export class ClaudeCodeReviewClient {
  async review(input: CodeReviewInput, apiKey: string): Promise<CodeReviewResult> {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 512,
      tools: [REPORT_CODE_REVIEW_TOOL],
      tool_choice: { type: 'tool', name: 'report_code_review' },
      messages: [
        {
          role: 'user',
          content:
            `Review this candidate's code submission for a coding question worth ${input.marks} marks.\n\n` +
            `Question:\n${input.questionText}\n\n` +
            (input.starterCode ? `Starter code:\n${input.starterCode}\n\n` : '') +
            `Candidate's submission (${input.codeLanguage}):\n${input.answerText}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block: { type: string }) => block.type === 'tool_use',
    ) as { type: 'tool_use'; input: unknown } | undefined;

    if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) {
      throw new Error('Claude did not return a valid report_code_review tool call');
    }

    const parsed = toolUse.input as { suggestedMarks?: unknown; summary?: unknown };
    if (typeof parsed.suggestedMarks !== 'number' || typeof parsed.summary !== 'string' || parsed.summary.trim() === '') {
      throw new Error('Claude returned a malformed code review');
    }

    return { suggestedMarks: parsed.suggestedMarks, summary: parsed.summary };
  }
}
