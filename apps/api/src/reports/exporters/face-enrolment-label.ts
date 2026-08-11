// The Results tab renders these exact words (apps/web/components/ExamResultsPanel.tsx's
// FACE_ENROLMENT_LABEL). A downloaded export that says something else -- or nothing at all --
// disagrees with the screen the recruiter was just looking at, so all three exporters share
// this one mapping. An unknown status passes through rather than being hidden.
const FACE_ENROLMENT_LABEL: Record<string, string> = {
  enrolled: 'Verified',
  not_verified: 'Not verified',
};

export function formatFaceEnrolment(status: string | null | undefined, fallback = ''): string {
  if (!status) return fallback;
  return FACE_ENROLMENT_LABEL[status] ?? status;
}
