'use client';

// v2 Bulk upload questions — as a Dialog (opened from the Question Bank list). Upload/template hooks
// + result handling verbatim (format only).
import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useBulkUploadQuestions, useDownloadBulkUploadTemplate, BulkUploadResult } from '../../../../lib/hooks/useQuestions';
import { useToast } from '../../../../components/ui';
import { Dialog, dt } from '../../../../components/ui-v2';

export function BulkUploadQuestionsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      link.href = url; link.download = filename ?? 'question-bulk-upload-template.xlsx';
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    } catch (err) { toast(err instanceof Error ? err.message : 'Failed to download template', 'error'); }
  }
  function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    bulkUpload.mutate(file, {
      onSuccess: (data) => { setResult(data); toast(`${data.created.length} question(s) created.`); },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to upload questions.', 'error'),
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Bulk upload questions" width={520}>
      <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <button type="button" onClick={handleDownloadTemplate} disabled={downloadTemplate.isPending} style={dt.toolBtn}><Download size={14} /> Download template</button>
        </div>
        <div>
          <label className="v2-label">Question file (.xlsx or .csv, max 5MB)</label>
          <input type="file" accept=".xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 13, color: 'var(--muted)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={dt.toolBtn}>Close</button>
          <button type="submit" disabled={!file || bulkUpload.isPending} style={{ ...dt.primaryBtn, opacity: !file || bulkUpload.isPending ? 0.5 : 1, cursor: !file || bulkUpload.isPending ? 'not-allowed' : 'pointer' }}><Upload size={14} /> {bulkUpload.isPending ? 'Uploading…' : 'Upload'}</button>
        </div>
      </form>
      {result && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--hair)', maxHeight: 300, overflowY: 'auto' }}>
          <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>{result.created.length} question(s) created.</p>
          {result.errors.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--danger)', margin: '0 0 8px' }}>{result.errors.length} row(s) had errors:</p>
              <div style={{ overflowX: 'auto', overflowY: 'hidden', border: '1px solid var(--hair)', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={dt.th}>Row</th><th style={dt.th}>Error</th></tr></thead>
                  <tbody>
                    {result.errors.map((error) => (
                      <tr key={error.row}><td style={{ ...dt.td, ...dt.muted }}>{error.row}</td><td style={{ ...dt.td, color: 'var(--danger)' }}>{error.message}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
