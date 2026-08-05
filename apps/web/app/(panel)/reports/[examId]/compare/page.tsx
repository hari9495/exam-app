'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useCandidateComparison } from '../../../../../lib/hooks/usePanelReports';
import { IntegrityBadge } from '../../../../../components/ui';
import { BackLink } from '../../../../../components/BackLink';

export default function PanelComparePage() {
  const { examId } = useParams<{ examId: string }>();
  const searchParams = useSearchParams();
  const invitationIds = (searchParams.get('invitationIds') ?? '').split(',').filter((id) => id.length > 0);

  const { data: rows, isLoading } = useCandidateComparison(examId, invitationIds);

  const header = (
    <>
      <BackLink href={`/reports/${examId}`} label="Back To Results" />
      <h1 className="mb-6 text-2xl font-semibold">Compare Candidates</h1>
    </>
  );

  if (invitationIds.length < 2) {
    return (
      <div>
        {header}
        <p className="text-sm text-gray-500">Select at least 2 candidates to compare.</p>
      </div>
    );
  }

  if (isLoading || !rows) {
    return (
      <div>
        {header}
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  const sectionTitles = [...new Set(rows.flatMap((row) => row.sectionScores.map((section) => section.title)))];

  return (
    <div>
      {header}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="px-3 py-2 font-medium text-gray-600">Metric</th>
              {rows.map((row) => (
                <th key={row.invitationId} className="px-3 py-2 font-medium text-gray-600">
                  {row.candidateName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="px-3 py-2 font-medium">Overall score</td>
              {rows.map((row) => (
                <td key={row.invitationId} className="px-3 py-2">
                  {row.percentage !== null ? `${row.percentage.toFixed(1)}%` : '—'}
                </td>
              ))}
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-3 py-2 font-medium">Result</td>
              {rows.map((row) => (
                <td key={row.invitationId} className="px-3 py-2">
                  {row.passFail ?? '—'}
                </td>
              ))}
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-3 py-2 font-medium">Integrity</td>
              {rows.map((row) => (
                <td key={row.invitationId} className="px-3 py-2">
                  <IntegrityBadge level={row.integrityAnalysis?.level} />
                </td>
              ))}
            </tr>
            {sectionTitles.map((title) => (
              <tr key={title} className="border-b border-gray-100">
                <td className="px-3 py-2 font-medium">{title}</td>
                {rows.map((row) => {
                  const section = row.sectionScores.find((s) => s.title === title);
                  return (
                    <td key={row.invitationId} className="px-3 py-2">
                      {section ? `${section.score}/${section.maxScore}` : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
