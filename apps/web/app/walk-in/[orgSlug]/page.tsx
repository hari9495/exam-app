'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, MotionConfig } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { Button, Input, Select } from '../../../components/ui';
import { useWalkInExams, useWalkInRegister } from '../../../lib/hooks/useWalkIn';

export default function WalkInPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const { data: exams, isLoading, isError } = useWalkInExams(orgSlug);
  const register = useWalkInRegister(orgSlug);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [examId, setExamId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resolvedExamId = exams && exams.length === 1 ? exams[0].id : examId;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    register.mutate(
      { name, email, phone: phone || undefined, examId: resolvedExamId },
      {
        onSuccess: (result) => router.push(`/start?token=${result.token}`),
        onError: (err) => setError(err instanceof Error ? err.message : 'Registration failed.'),
      },
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <main className="grid md:min-h-screen md:grid-cols-2">
        <div
          className="relative hidden overflow-hidden md:flex md:flex-col md:items-start md:justify-center md:gap-4 md:px-16 md:py-12"
          style={{ backgroundImage: 'linear-gradient(135deg, var(--color-primary, #1a73e8), var(--color-accent, #fbbc04))' }}
        >
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10" aria-hidden="true" />
          <p className="relative z-10 text-2xl font-bold text-white">Examination Platform</p>
          <p className="relative z-10 max-w-sm text-sm text-white/90">Register on the spot and start your exam right away.</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-4 bg-white px-6 py-12 md:hidden">
          <p className="text-lg font-bold text-primary">Examination Platform</p>
        </div>

        <div className="flex flex-1 items-center justify-center bg-white px-6 py-12">
          <div className="w-full max-w-sm">
            <h1 className="mb-6 text-xl font-semibold text-recruiter-text">Walk-in registration</h1>

            {isLoading && <p className="text-sm text-recruiter-text-tertiary">Loading&hellip;</p>}

            {isError && (
              <p role="alert" className="text-sm text-status-danger">
                This registration page isn&apos;t available right now.
              </p>
            )}

            {!isLoading && !isError && exams && exams.length === 0 && (
              <p className="text-sm text-recruiter-text-secondary">
                No exams are currently open for walk-in registration.
              </p>
            )}

            {!isLoading && !isError && exams && exams.length > 0 && (
              <motion.form
                onSubmit={handleSubmit}
                className="flex flex-col gap-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <Input label="Name" value={name} onChange={setName} required />
                <Input label="Email" type="email" value={email} onChange={setEmail} required />
                <Input label="Phone" value={phone} onChange={setPhone} />
                {exams.length > 1 && (
                  <Select
                    label="Exam"
                    value={examId}
                    onChange={setExamId}
                    options={exams.map((exam) => ({ value: exam.id, label: exam.title }))}
                  />
                )}
                <Button type="submit" loading={register.isPending} disabled={!resolvedExamId}>
                  Start exam
                </Button>
                {error && (
                  <p role="alert" className="flex items-center gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
                    <AlertCircle size={16} />
                    {error}
                  </p>
                )}
              </motion.form>
            )}
          </div>
        </div>
      </main>
    </MotionConfig>
  );
}
