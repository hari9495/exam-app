'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useStaffLogin } from '../../../lib/hooks/useStaffLogin';
import { BRAND } from '../../../lib/brand';
import { Button, TextField, PasswordField, FormAlert, WorkfoxMark } from '../../../components/ui-v2';

const PROOF = [
  'Proctored, timed, integrity-scored',
  'Panel-ready reports the moment a candidate submits',
  'Your whole hiring loop in one place',
];

export default function V2LoginPage() {
  const s = useStaffLogin();
  const orgName = s.branding?.name;
  const initial = (orgName || 'W').trim().charAt(0).toUpperCase();

  return (
    <main
      className="v2-split"
      style={{
        minHeight: '100vh', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr',
        ['--org-primary' as string]: s.orgPrimary,
        ['--org-on-primary' as string]: s.orgOnPrimary,
      }}
    >
      <div style={{ display: 'grid', placeItems: 'center', padding: 32, background: 'var(--paper)' }}>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
          style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: 'var(--font-disp)', fontWeight: 600, fontSize: 17, letterSpacing: '-0.01em' }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 28, height: 28, borderRadius: 7, background: 'var(--org-primary)', color: 'var(--org-on-primary)' }}>
              <WorkfoxMark size={17} title={BRAND.productName} />
            </span>
            {BRAND.productName}
          </span>

          <div>
            <h1 className="v2-title">Sign in</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '3px 0 0' }}>
              {orgName ? `to continue to ${orgName}` : 'Welcome back. Use your work email.'}
            </p>
          </div>

          {s.error && <FormAlert>{s.error}</FormAlert>}

          <form onSubmit={s.handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <TextField id="org-slug" label="Organization" value={s.organizationSlug} onChange={s.setOrganizationSlug} autoComplete="organization" />

            {orgName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 8, padding: '9px 11px' }}>
                {s.branding?.logoUrl ? (
                  <img src={s.branding.logoUrl} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'contain' }} />
                ) : (
                  <span style={{ display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: 6, background: 'var(--org-primary)', color: 'var(--org-on-primary)', fontWeight: 700, fontSize: 12 }}>{initial}</span>
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{orgName}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.ssoEnabled ? 'single sign-on enabled' : 'sign in with your work email'}</div>
                </div>
              </div>
            )}

            {s.ssoEnabled && s.ssoLoginHref ? (
              <motion.a whileTap={{ scale: 0.98 }} href={s.ssoLoginHref} onClick={s.onSsoClick} className="v2-cta" style={{ textDecoration: 'none', height: 44 }}>
                Continue with SSO
              </motion.a>
            ) : (
              <>
                <TextField id="email" label="Email" type="email" value={s.email} onChange={s.setEmail} required autoComplete="email" />
                <PasswordField id="password" label="Password" value={s.password} onChange={s.setPassword} required />
                <motion.div whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
                  <Button type="submit" loading={s.submitting}>Sign in</Button>
                </motion.div>
                <Link href="/forgot-password" className="v2-link">Forgot password?</Link>
              </>
            )}
          </form>
        </motion.div>
      </div>

      <aside
        className="v2-split-aside"
        style={{
          background: 'var(--org-primary)', color: 'var(--org-on-primary)', position: 'relative',
          overflow: 'hidden', padding: 40, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: 'var(--font-disp)', fontWeight: 600, fontSize: 16, position: 'relative' }}>
          <WorkfoxMark size={20} title={BRAND.productName} /> {BRAND.productName}
        </span>
        <div style={{ position: 'relative' }}>
          <h2 style={{ fontFamily: 'var(--font-disp)', fontWeight: 600, fontSize: 26, letterSpacing: '-0.02em', margin: 0, maxWidth: '15ch', lineHeight: 1.1 }}>
            Assessments your candidates actually finish.
          </h2>
          <ul style={{ listStyle: 'none', margin: '20px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {PROOF.map((p) => (
              <li key={p} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, opacity: 0.9 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', marginTop: 7, flexShrink: 0 }} />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div aria-hidden="true" style={{ position: 'absolute', right: -40, bottom: -50, opacity: 0.12 }}>
          <WorkfoxMark size={260} />
        </div>
      </aside>
    </main>
  );
}
