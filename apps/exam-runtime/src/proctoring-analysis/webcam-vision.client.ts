import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export const WEBCAM_FLAG_TYPES = ['another_person', 'phone_or_device', 'looking_away', 'no_candidate', 'notes_or_material', 'other'] as const;
export type WebcamFlagType = (typeof WEBCAM_FLAG_TYPES)[number];

export interface WebcamVisionFlag {
  type: WebcamFlagType;
  note: string;
}
export interface WebcamVisionVerdict {
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
  flags: WebcamVisionFlag[];
}

const PROMPT =
  'These images are webcam snapshots of ONE candidate, taken at intervals during a proctored online exam. ' +
  'Assess the whole set together and report only clear, genuinely visible integrity concerns:\n' +
  '- another_person: a second person is visibly present or partially in frame.\n' +
  '- phone_or_device: the candidate is holding or looking at a phone / second screen / smartwatch.\n' +
  '- looking_away: the candidate repeatedly looks off-screen (e.g. down at notes) across multiple frames.\n' +
  '- no_candidate: the candidate is absent from frame in one or more snapshots.\n' +
  '- notes_or_material: books, papers or written notes are visibly in use.\n' +
  'Do NOT flag normal exam behaviour: brief glances, thinking, adjusting position, poor lighting, or a plain background. ' +
  'When in doubt, do not flag. Report each distinct concern once with a short, factual note. If nothing is clearly wrong, return riskLevel "low" and an empty flags array.';

const TOOL = {
  name: 'report_webcam_analysis',
  description: 'Report integrity concerns visible across a set of exam webcam snapshots.',
  schema: {
    type: 'object' as const,
    properties: {
      riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
      summary: { type: 'string', description: 'One or two factual sentences across the whole set.' },
      flags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [...WEBCAM_FLAG_TYPES] },
            note: { type: 'string', description: 'Short, specific, grounded in what is visible.' },
          },
          required: ['type', 'note'],
        },
      },
    },
    required: ['riskLevel', 'summary', 'flags'],
  },
};

@Injectable()
export class WebcamVisionClient {
  async analyze(images: string[], aiProvider: AiProvider): Promise<WebcamVisionVerdict> {
    const result = await aiProvider.generateStructured({
      modelTier: 'fast',
      maxTokens: 500,
      prompt: PROMPT,
      images,
      tool: TOOL,
    });

    const riskLevel = result.riskLevel === 'high' || result.riskLevel === 'medium' ? result.riskLevel : 'low';
    const flags = Array.isArray(result.flags)
      ? (result.flags as WebcamVisionFlag[]).filter((f) => f && (WEBCAM_FLAG_TYPES as readonly string[]).includes(f.type))
      : [];
    return { riskLevel, summary: typeof result.summary === 'string' ? result.summary : '', flags };
  }
}
