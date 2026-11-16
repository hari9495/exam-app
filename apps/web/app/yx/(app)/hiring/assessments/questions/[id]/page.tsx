'use client';

import { useParams, useRouter } from 'next/navigation';
import { QuestionEditorScreen, type BankContent, type BankQuestion, type BankSettings, type ItemStats } from '@yukthix/ui/assessments';
import { useApi, useApiWrite } from '../../../../../../../lib/yx-hiring';
import { BANK_BASE, loadState } from '../../../../../../../lib/yx-assessments';

// Assessments AS-1 › Question editor (PRC-02, answers 2009, 2010): a new question, or one question with its open change,
// versions, translations (behind the language setting) and item statistics. "new" makes a draft and opens it.
export default function YxQuestionEditorPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const question = useApi<BankQuestion>(isNew ? null : `/question-bank/questions/${id}`);
  const settings = useApi<BankSettings>('/question-bank/settings');
  const stats = useApi<ItemStats>(isNew ? null : `/analytics/questions/${id}`);
  const write = useApiWrite();
  const q = `/question-bank/questions/${id}`;
  return (
    <QuestionEditorScreen
      live={{
        state: isNew ? 'ready' : loadState(question),
        onRetry: () => void question.refetch(),
        question: isNew ? null : question.data ?? null,
        settings: settings.data ?? null,
        stats: stats.data ?? null,
        onBack: () => router.push(`${BANK_BASE}/questions`),
        onSave: async (c: BankContent) => {
          if (!isNew) return write('PUT', q, c);
          const made = await write<{ id: string }>('POST', '/question-bank/questions', c);
          router.replace(`${BANK_BASE}/questions/${made.id}`);
          return { id: made.id, saved: 'draft' as const };
        },
        onSubmit: () => write('POST', `${q}/submit`),
        onWithdraw: () => write('POST', `${q}/withdraw`),
        onSaveTranslation: (lang, t) => write('PUT', `${q}/translations/${lang}`, t),
        onSubmitTranslation: (lang) => write('POST', `${q}/translations/${lang}/submit`),
        onOpenQuestion: (other) => router.push(`${BANK_BASE}/questions/${other}`),
      }}
    />
  );
}
