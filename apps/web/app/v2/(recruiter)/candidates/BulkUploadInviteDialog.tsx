'use client';

// v2 Bulk upload & invite candidates — as a Dialog (opened from the candidates list, like Add
// candidate). Upload/template/exam hooks + result handling verbatim (format only).
import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useBulkUploadInvite, useDownloadBulkUploadInviteTemplate, BulkUploadInviteResult } from '../../../../lib/hooks/useInvitations';
import { useExams } from '../../../../lib/hooks/useExams';
import { useToast } from '../../../../components/ui';
import { Combobox, Dialog, dt } from '../../../../components/ui-v2';

export function BulkUploadInviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [examId, setExamId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkUploadInviteResult | null>(null);
  // ponytail: pageSize:100 is the server's max — >100 published exams can't invite to #101+ here.
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
    <Dialog open={open} onClose={onClose} title="Bulk upload & invite candidates" width={520}>
      <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Fields marked <span style={{ color: 'var(--danger)' }}>*</span> are required.</p>
        <div>
          <label className="v2-label">Exam to invite to <span style={{ color: 'var(--danger)' }}>*</span></label>
          <Combobox options={examOptions} value={examId} onChange={setExamId} width="100%" />
        </div>
        <div>
          <button type="button" onClick={handleDownloadTemplate} disabled={downloadTemplate.isPending} className="v2-hoverbtn" style={dt.toolBtn}><Download size={14} /> Download template</button>
        </div>
        <div>
          <label className="v2-label">Candidate file (.xlsx or .csv, max 5MB)</label>
          <input type="file" accept=".xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 13, color: 'var(--muted)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="v2-hoverbtn" style={dt.toolBtn}>Close</button>
          <button type="submit" disabled={!file || !examId || bulkUploadInvite.isPending} className="v2-hoverbtn" style={{ ...dt.primaryBtn, opacity: !file || !examId || bulkUploadInvite.isPending ? 0.5 : 1, cursor: !file || !examId || bulkUploadInvite.isPending ? 'not-allowed' : 'pointer' }}><Upload size={14} /> {bulkUploadInvite.isPending ? 'Uploading…' : 'Upload & invite'}</button>
        </div>
      </form>
      {result && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--hair)', maxHeight: 300, overflowY: 'auto' }}>
          <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>{result.created.length} candidate(s) invited.</p>
          {result.skipped.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)', margin: '0 0 6px' }}>{result.skipped.length} already invited:</p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                {result.skipped.map((skip) => <li key={skip.email}>{skip.email} — {skip.reason}</li>)}
              </ul>
            </div>
          )}
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
