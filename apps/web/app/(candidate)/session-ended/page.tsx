export default function CandidateSessionEndedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md rounded-lg bg-white p-6 text-center shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-gray-900">Your session has ended</h1>
        <p className="text-sm text-gray-600">
          This can happen if the exam was opened in another browser or tab, or if your session expired. If the exam is
          still open, use your invitation link again to continue.
        </p>
      </div>
    </div>
  );
}
