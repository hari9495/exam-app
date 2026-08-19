'use client';

import { useState } from 'react';
import {
  useBulkUploadInvite,
  useDownloadBulkUploadInviteTemplate,
  BulkUploadInviteResult,
} from '../../../../lib/hooks/useInvitations';
import { useExams } from '../../../../lib/hooks/useExams';
import { Button, Select, RequiredFieldsNote, useToast } from '../../../../components/ui';
import { BackLink } from '../../../../components/BackLink';

export default function BulkUploadInviteCandidatesPage() {
  const [examId, setExamId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkUploadInviteResult | null>(null);
  // ponytail: pageSize:100 is the server's max -- an org with >100 published
  // exams silently can't invite candidates to exam #101+ here. Upgrade path:
  // replace with a real paginated/typeahead picker if this becomes a real constraint.
  const { data: publishedExamsResponse } = useExams('published', { pageSize: 100 });
  const publishedExams = publishedExamsResponse?.data;
  const { toast } = useToast();
  const bulkUploadInvite = useBulkUploadInvite();
  const downloadTemplate = useDownloadBulkUploadInviteTemplate();

  async function handleDownloadTemplate() {
    try {
      const { blob, filename } = await downloadTemplate.mutateAsync();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? 'candidate-bulk-upload-invite-template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to download template', 'error');
    }
  }

  function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !examId) return;
    bulkUploadInvite.mutate(
      { file, examId },
      {
        onSuccess: (data) => {
          setResult(data);
          // ponytail: toast wording deliberately differs from the result-panel
          // text ("N candidate(s) invited.") below -- identical text in both
          // places at once made them ambiguous to `getByText` (and to users).
          toast(`Invited ${data.created.length} candidate(s).`);
        },
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to upload candidates.', 'error'),
      },
    );
  }

  return (
    <div className="max-w-2xl">
      <BackLink href="/candidates" label="Back To Candidates" />
      <h1 className="mb-6 font-display text-2xl font-bold">Bulk Upload &amp; Invite Candidates</h1>
      <RequiredFieldsNote />
      <div className="mb-4 mt-2">
        <Select
          label="Exam To Invite To"
          value={examId}
          onChange={setExamId}
          options={(publishedExams ?? []).map((exam) => ({ value: exam.id, label: exam.title }))}
          required
        />
      </div>
      <Button variant="secondary" onClick={handleDownloadTemplate} disabled={downloadTemplate.isPending}>
        Download template
      </Button>
      <form onSubmit={handleUpload} className="mt-6 flex flex-col gap-3">
        <label className="text-sm font-medium text-gray-700">
          Candidate file (.xlsx or .csv, max 5MB)
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block text-sm"
          />
        </label>
        <Button type="submit" disabled={!file || !examId || bulkUploadInvite.isPending}>
          {bulkUploadInvite.isPending ? 'Uploading…' : 'Upload & invite'}
        </Button>
      </form>
      {result && (
        <div className="mt-6">
          <p className="text-sm font-medium text-gray-900">{result.created.length} candidate(s) invited.</p>
          {result.skipped.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-gray-700">{result.skipped.length} already invited:</p>
              <ul className="mt-1 text-sm text-gray-600">
                {result.skipped.map((skip) => (
                  <li key={skip.email}>
                    {skip.email} — {skip.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-red-600">{result.errors.length} row(s) had errors:</p>
              <table className="mt-2 w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-1 pr-4 font-medium text-gray-600">Row</th>
                    <th className="py-1 font-medium text-gray-600">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((error) => (
                    <tr key={error.row} className="border-b border-gray-100">
                      <td className="py-1 pr-4">{error.row}</td>
                      <td className="py-1 text-red-600">{error.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
