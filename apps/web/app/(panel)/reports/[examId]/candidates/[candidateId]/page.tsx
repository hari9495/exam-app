'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  useCandidateReport,
  useAttemptInsight,
  useRegenerateAttemptInsight,
  useResultsList,
} from '../../../../../../lib/hooks/usePanelReports';
import { Badge, Button, Card, StatusBadge, IntegrityBadge, useToast, type StatusTone } from '../../../../../../components/ui';

const PASS_FAIL_VARIANT: Record<string, 'success' | 'danger'> = { pass: 'success', fail: 'danger' };
const SEVERITY_TONE: Record<string, StatusTone> = { high: 'danger', medium: 'warning', low: 'neutral' };

export default function PanelCandidateDetailPage() {
  const { examId, candidateId } = useParams<{ examId: string; candidateId: string }>();
  const searchParams = useSearchParams();
  const attemptId = searchParams.get('attemptId') || null;
  const { data: candidate, isLoading } = useCandidateReport(examId, candidateId);
  const { data: insight, isLoading: insightLoading } = useAttemptInsight(attemptId);
  const { data: results } = useResultsList(examId);
  const regenerate = useRegenerateAttemptInsight();
  const { toast } = useToast();

  const handleRegenerate = () => {
    if (!attemptId) return;
    regenerate.mutateAsync(attemptId).catch((error) => {
      toast(error instanceof Error ? error.message : 'Failed to generate AI insight.', 'error');
    });
  };

  if (isLoading || !candidate) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  const integrity = candidate.integrityAnalysis;
  const questionTextById = new Map(
    candidate.sections.flatMap((section) => section.questions.map((question) => [question.questionId, question.questionText] as const)),
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{candidate.candidateName}</h1>
        <div className="flex items-center gap-2">
          {candidate.passFail && <Badge variant={PASS_FAIL_VARIANT[candidate.passFail] ?? 'default'}>{candidate.passFail}</Badge>}
          <IntegrityBadge level={integrity?.level} />
        </div>
      </div>

      {integrity && (integrity.narrative || integrity.flags.length > 0) && (
        <div className="mb-6">
          <h2 className="mb-2 text-lg font-medium">Integrity analysis</h2>
          {integrity.narrative && <p className="mb-3 text-sm text-gray-700">{integrity.narrative}</p>}
          {integrity.flags.length > 0 && (
            <ul className="flex flex-col gap-2">
              {integrity.flags.map((flag, index) => {
                const questionText = flag.questionId ? questionTextById.get(flag.questionId) : undefined;
                const counterpart =
                  flag.type === 'similarity_match' && flag.counterpartAttemptId
                    ? results?.find((row) => row.attemptId === flag.counterpartAttemptId)
                    : undefined;
                return (
                  <li key={index} className="rounded border border-gray-200 p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span>{flag.detail}</span>
                      <StatusBadge tone={SEVERITY_TONE[flag.severity] ?? 'neutral'}>{flag.severity}</StatusBadge>
                    </div>
                    {questionText && <p className="text-xs text-gray-500">Question: {questionText}</p>}
                    {counterpart && (
                      <Link
                        href={`/reports/${examId}/candidates/${counterpart.candidateId}?attemptId=${counterpart.attemptId ?? ''}`}
                        className="text-xs font-medium text-primary"
                      >
                        View {counterpart.candidateName}&rsquo;s report
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0, ease: 'easeOut' }}>
        <Card className="mb-6">
          <p className="text-xs text-gray-500">Score</p>
          <p className="text-2xl font-semibold">
            {candidate.percentage !== null ? `${candidate.percentage.toFixed(1)}%` : '—'}
            {candidate.score !== null && candidate.maxScore !== null && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({candidate.score}/{candidate.maxScore})
              </span>
            )}
          </p>
        </Card>
      </motion.div>

      {attemptId && (
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}
        >
          <h2 className="mb-2 text-lg font-medium">AI Insight</h2>
          {insightLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : insight?.summary ? (
            <Card>
              <p className="text-sm text-gray-700">{insight.summary}</p>
            </Card>
          ) : insight?.status === 'failed' ? (
            <Card>
              <p className="mb-3 text-sm text-red-700">Generation failed. This is usually temporary — try again.</p>
              <Button variant="secondary" disabled={regenerate.isPending} onClick={handleRegenerate}>
                Retry
              </Button>
            </Card>
          ) : (
            <Card>
              <p className="mb-3 text-sm text-gray-500">Not yet generated</p>
              <Button variant="secondary" disabled={regenerate.isPending} onClick={handleRegenerate}>
                Regenerate
              </Button>
            </Card>
          )}
        </motion.div>
      )}

      <div className="flex flex-col gap-4">
        {candidate.sections.map((section, index) => (
          <motion.div
            key={section.sectionId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 + Math.min(index, 8) * 0.05, ease: 'easeOut' }}
          >
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-medium">{section.title}</h3>
                <span className="text-sm text-gray-500">
                  {section.score}/{section.maxScore}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {section.questions.map((question) => (
                  <div key={question.questionId} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
                    <p className="mb-2 text-sm text-gray-800">{question.questionText}</p>
                    <div className="flex flex-col gap-1">
                      {question.options.map((option) => {
                        const wasSelected = question.selectedOptionIds.includes(option.id);
                        const isCorrectOption = question.correctOptionIds.includes(option.id);
                        return (
                          <p
                            key={option.id}
                            className={
                              isCorrectOption
                                ? 'text-sm font-medium text-green-700'
                                : wasSelected
                                  ? 'text-sm font-medium text-red-700'
                                  : 'text-sm text-gray-600'
                            }
                          >
                            {wasSelected ? '◉' : '○'} {option.text}
                            {isCorrectOption ? ' (correct)' : ''}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
