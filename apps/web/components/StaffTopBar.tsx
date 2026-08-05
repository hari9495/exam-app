import { LogOut } from 'lucide-react';

/**
 * Thin bar above the page content for the recruiter/org-admin/panel shells.
 * Logout lives here (top right) rather than at the bottom of the sidebar, to
 * match the platform console's placement.
 */
export function StaffTopBar({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="flex items-center justify-end border-b border-recruiter-border bg-white px-6 py-3 print:hidden">
      <button
        type="button"
        aria-label="Log Out"
        onClick={onLogout}
        className="flex items-center gap-2 rounded-md border border-recruiter-border px-3 py-1.5 text-sm font-medium text-recruiter-text-secondary transition-colors duration-150 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
      >
        <LogOut size={15} />
        Logout
      </button>
    </div>
  );
}
