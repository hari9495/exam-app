'use client';

// v2 Bulk upload questions — full re-skin on v2 primitives. Upload/template hooks + result handling
// verbatim (format only).
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Upload } from 'lucide-react';
import { useBulkUploadQuestions, useDownloadBulkUploadTemplate, BulkUploadResult } from '../../../../../lib/hooks/useQuestions';
import { useToast } from '../../../../../components/ui';
import { dt } from '../../../../../components/ui-v2';

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: 22 };

export default function V2BulkUploadQuestionsPage() {
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
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <Link href="/v2/questions" style={backLink}><ArrowLeft size={15} /> Back to Question Bank</Link>
      <h1 className="v2-title" style={{ fontSize: 22, margin: '10px 0 16px' }}>Bulk upload questions</h1>
      <form onSubmit={handleUpload} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <button type="button" onClick={handleDownloadTemplate} disabled={downloadTemplate.isPending} style={dt.toolBtn}><Download size={14} /> Download template</button>
        </div>
        <div>
          <label className="v2-label">Question file (.xlsx or .csv, max 5MB)</label>
          <input type="file" accept=".xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 13, color: 'var(--muted)' }} />
        </div>
        <div>
          <button type="submit" disabled={!file || bulkUpload.isPending} style={{ ...dt.primaryBtn, opacity: !file || bulkUpload.isPending ? 0.5 : 1, cursor: !file || bulkUpload.isPending ? 'not-allowed' : 'pointer' }}><Upload size={14} /> {bulkUpload.isPending ? 'Uploading…' : 'Upload'}</button>
        </div>
      </form>
      {result && (
        <div style={{ ...card, marginTop: 16 }}>
          <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>{result.created.length} question(s) created.</p>
          {result.errors.length > 0 && (
            <div style={{ marginTop: 14 }}>
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
    </div>
  );
}
