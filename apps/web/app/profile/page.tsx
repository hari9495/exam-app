'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MotionConfig } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ProfileForm } from '../../components/ProfileForm';
import { NotificationEmailPreferences } from '../../components/NotificationEmailPreferences';

const HOME_BY_ROLE: Record<string, string> = {
  recruiter: '/dashboard',
  org_admin: '/users',
  panel: '/reports',
};

export default function ProfilePage() {
  const router = useRouter();
  const { accessToken, role, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    }
  }, [isLoading, accessToken, router]);

  if (isLoading || !accessToken) {
    return <p className="p-8 text-sm text-muted">Loading…</p>;
  }

  const homeHref = (role && HOME_BY_ROLE[role]) || '/login';

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-ground">
        <div className="border-b border-rule bg-white px-6 py-4">
          <Link
            href={homeHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
        </div>
        <main className="mx-auto max-w-2xl p-8">
          <ProfileForm />
          <div className="mt-6">
            <NotificationEmailPreferences />
          </div>
        </main>
      </div>
    </MotionConfig>
  );
}
