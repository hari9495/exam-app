'use client';

// Public certificate verification result. Anyone holding a certificate (its ID is printed on the PDF
// and encoded in the QR) can open /verify/<id> to confirm it's genuine. No auth — calls the public
// endpoint and shows only the facts already on the certificate.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { API_BASE } from '../../../lib/api-client';

type Verification =
  | { valid: false }
  | { valid: true; candidateName: string; examTitle: string; orgName: string; scorePercent: number; issuedAt: string };

const page: React.CSSProperties = { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f6f8fb', color: '#0b1220', fontFamily: 'system-ui, sans-serif' };
const card: React.CSSProperties = { width: '100%', maxWidth: 520, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '28px 30px', boxShadow: '0 12px 40px -20px rgba(11,18,32,.35)' };
const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid #eef2f7', fontSize: 14 };
const label: React.CSSProperties = { color: '#64748b' };
const val: React.CSSProperties = { fontWeight: 600, textAlign: 'right' };

export default function VerifyCertificatePage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<{ loading: true } | { loading: false; data: Verification } | { loading: false; error: true }>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/public/certificates/${encodeURIComponent(id)}/verify`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('request failed'))))
      .then((data: Verification) => { if (!cancelled) setState({ loading: false, data }); })
      .catch(() => { if (!cancelled) setState({ loading: false, error: true }); });
    return () => { cancelled = true; };
  }, [id]);

  return (
    <main style={page}>
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 16 }}>Certificate verification</div>

        {state.loading && <p style={{ color: '#64748b', fontSize: 14 }}>Checking…</p>}

        {!state.loading && 'error' in state && (
          <p style={{ color: '#b91c1c', fontSize: 14 }}>Couldn&apos;t reach the verification service. Please try again.</p>
        )}

        {!state.loading && 'data' in state && !state.data.valid && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span aria-hidden style={{ fontSize: 22 }}>⚠️</span>
              <h1 style={{ fontSize: 20, margin: 0, color: '#b91c1c' }}>Not a valid certificate</h1>
            </div>
            <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
              We couldn&apos;t verify a certificate with this ID. Check the ID for typos, or confirm the certificate is genuine with the issuing organization.
            </p>
          </div>
        )}

        {!state.loading && 'data' in state && state.data.valid && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span aria-hidden style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: '50%', background: '#dcfce7', color: '#15803d', fontSize: 17 }}>✓</span>
              <h1 style={{ fontSize: 20, margin: 0, color: '#15803d' }}>Valid certificate</h1>
            </div>
            <div style={row}><span style={label}>Awarded to</span><span style={val}>{state.data.candidateName}</span></div>
            <div style={row}><span style={label}>Exam</span><span style={val}>{state.data.examTitle}</span></div>
            <div style={row}><span style={label}>Issued by</span><span style={val}>{state.data.orgName}</span></div>
            <div style={row}><span style={label}>Score</span><span style={val}>{state.data.scorePercent}%</span></div>
            <div style={{ ...row, borderBottom: 'none' }}><span style={label}>Issued</span><span style={val}>{new Date(state.data.issuedAt).toLocaleDateString(undefined, { dateStyle: 'long' } as Intl.DateTimeFormatOptions)}</span></div>
          </div>
        )}

        <p style={{ marginTop: 22, fontSize: 12, color: '#94a3b8' }}>
          <Link href="/verify" style={{ color: '#64748b' }}>Verify another certificate</Link>
        </p>
      </div>
    </main>
  );
}
