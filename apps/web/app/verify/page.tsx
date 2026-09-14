'use client';

// Public certificate-verification entry: enter a certificate ID to look it up. Linked from the
// per-certificate result page; the certificate PDF links straight to /verify/<id>.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const page: React.CSSProperties = { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f6f8fb', color: '#0b1220', fontFamily: 'system-ui, sans-serif' };
const card: React.CSSProperties = { width: '100%', maxWidth: 520, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '28px 30px', boxShadow: '0 12px 40px -20px rgba(11,18,32,.35)' };

export default function VerifyEntryPage() {
  const router = useRouter();
  const [id, setId] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = id.trim();
    if (trimmed) router.push(`/verify/${encodeURIComponent(trimmed)}`);
  }

  return (
    <main style={page}>
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 12 }}>Certificate verification</div>
        <h1 style={{ fontSize: 20, margin: '0 0 6px' }}>Verify a certificate</h1>
        <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 18px' }}>Enter the Certificate ID printed on the certificate (or scan its QR code) to confirm it&apos;s genuine.</p>
        <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="Certificate ID"
            aria-label="Certificate ID"
            style={{ flex: 1, padding: '10px 12px', fontSize: 14, borderRadius: 9, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
          />
          <button type="submit" disabled={!id.trim()} style={{ padding: '10px 18px', fontSize: 14, fontWeight: 600, borderRadius: 9, border: 'none', background: id.trim() ? '#1f3a5f' : '#94a3b8', color: '#fff', cursor: id.trim() ? 'pointer' : 'not-allowed' }}>Verify</button>
        </form>
      </div>
    </main>
  );
}
