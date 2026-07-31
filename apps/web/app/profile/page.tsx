'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MotionConfig } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ProfileForm } from '../../components/ProfileForm';

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
    return <p className="p-8 text-sm text-recruiter-text-tertiary">Loading…</p>;
  }

  const homeHref = (role && HOME_BY_ROLE[role]) || '/login';

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-recruiter-bg-subtle">
        <div className="border-b border-recruiter-border bg-white px-6 py-4">
          <Link
            href={homeHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-recruiter-text-secondary hover:text-recruiter-text"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
        </div>
        <main className="mx-auto max-w-md p-8">
          <ProfileForm />
        </main>
      </div>
    </MotionConfig>
  );
}
