'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, MotionConfig } from 'framer-motion';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api-client';
import { useAuth, SSO_PENDING_SLUG_KEY } from '../../lib/auth-context';
import { decodeJwtPayload } from '../../lib/jwt';
import { Button, Input } from '../../components/ui';
import { PrudentMark } from '../../components/PrudentMark';
import { useBranding } from '../../lib/hooks/useBranding';
import { useDocumentBranding } from '../../lib/hooks/useDocumentBranding';
import '../../components/invigilator.css';

const HIGHLIGHTS = [
  'AI-drafted question banks your team reviews before they go out',
  'Proctored, timed exams with integrity signals on every attempt',
  'Panel-ready reports the moment a candidate submits',
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  // Debounce the slug so branding + SSO detection fire while the user types,
  // without hitting the API on every keystroke -- no blur/Tab needed.
  const [debouncedSlug, setDebouncedSlug] = useState('');
  const { data: branding } = useBranding(debouncedSlug || null);
  useDocumentBranding(branding?.name, branding?.logoUrl);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSlug(organizationSlug.trim()), 350);
    return () => clearTimeout(handle);
  }, [organizationSlug]);

  // Auto-detect SSO for the typed org. Guarded against out-of-order responses so
  // a slow earlier request can't overwrite the answer for the current slug.
  useEffect(() => {
    if (!debouncedSlug) {
      setSsoEnabled(false);
      return;
    }
    let active = true;
    apiFetch(`/auth/saml/${debouncedSlug}/status`)
      .then((result) => {
        if (active) setSsoEnabled(Boolean(result.enabled));
      })
      .catch(() => {
        if (active) setSsoEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({
          organizationSlug: organizationSlug || undefined,
          email,
          password,
        }),
      });
      login(organizationSlug, result.accessToken);
      const payload = decodeJwtPayload(result.accessToken);
      router.push(
        payload?.role === 'super_admin'
          ? '/organizations'
          : payload?.role === 'org_admin'
            ? '/users'
            : payload?.role === 'panel'
              ? '/reports'
              : '/dashboard',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setSubmitting(false);
    }
  }

  // Colour is rationed to the org's own primary: the one chroma the page spends, on the primary
  // action. Everything else stays greyscale slate. onPrimary defaults to white, matching the
  // product's --color-primary-text default.
  const orgPrimary = (branding as { primaryColor?: string } | undefined)?.primaryColor || '#0053e2';
  const orgOnPrimary = (branding as { textColor?: string } | undefined)?.textColor || '#ffffff';

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="inv flex min-h-screen flex-col"
        style={{ ['--org-primary' as string]: orgPrimary, ['--org-on-primary' as string]: orgOnPrimary }}
      >
        <header className="inv-header flex items-center px-6 py-4 md:px-16">
          <Link href="/" className="flex items-center gap-2.5" style={{ color: 'var(--ink)' }}>
            <PrudentMark className="h-7 aspect-[100/148]" />
            <span className="inv-wordmark text-lg">Prudent Hire</span>
          </Link>
        </header>

        <main className="grid flex-1 md:grid-cols-2">
          <div className="flex flex-col items-center justify-center px-6 py-12">
            <div className="w-full max-w-sm">
              {branding?.logoUrl && (
                <div className="mb-8 flex items-center justify-center gap-0">
                  <img src={branding.logoUrl} alt="Organization logo" className="max-h-16 object-contain" />
                  {branding?.name && <p className="inv-wordmark -ml-4 text-xl">{branding.name}</p>}
                </div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
                className="inv-card p-7"
              >
                <div className="inv-eyebrow mb-1.5">Staff access</div>
                <h1 className="inv-title mb-6">Sign in to your console</h1>

                {error && (
                  <p role="alert" className="inv-alert mb-4 flex items-center gap-2 px-3 py-2 text-sm">
                    <AlertCircle size={16} className="shrink-0" />
                    {error}
                  </p>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <Input label="Organization Slug" value={organizationSlug} onChange={setOrganizationSlug} />
                  {ssoEnabled ? (
                    // SSO-enabled orgs are SSO-only: no password fallback is offered.
                    <motion.a
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      href={`${process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1'}/auth/saml/${organizationSlug}/login`}
                      onClick={() => window.sessionStorage.setItem(SSO_PENDING_SLUG_KEY, organizationSlug)}
                      className="inv-cta flex items-center justify-center px-4 py-3 text-sm transition-opacity"
                    >
                      Log in with SSO
                    </motion.a>
                  ) : (
                    <>
                      <Input label="Email" type="email" value={email} onChange={setEmail} required />
                      <div className="relative">
                        <Input
                          label="Password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={setPassword}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'Hide characters' : 'Show characters'}
                          className="absolute bottom-2.5 right-3"
                          style={{ color: 'var(--muted)' }}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {/* A press micro-interaction: the button dips slightly when tapped, on a
                          tight spring so it reads as a considered control rather than a toy. The
                          shared Button keeps its own loading spinner for the submit-in-flight
                          state; this only adds the tactile press. MotionConfig reducedMotion
                          disables the transform for users who ask for reduced motion. */}
                      <motion.div
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="w-full"
                      >
                        <Button type="submit" loading={submitting} className="w-full py-3">
                          Log in
                        </Button>
                      </motion.div>
                      <Link href="/forgot-password" className="inv-link text-sm">
                        Forgot password?
                      </Link>
                    </>
                  )}
                </form>
              </motion.div>

              <p className="inv-eyebrow mt-6 text-center" style={{ letterSpacing: '0.06em' }}>
                &copy; 2026 Prudent Consulting
              </p>
            </div>
          </div>

          <aside className="inv-aside hidden flex-col justify-center gap-7 px-16 py-12 md:flex">
            {/* Decorative corner watermark: the org's own logo as a tone-on-tone silhouette when
                the org opted in and has a logo, else Prudent's mark. Sits behind the copy
                (isolate + z-index in CSS), cropped by the panel's overflow. */}
            {branding?.loginWatermarkEnabled && branding.logoUrl ? (
              <div
                className="inv-watermark"
                aria-hidden="true"
                style={{ ['--wm' as string]: `url("${branding.logoUrl}")` }}
              />
            ) : (
              <PrudentMark className="inv-watermark-mark" />
            )}
            <div>
              <div className="inv-eyebrow mb-3">Assessment platform</div>
              <h2 className="inv-headline max-w-md">Automate early screens.</h2>
            </div>
            <p className="inv-sub max-w-md">
              Focus human judgment on what matters. Prudent Hire runs the first round end to end, so your panel only meets the
              candidates worth meeting.
            </p>
            <ul className="flex max-w-md flex-col gap-3.5">
              {HIGHLIGHTS.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="inv-marker" aria-hidden="true" />
                  <span className="inv-proof">{item}</span>
                </li>
              ))}
            </ul>
            <div className="inv-record mt-2">REC &middot; proctored &middot; integrity-scored &middot; panel-ready</div>
          </aside>
        </main>
      </div>
    </MotionConfig>
  );
}
