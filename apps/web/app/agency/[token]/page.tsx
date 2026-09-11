'use client';

// Public agency portal (/agency/[token]) -- an external recruiting agency's own page, reached
// only via the token in their portal link (no login). Mirrors the (candidate)/apply/[applyToken]
// page's pattern: raw fetch(API_BASE...) against the public route, no apiFetch/auth, no
// react-query, no shared-value runtime import. Not under app/v2 or app/(candidate) -- this
// audience is neither staff nor a candidate, so it gets its own minimal, unbranded page (the
// getPortal response carries no org branding fields to theme it with anyway).
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { API_BASE } from '../../../lib/api-client';
import { EMAIL_PATTERN } from '../../../lib/candidateValidation';
import type { PublicAgencyPortal } from '../../../lib/types';

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

// Backend expects raw base64 (Buffer.from(x, 'base64')) -- strip the
// "data:application/pdf;base64," prefix FileReader's readAsDataURL adds.
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

const page: React.CSSProperties = { minHeight: '100vh', background: '#f4f5f7', padding: '32px 16px', display: 'flex', justifyContent: 'center' };
const shell: React.CSSProperties = { width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 };
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e4e9', borderRadius: 12, padding: 24 };
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#1f2430', marginBottom: 6 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid #cfd3dc', fontSize: 14 };
const button: React.CSSProperties = { padding: '10px 18px', borderRadius: 8, border: 'none', background: '#2f4bd6', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 6px', color: '#6b7180', fontWeight: 600, borderBottom: '1px solid #e2e4e9' };
const td: React.CSSProperties = { padding: '8px 6px', borderBottom: '1px solid #eef0f3' };

const STATUS_LABEL: Record<string, string> = { pending: 'Pending review', accepted: 'Accepted', rejected: 'Not selected' };

export default function AgencyPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [portal, setPortal] = useState<PublicAgencyPortal | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [jobId, setJobId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(() => {
    fetch(`${API_BASE}/public/agency-portal/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('not ok');
        return res.json();
      })
      .then((data: PublicAgencyPortal) => setPortal(data))
      .catch(() => setNotFound(true));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!jobId) { setFieldError('Choose a job.'); return; }
    if (!name.trim()) { setFieldError('Enter the candidate’s name.'); return; }
    if (!email.trim() || !EMAIL_PATTERN.test(email.trim())) { setFieldError('Enter a valid email address.'); return; }
    if (!file) { setFieldError('Attach a résumé (PDF).'); return; }
    if (file.type !== 'application/pdf') { setFieldError('Only PDF files are accepted.'); return; }
    if (file.size > MAX_RESUME_BYTES) { setFieldError('File must be 5 MB or smaller.'); return; }
    setFieldError(null);
    setSubmitting(true);
    try {
      const resumeBase64 = await readFileAsBase64(file);
      const res = await fetch(`${API_BASE}/public/agency-portal/${token}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, resumeBase64 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Submission failed. Please try again.');
      }
      setSubmitted(true);
      setName('');
      setEmail('');
      setPhone('');
      setFile(null);
      setJobId('');
      load();
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <div style={page}>
        <div style={{ ...shell, maxWidth: 480 }}>
          <div style={card}>
            <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>This portal is not available</h1>
            <p style={{ fontSize: 13.5, color: '#6b7180', margin: 0 }}>
              This link may have been deactivated, or it isn&apos;t a valid agency portal link. Contact the organization you&apos;re working with for a current link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!portal) {
    return (
      <div style={page}>
        <div style={shell}>
          <p style={{ fontSize: 13.5, color: '#6b7180' }}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={shell}>
        <div style={card}>
          <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>{portal.agencyName}</h1>
          <p style={{ fontSize: 13.5, color: '#6b7180', margin: 0 }}>Submit candidates against the roles below.</p>
        </div>

        <div style={card}>
          <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>Open roles</h2>
          {portal.jobs.length === 0 ? (
            <p style={{ fontSize: 13.5, color: '#6b7180', margin: 0 }}>No roles are open for submissions right now.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: '#1f2430' }}>
              {portal.jobs.map((j) => (
                <li key={j.id} style={{ marginBottom: 4 }}>
                  <strong>{j.title}</strong>
                  {(j.department || j.location) && (
                    <span style={{ color: '#6b7180' }}> — {[j.department, j.location].filter(Boolean).join(' · ')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={card}>
          <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>Submit a candidate</h2>
          {portal.jobs.length === 0 ? (
            <p style={{ fontSize: 13.5, color: '#6b7180', margin: 0 }}>Submissions aren&apos;t open until a role is assigned to you.</p>
          ) : submitted ? (
            <div>
              <p style={{ fontSize: 13.5, color: '#166534', margin: '0 0 12px' }}>Submission received — it&apos;s in the queue for review.</p>
              <button type="button" style={{ ...button, background: '#fff', color: '#2f4bd6', border: '1px solid #2f4bd6' }} onClick={() => setSubmitted(false)}>
                Submit another candidate
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {fieldError && (
                <p role="alert" style={{ margin: 0, fontSize: 13, color: '#b91c1c', background: '#fef2f2', padding: '8px 11px', borderRadius: 8 }}>
                  {fieldError}
                </p>
              )}
              <div>
                <label style={label} htmlFor="agency-job">Job</label>
                <select id="agency-job" style={input} value={jobId} onChange={(e) => setJobId(e.target.value)} required>
                  <option value="">Select a role…</option>
                  {portal.jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="agency-candidate-name">Candidate name</label>
                <input id="agency-candidate-name" style={input} value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label style={label} htmlFor="agency-candidate-email">Candidate email</label>
                <input id="agency-candidate-email" type="email" style={input} value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label style={label} htmlFor="agency-candidate-phone">Candidate phone (optional)</label>
                <input id="agency-candidate-phone" style={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label style={label} htmlFor="agency-resume">Résumé (PDF, max 5 MB)</label>
                <input
                  id="agency-resume" type="file" accept="application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  required
                />
              </div>
              <button type="submit" style={{ ...button, opacity: submitting ? 0.7 : 1 }} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit candidate'}
              </button>
            </form>
          )}
        </div>

        <div style={card}>
          <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>Submission history</h2>
          {portal.submissions.length === 0 ? (
            <p style={{ fontSize: 13.5, color: '#6b7180', margin: 0 }}>No submissions yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Candidate</th>
                    <th style={th}>Job</th>
                    <th style={th}>Status</th>
                    <th style={th}>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {portal.submissions.map((s) => (
                    <tr key={s.id}>
                      <td style={td}>{s.candidateName}</td>
                      <td style={td}>{s.jobTitle}</td>
                      <td style={td}>{STATUS_LABEL[s.status] ?? s.status}</td>
                      <td style={td}>{new Date(s.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
