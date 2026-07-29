import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface BackLinkProps {
  href: string;
  label: string;
  className?: string;
}

// Same treatment as the back link already on /profile — pulled out so every drill-in
// page (exam edit, question edit, new/bulk-upload forms) can get one without a recruiter
// having to fall back on the browser's own back button or the sidebar to find their way
// back to the list they came from.
export function BackLink({ href, label, className }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={`mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-recruiter-text-secondary hover:text-recruiter-text ${className ?? ''}`}
    >
      <ArrowLeft size={16} />
      {label}
    </Link>
  );
}
