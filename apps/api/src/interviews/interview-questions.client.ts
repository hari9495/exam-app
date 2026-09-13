import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export const INTERVIEW_QUESTION_CATEGORIES = ['technical', 'behavioral', 'role_specific', 'culture'] as const;
export type InterviewQuestionCategory = (typeof INTERVIEW_QUESTION_CATEGORIES)[number];

export interface GeneratedInterviewQuestion {
  question: string;
  category: InterviewQuestionCategory;
  rationale: string;
}

export interface InterviewQuestionJobContext {
  title: string;
  description: string | null;
  fitCriteria: string | null;
  // A short parsed-résumé summary for the specific candidate, when one exists. Omitted otherwise
  // (the kit is then generic to the role).
  candidateSummary?: string | null;
  // Optional recruiter steer, e.g. "focus on system design" or the interview stage name.
  focus?: string | null;
}

function buildSchema(count: number) {
  return {
    type: 'object' as const,
    properties: {
      questions: {
        type: 'array',
        maxItems: count,
        items: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'The interview question to ask.' },
            category: { type: 'string', enum: [...INTERVIEW_QUESTION_CATEGORIES] },
            rationale: { type: 'string', description: 'One short sentence: what this question probes for.' },
          },
          required: ['question', 'category', 'rationale'],
        },
      },
    },
    required: ['questions'],
  };
}

@Injectable()
export class InterviewQuestionsClient {
  async generate(ctx: InterviewQuestionJobContext, count: number, aiProvider: AiProvider): Promise<GeneratedInterviewQuestion[]> {
    const lines = [
      `Generate ${count} interview questions for a candidate applying to the role "${ctx.title}".`,
      'Spread them across the categories technical, behavioral, role_specific and culture as appropriate for the role.',
      'Each question must be specific and answerable in an interview; avoid yes/no questions and generic filler.',
    ];
    if (ctx.description?.trim()) lines.push(`\nJob description:\n${ctx.description.trim()}`);
    if (ctx.fitCriteria?.trim()) lines.push(`\nWhat a strong hire looks like:\n${ctx.fitCriteria.trim()}`);
    if (ctx.candidateSummary?.trim()) lines.push(`\nCandidate résumé summary (tailor some questions to this background):\n${ctx.candidateSummary.trim()}`);
    if (ctx.focus?.trim()) lines.push(`\nExtra focus requested by the interviewer: ${ctx.focus.trim()}`);

    const result = await aiProvider.generateStructured({
      modelTier: 'standard',
      maxTokens: 2048,
      prompt: lines.join('\n'),
      tool: {
        name: 'report_interview_questions',
        description: 'Report a set of tailored interview questions.',
        schema: buildSchema(count),
      },
    });

    if (!Array.isArray(result.questions)) {
      throw new Error('AI provider returned a malformed set of interview questions');
    }
    // Drop any row missing a category the schema allows -- the provider occasionally invents one.
    return (result.questions as GeneratedInterviewQuestion[]).filter(
      (q) => q && typeof q.question === 'string' && (INTERVIEW_QUESTION_CATEGORIES as readonly string[]).includes(q.category),
    );
  }
}
