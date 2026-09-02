'use client';

// v2 Bulk upload & invite candidates — full re-skin on v2 primitives. Upload/template/exam hooks +
// result handling verbatim (format only).
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Upload } from 'lucide-react';
import { useBulkUploadInvite, useDownloadBulkUploadInviteTemplate, BulkUploadInviteResult } from '../../../../../lib/hooks/useInvitations';
import { useExams } from '../../../../../lib/hooks/useExams';
import { useToast } from '../../../../../components/ui';
import { Combobox, dt } from '../../../../../components/ui-v2';

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: 22 };

export default function V2BulkUploadInviteCandidatesPage() {
  const [examId, setExamId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkUploadInviteResult | null>(null);
  // ponytail: pageSize:100 is the server's max — an org with >100 published exams can't invite to
  // exam #101+ here. Upgrade path: a real paginated/typeahead picker if it becomes a constraint.
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
      link.href = url; link.download = filename ?? 'candidate-bulk-upload-invite-template.xlsx';
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    } catch (err) { toast(err instanceof Error ? err.message : 'Failed to download template', 'error'); }
  }
  function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !examId) return;
    bulkUploadInvite.mutate({ file, examId }, {
      onSuccess: (data) => { setResult(data); toast(`Invited ${data.created.length} candidate(s).`); },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to upload candidates.', 'error'),
    });
  }

  const examOptions = [{ value: '', label: 'Select an exam…' }, ...(publishedExams ?? []).map((exam) => ({ value: exam.id, label: exam.title }))];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <Link href="/v2/candidates" style={backLink}><ArrowLeft size={15} /> Back to Candidates</Link>
      <h1 className="v2-title" style={{ fontSize: 22, margin: '10px 0 16px' }}>Bulk upload &amp; invite candidates</h1>
      <form onSubmit={handleUpload} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Fields marked <span style={{ color: 'var(--danger)' }}>*</span> are required.</p>
        <div style={{ maxWidth: 360 }}>
          <label className="v2-label">Exam to invite to <span style={{ color: 'var(--danger)' }}>*</span></label>
          <Combobox options={examOptions} value={examId} onChange={setExamId} width="100%" />
        </div>
        <div>
          <button type="button" onClick={handleDownloadTemplate} disabled={downloadTemplate.isPending} style={dt.toolBtn}><Download size={14} /> Download template</button>
        </div>
        <div>
          <label className="v2-label">Candidate file (.xlsx or .csv, max 5MB)</label>
          <input type="file" accept=".xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 13, color: 'var(--muted)' }} />
        </div>
        <div>
          <button type="submit" disabled={!file || !examId || bulkUploadInvite.isPending} style={{ ...dt.primaryBtn, opacity: !file || !examId || bulkUploadInvite.isPending ? 0.5 : 1, cursor: !file || !examId || bulkUploadInvite.isPending ? 'not-allowed' : 'pointer' }}><Upload size={14} /> {bulkUploadInvite.isPending ? 'Uploading…' : 'Upload & invite'}</button>
        </div>
      </form>
      {result && (
        <div style={{ ...card, marginTop: 16 }}>
          <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>{result.created.length} candidate(s) invited.</p>
          {result.skipped.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)', margin: '0 0 6px' }}>{result.skipped.length} already invited:</p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                {result.skipped.map((skip) => <li key={skip.email}>{skip.email} — {skip.reason}</li>)}
              </ul>
            </div>
          )}
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
