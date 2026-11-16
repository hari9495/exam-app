'use client';

import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { motion, MotionConfig } from 'framer-motion';
import { AlertCircle, MailCheck } from 'lucide-react';
import { Button, Checkbox, Input, Select, RequiredFieldsNote } from '../../../components/ui';
import { AuthPageLayout } from '../../../components/AuthPageLayout';
import { useWalkInExams, useWalkInRegister } from '../../../lib/hooks/useWalkIn';
import { composeName, EMAIL_PATTERN, PHONE_PATTERN } from '../../../lib/candidateValidation';

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  consent?: string;
  college?: string;
  roll?: string;
  branch?: string;
  year?: string;
  cgpa?: string;
}

// Live validation on blur, not just on submit -- lets a candidate fix a typo'd email
// or phone before they ever reach the button, instead of only finding out after.
function validateEmailField(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'Complete this field.';
  if (!EMAIL_PATTERN.test(trimmed)) return 'Enter a valid email address.';
  return undefined;
}

function validatePhoneField(value: string): string | undefined {
  // Optional -- an empty phone is valid, only a wrong-length one (already
  // impossible to type non-digits into, see the Phone input's onChange) is not.
  if (!value) return undefined;
  if (!PHONE_PATTERN.test(value)) return 'Enter a valid 10-digit phone number.';
  return undefined;
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
  // Task 2 (Zoho #21) changed this endpoint's shape from a bare array to
  // { exams, applyConsentText, applyConsentVersion } -- unwrap both here.
  const { data: walkInData, isLoading, isError } = useWalkInExams(orgSlug, groupParam);
  const exams = walkInData?.exams;
  const applyConsentText = walkInData?.applyConsentText;
  const register = useWalkInRegister(orgSlug);

  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [examId, setExamId] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  // A QR-scanned registration often happens on a phone, which can't run the exam UI
  // (Monaco editor, webcam proctoring) -- so the link always goes by email instead of
  // auto-starting on whatever device just submitted this form.
  const [submitted, setSubmitted] = useState(false);
  // AS-3 (PRC-29): a campus drive's own fields (college from the company's list, roll number, branch, year, CGPA).
  const campus = walkInData?.campus ?? null;
  const collegeParam = searchParams.get('college');
  const [institutionId, setInstitutionId] = useState('');
  const presetCollege = campus?.institutions.find((i) => i.code.toLowerCase() === collegeParam?.toLowerCase())?.id ?? '';
  const chosenCollege = institutionId || presetCollege;
  const [rollNumber, setRollNumber] = useState('');
  const [branch, setBranch] = useState('');
  const [gradYear, setGradYear] = useState('');
  const [cgpa, setCgpa] = useState('');
  const [notEligible, setNotEligible] = useState<{ reason: string | null } | null>(null);
  const asks = (f: 'phone' | 'branch' | 'graduationYear' | 'cgpa') => (campus ? campus.fields[f] !== 'off' : f === 'phone');
  const needs = (f: 'phone' | 'branch' | 'graduationYear' | 'cgpa') => Boolean(campus && campus.fields[f] === 'required');

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
    const nextErrors: FormErrors = {
      firstName: firstName.trim() ? undefined : 'Complete this field.',
      lastName: lastName.trim() ? undefined : 'Complete this field.',
      email: validateEmailField(email),
      phone: needs('phone') && !phone ? 'Complete this field.' : validatePhoneField(phone),
      consent: applyConsentText && !consentAccepted ? 'You must accept to continue.' : undefined,
      ...(campus
        ? {
            college: chosenCollege ? undefined : 'Choose your college.',
            roll: rollNumber.trim() ? undefined : 'Complete this field.',
            branch: needs('branch') && !branch.trim() ? 'Complete this field.' : undefined,
            year: needs('graduationYear') && !gradYear ? 'Complete this field.' : gradYear && !/^20\d\d$/.test(gradYear) ? 'Enter a year like 2027.' : undefined,
            cgpa: needs('cgpa') && !cgpa ? 'Complete this field.' : cgpa && !(Number(cgpa) >= 0 && Number(cgpa) <= 100) ? 'Enter a number from 0 to 100.' : undefined,
          }
        : {}),
    };
    if (Object.values(nextErrors).some(Boolean)) {
      setFieldErrors(nextErrors);
      return;
    }
    register.mutate(
      {
        name: composeName(firstName, middleName, lastName),
        email: email.trim(),
        phone: phone.trim() || undefined,
        examId: resolvedExamId,
        ...(applyConsentText ? { consentAccepted } : {}),
        ...(campus
          ? {
              campus: {
                institutionId: chosenCollege,
                rollNumber: rollNumber.trim(),
                ...(branch.trim() ? { branch: branch.trim() } : {}),
                ...(gradYear ? { graduationYear: Number(gradYear) } : {}),
                ...(cgpa ? { cgpa: Number(cgpa) } : {}),
              },
            }
          : {}),
      },
      {
        onSuccess: (res) => (res.token === null && res.eligible === false ? setNotEligible({ reason: res.reason ?? null }) : setSubmitted(true)),
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
        {notEligible ? (
          <div role="status" className="flex flex-col items-center gap-3 rounded-md bg-status-warning-bg px-4 py-6 text-center">
            <AlertCircle size={28} className="text-status-warning" />
            <p className="text-sm text-muted">
              Thank you for registering. You are not eligible for this drive{notEligible.reason ? `: ${notEligible.reason}.` : '.'} No test link is sent.
            </p>
          </div>
        ) : submitted ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex flex-col items-center gap-3 rounded-md bg-status-success-bg px-4 py-6 text-center"
          >
            <MailCheck size={28} className="text-status-success" />
            <p className="text-sm text-muted">
              Check your email — we&apos;ve sent your exam link to <strong>{email}</strong>. Open it on the device
              you&apos;ll use to take the exam.
            </p>
          </motion.div>
        ) : (
          <>
            {isLoading && <p className="text-sm text-muted">Loading&hellip;</p>}

            {isError && (
              <p role="alert" className="text-sm text-status-danger">
                This registration page isn&apos;t available right now.
              </p>
            )}

            {!isLoading && !isError && exams && !preselectedExamId && listedExams.length === 0 && (
              <p className="text-sm text-muted">
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
                  onBlur={() => setFieldErrors((current) => ({ ...current, email: validateEmailField(email) }))}
                  error={fieldErrors.email}
                  required
                />
                {asks('phone') && (
                <Input
                  label="Phone"
                  required={needs('phone')}
                  value={phone}
                  // Digits only, as typed -- a letter never lands in the field at all,
                  // rather than being caught after the fact by the pattern check below.
                  onChange={(value) => {
                    const digitsOnly = value.replace(/\D/g, '').slice(0, 10);
                    setPhone(digitsOnly);
                    if (fieldErrors.phone) setFieldErrors((current) => ({ ...current, phone: undefined }));
                  }}
                  onBlur={() => setFieldErrors((current) => ({ ...current, phone: validatePhoneField(phone) }))}
                  error={fieldErrors.phone}
                  inputMode="numeric"
                  maxLength={10}
                />
                )}
                {campus && (
                  <>
                    <Select
                      label="College"
                      value={chosenCollege}
                      onChange={(value) => {
                        setInstitutionId(value);
                        if (fieldErrors.college) setFieldErrors((current) => ({ ...current, college: undefined }));
                      }}
                      options={campus.institutions.map((i) => ({ value: i.id, label: i.name }))}
                      required
                    />
                    {fieldErrors.college && <p className="text-xs text-status-danger">{fieldErrors.college}</p>}
                    <Input label="Roll Number" value={rollNumber} onChange={setRollNumber} error={fieldErrors.roll} maxLength={40} required />
                    {asks('branch') && <Input label="Degree And Branch" value={branch} onChange={setBranch} error={fieldErrors.branch} maxLength={120} required={needs('branch')} />}
                    <div className="grid grid-cols-2 gap-2">
                      {asks('graduationYear') && <Input label="Graduation Year" value={gradYear} onChange={(v) => setGradYear(v.replace(/\D/g, '').slice(0, 4))} error={fieldErrors.year} inputMode="numeric" maxLength={4} required={needs('graduationYear')} />}
                      {asks('cgpa') && <Input label="CGPA / %" value={cgpa} onChange={(v) => setCgpa(v.replace(/[^\d.]/g, '').slice(0, 6))} error={fieldErrors.cgpa} inputMode="decimal" maxLength={6} required={needs('cgpa')} />}
                    </div>
                  </>
                )}
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
                {applyConsentText && (
                  <div className="flex flex-col gap-2 rounded-md border border-rule p-3">
                    <p className="whitespace-pre-wrap text-xs text-muted">{applyConsentText}</p>
                    <Checkbox
                      label="I have read and agree to the above."
                      checked={consentAccepted}
                      onChange={(checked) => {
                        setConsentAccepted(checked);
                        if (fieldErrors.consent) setFieldErrors((current) => ({ ...current, consent: undefined }));
                      }}
                    />
                    {fieldErrors.consent && <p className="text-xs text-status-danger">{fieldErrors.consent}</p>}
                  </div>
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
