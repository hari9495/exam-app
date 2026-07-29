'use client';

import { useState } from 'react';
import { useBulkUploadQuestions, useDownloadBulkUploadTemplate, BulkUploadResult } from '../../../../lib/hooks/useQuestions';
import { Button, useToast } from '../../../../components/ui';
import { BackLink } from '../../../../components/BackLink';

export default function BulkUploadQuestionsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkUploadResult | null>(null);
  const { toast } = useToast();
  const bulkUpload = useBulkUploadQuestions();
  const downloadTemplate = useDownloadBulkUploadTemplate();

  async function handleDownloadTemplate() {
    try {
      const { blob, filename } = await downloadTemplate.mutateAsync();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? 'question-bulk-upload-template.xlsx';
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
    if (!file) return;
    bulkUpload.mutate(file, {
      onSuccess: (data) => {
        setResult(data);
        toast(`${data.created.length} question(s) created.`);
      },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to upload questions.', 'error'),
    });
  }

  return (
    <div className="max-w-2xl">
      <BackLink href="/questions" label="Back to question bank" />
      <h1 className="mb-6 text-2xl font-semibold">Bulk Upload Questions</h1>
      <Button variant="secondary" onClick={handleDownloadTemplate} disabled={downloadTemplate.isPending}>
        Download template
      </Button>
      <form onSubmit={handleUpload} className="mt-6 flex flex-col gap-3">
        <label className="text-sm font-medium text-gray-700">
          Question file (.xlsx or .csv, max 5MB)
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block text-sm"
          />
        </label>
        <Button type="submit" disabled={!file || bulkUpload.isPending}>
          {bulkUpload.isPending ? 'Uploading…' : 'Upload'}
        </Button>
      </form>
      {result && (
        <div className="mt-6">
          <p className="text-sm font-medium text-gray-900">{result.created.length} question(s) created.</p>
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
