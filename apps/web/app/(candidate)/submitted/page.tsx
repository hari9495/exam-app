export default function CandidateSubmittedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md rounded-lg bg-white p-6 text-center shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-candidate-primary">Exam submitted</h1>
        <p className="text-sm text-gray-600">Your exam has been submitted. Results will be reviewed by the recruiter.</p>
      </div>
    </div>
  );
}
