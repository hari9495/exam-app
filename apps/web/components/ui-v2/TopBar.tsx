import Link from 'next/link';
import { LogOut } from 'lucide-react';

export function TopBar({
  displayName, initials, roleLabel, avatarUrl, onLogout,
}: {
  displayName: string; initials: string; roleLabel: string; avatarUrl?: string | null; onLogout: () => void;
}) {
  return (
    <header className="print:hidden" style={{ height: 56, flexShrink: 0, background: 'var(--paper)', borderBottom: '1px solid var(--hair)', display: 'flex', alignItems: 'center', padding: '0 20px' }}>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href="/profile" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'var(--ink)' }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: '50%', background: 'var(--org-primary)', color: 'var(--org-on-primary)', fontSize: 11, fontWeight: 700 }}>{initials}</span>
          )}
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{displayName}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{roleLabel}</span>
          </span>
        </Link>
        <button onClick={onLogout} aria-label="Log out" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--hair)', borderRadius: 6, padding: '6px 11px', fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>
          <LogOut size={14} /> Log out
        </button>
      </div>
    </header>
  );
}
