'use client';

import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { motion, MotionConfig } from 'framer-motion';
import { AlertCircle, MailCheck } from 'lucide-react';
import { Button, Input, Select, RequiredFieldsNote } from '../../../components/ui';
import { AuthPageLayout } from '../../../components/AuthPageLayout';
import { useWalkInExams, useWalkInRegister } from '../../../lib/hooks/useWalkIn';

const HIGHLIGHTS = [
  'No account to create — we email you a link to your exam',
  'Take it on a laptop or desktop: the exam needs a full browser and a webcam',
  'Register now, start when you are ready',
];

export default function WalkInPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const searchParams = useSearchParams();
  const { data: exams, isLoading, isError } = useWalkInExams(orgSlug);
  const register = useWalkInRegister(orgSlug);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [examId, setExamId] = useState('');
  const [error, setError] = useState<string | null>(null);
  // A QR-scanned registration often happens on a phone, which can't run the exam UI
  // (Monaco editor, webcam proctoring) -- so the link always goes by email instead of
  // auto-starting on whatever device just submitted this form.
  const [submitted, setSubmitted] = useState(false);

  // A recruiter's shared link/QR code carries ?exam=<id> so it jumps straight to the right
  // exam instead of making the candidate pick from every walk-in-enabled exam -- this check
  // (and resolvedExamId below) intentionally uses the FULL exams list, not listedExams, so a
  // walkInListed=false exam's own dedicated link still works even though it's hidden from
  // the shared picker.
  const examParam = searchParams.get('exam');
  const preselectedExamId = exams?.some((exam) => exam.id === examParam) ? examParam : null;
  // Only exams opted into the shared picker -- an exam with walkInListed=false is reachable
  // solely via its own link/QR (see WalkInShareCard), never via this generic org URL.
  const listedExams = useMemo(() => (exams ?? []).filter((exam) => exam.walkInListed), [exams]);
  const resolvedExamId = preselectedExamId ?? (listedExams.length === 1 ? listedExams[0].id : examId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    register.mutate(
      { name, email, phone: phone || undefined, examId: resolvedExamId },
      {
        onSuccess: () => setSubmitted(true),
        onError: (err) => setError(err instanceof Error ? err.message : 'Registration failed.'),
      },
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <AuthPageLayout
        title="Walk-in registration"
        panelHeading="Register on the spot."
        panelCopy="Fill in your details and we'll send your exam link straight to your inbox."
        panelHighlights={HIGHLIGHTS}
      >
        {submitted ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex flex-col items-center gap-3 rounded-md bg-status-success-bg px-4 py-6 text-center"
          >
            <MailCheck size={28} className="text-status-success" />
            <p className="text-sm text-recruiter-text-secondary">
              Check your email — we&apos;ve sent your exam link to <strong>{email}</strong>. Open it on the device
              you&apos;ll use to take the exam.
            </p>
          </motion.div>
        ) : (
          <>
            {isLoading && <p className="text-sm text-recruiter-text-tertiary">Loading&hellip;</p>}

            {isError && (
              <p role="alert" className="text-sm text-status-danger">
                This registration page isn&apos;t available right now.
              </p>
            )}

            {!isLoading && !isError && exams && !preselectedExamId && listedExams.length === 0 && (
              <p className="text-sm text-recruiter-text-secondary">
                No exams are currently open for walk-in registration.
              </p>
            )}

            {!isLoading && !isError && exams && (preselectedExamId || listedExams.length > 0) && (
              <motion.form
                onSubmit={handleSubmit}
                className="flex flex-col gap-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                {error && (
                  <p
                    role="alert"
                    className="flex items-center gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger"
                  >
                    <AlertCircle size={16} className="shrink-0" />
                    {error}
                  </p>
                )}
                <RequiredFieldsNote />
                <Input label="Name" value={name} onChange={setName} required />
                <Input label="Email" type="email" value={email} onChange={setEmail} required />
                <Input label="Phone" value={phone} onChange={setPhone} />
                {listedExams.length > 1 && !preselectedExamId && (
                  <Select
                    label="Exam"
                    value={examId}
                    onChange={setExamId}
                    options={listedExams.map((exam) => ({
                      value: exam.id,
                      label: exam.title,
                    }))}
                    required
                  />
                )}
                <Button type="submit" loading={register.isPending} disabled={!resolvedExamId} className="w-full">
                  Email me my exam link
                </Button>
              </motion.form>
            )}
          </>
        )}
      </AuthPageLayout>
    </MotionConfig>
  );
}
