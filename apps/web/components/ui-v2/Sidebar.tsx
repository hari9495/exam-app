import Link from 'next/link';
import type { StaffNavItem } from '../StaffSidebar';
import { WorkfoxMark } from './WorkfoxMark';
import { BRAND } from '../../lib/brand';

export function Sidebar({
  navItems, pathname, orgName, orgLogoUrl, orgInitial,
}: {
  navItems: StaffNavItem[]; pathname: string | null;
  orgName: string; orgLogoUrl?: string | null; orgInitial: string;
}) {
  return (
    <nav
      className="print:hidden"
      style={{
        width: 224, flexShrink: 0, minHeight: '100vh', position: 'sticky', top: 0,
        background: 'var(--paper)', borderRight: '1px solid var(--hair)',
        display: 'flex', flexDirection: 'column', padding: '14px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 16px 14px', borderBottom: '1px solid var(--hair)' }}>
        {orgLogoUrl ? (
          <img src={orgLogoUrl} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'contain' }} />
        ) : (
          <span style={{ display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: 6, background: 'var(--org-primary)', color: 'var(--org-on-primary)', fontWeight: 700, fontSize: 12 }}>{orgInitial}</span>
        )}
        <span style={{ fontFamily: 'var(--font-disp)', fontWeight: 600, fontSize: 14.5, letterSpacing: '-0.01em' }}>{orgName}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '10px 8px' }}>
        {navItems.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 6, fontSize: 13, fontWeight: active ? 600 : 500,
                textDecoration: 'none',
                color: active ? 'var(--org-primary)' : 'var(--muted)',
                background: active ? 'color-mix(in srgb, var(--org-primary) 8%, transparent)' : 'transparent',
              }}>
              {active && <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, borderRadius: '0 3px 3px 0', background: 'var(--org-primary)' }} />}
              {Icon && <Icon size={16} style={{ flexShrink: 0 }} />}
              {item.label}
            </Link>
          );
        })}
      </div>
      <div style={{ marginTop: 'auto', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 7, color: 'var(--muted)', opacity: 0.6 }}>
        <WorkfoxMark size={16} /> <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{BRAND.productName}</span>
      </div>
    </nav>
  );
}
