'use client';

// v2 platform (super-admin) console shell. Like the recruiter/org-admin v2 layouts but PLATFORM-
// scoped: no org branding (there's no single org), Workfox platform identity, super_admin-only gate.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MotionConfig } from 'framer-motion';
import { Building2, CreditCard, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { staffLandingPath } from '../../../lib/staff-landing';
import { useCurrentUser } from '../../../lib/hooks/useCurrentUser';
import { AppShell } from '../../../components/ui-v2';

const PLATFORM_NAV = [
  { href: '/v2/organizations', label: 'Organizations', icon: Building2 },
  { href: '/v2/plans', label: 'Plans', icon: CreditCard },
  { href: '/v2/platform-admins', label: 'Platform admins', icon: ShieldCheck },
  { href: '/v2/all-users', label: 'All users', icon: Users },
];

export default function PlatformV2Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken, role, isLoading, logout } = useAuth();
  const { data: currentUser } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    } else if (!isLoading && accessToken && role && role !== 'super_admin') {
      router.push(staffLandingPath(role));
    }
  }, [isLoading, accessToken, role, router]);

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  if (isLoading || !accessToken || (role !== null && role !== 'super_admin')) {
    return <p className="p-8 text-sm text-muted">Loading…</p>;
  }

  const displayName = currentUser?.name || 'Super Admin';
  const initials = displayName.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();

  return (
    <MotionConfig reducedMotion="user">
      {/* Platform is the azure platform slot itself — no org-primary override. */}
      <div className="v2" style={{ minHeight: '100vh' }}>
        <AppShell
          navItems={PLATFORM_NAV}
          orgName="Workfox Platform"
          orgInitial="W"
          roleLabel="Super Admin"
          displayName={displayName}
          initials={initials}
          avatarUrl={currentUser?.avatarUrl ?? undefined}
          onLogout={handleLogout}
        >
          {children}
        </AppShell>
      </div>
    </MotionConfig>
  );
}
