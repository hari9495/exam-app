'use client';

import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { motion, MotionConfig } from 'framer-motion';
import { AlertCircle, MailCheck } from 'lucide-react';
import { Button, Input, Select, RequiredFieldsNote } from '../../../components/ui';
import { AuthPageLayout } from '../../../components/AuthPageLayout';
import { useWalkInExams, useWalkInRegister } from '../../../lib/hooks/useWalkIn';
import { composeName, EMAIL_PATTERN, PHONE_PATTERN } from '../../../lib/candidateValidation';

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

const HIGHLIGHTS = [
  'No account to create — we email you a link to your exam',
  'Take it on a laptop or desktop: the exam needs a full browser and a webcam',
  'Register now, start when you are ready',
];

export default function WalkInPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const searchParams = useSearchParams();
  const groupParam = searchParams.get('group');
  const { data: exams, isLoading, isError } = useWalkInExams(orgSlug, groupParam);
  const register = useWalkInRegister(orgSlug);

  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [examId, setExamId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
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
  // solely via its own link/QR (see WalkInShareCard), never via this generic org URL. A
  // ?group= link already asked the server to scope to exactly that group's members, which
  // is itself the recruiter's explicit curation -- skip the walkInListed filter entirely
  // there, so every exam they put in the group actually shows.
  const listedExams = useMemo(() => (groupParam ? (exams ?? []) : (exams ?? []).filter((exam) => exam.walkInListed)), [exams, groupParam]);
  const resolvedExamId = preselectedExamId ?? (listedExams.length === 1 ? listedExams[0].id : examId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const nextErrors: FormErrors = {};
    if (!firstName.trim()) nextErrors.firstName = 'Complete this field.';
    if (!lastName.trim()) nextErrors.lastName = 'Complete this field.';
    if (!email.trim()) {
      nextErrors.email = 'Complete this field.';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (phone.trim() && !PHONE_PATTERN.test(phone.trim())) {
      nextErrors.phone = 'Enter a valid 10-digit phone number.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    register.mutate(
      { name: composeName(firstName, middleName, lastName), email: email.trim(), phone: phone.trim() || undefined, examId: resolvedExamId },
      {
        onSuccess: () => setSubmitted(true),
        onError: (err) => setError(err instanceof Error ? err.message : 'Registration failed.'),
      },
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <AuthPageLayout
        title="Walk-In Registration"
        panelHeading="Register On The Spot."
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
                // noValidate: styled inline errors (below) replace native browser
                // tooltips, matching CandidateInviteForm/CandidateEditModal -- native
                // type="email" validation is also looser than EMAIL_PATTERN (it would
                // accept "a@b", which isn't a real-looking address).
                noValidate
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
                {/* One row, not stacked: three more fields than the old single Name
                    field pushed the whole card past the fold (this page is mostly
                    opened from a QR scan on a phone, where every extra scroll costs
                    completions) -- First/Middle/Last sharing a row keeps the card the
                    same height it was before the split. */}
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    label="First Name"
                    value={firstName}
                    onChange={(value) => {
                      setFirstName(value);
                      if (fieldErrors.firstName) setFieldErrors((current) => ({ ...current, firstName: undefined }));
                    }}
                    error={fieldErrors.firstName}
                    required
                  />
                  <Input label="Middle Name" value={middleName} onChange={setMiddleName} />
                  <Input
                    label="Last Name"
                    value={lastName}
                    onChange={(value) => {
                      setLastName(value);
                      if (fieldErrors.lastName) setFieldErrors((current) => ({ ...current, lastName: undefined }));
                    }}
                    error={fieldErrors.lastName}
                    required
                  />
                </div>
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(value) => {
                    setEmail(value);
                    if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
                  }}
                  error={fieldErrors.email}
                  required
                />
                <Input
                  label="Phone"
                  value={phone}
                  onChange={(value) => {
                    setPhone(value);
                    if (fieldErrors.phone) setFieldErrors((current) => ({ ...current, phone: undefined }));
                  }}
                  error={fieldErrors.phone}
                />
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
