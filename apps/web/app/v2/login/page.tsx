'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useStaffLogin } from '../../../lib/hooks/useStaffLogin';
import { Button, TextField, PasswordField, FormAlert } from '../../../components/ui-v2';

export default function V2LoginPage() {
  const s = useStaffLogin();

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
        style={{
          width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 15,
          ['--org-primary' as string]: s.orgPrimary,
          ['--org-on-primary' as string]: s.orgOnPrimary,
        }}
      >
        {s.branding?.logoUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <img src={s.branding.logoUrl} alt="Organization logo" style={{ maxHeight: 40, objectFit: 'contain' }} />
            {s.branding?.name && <span style={{ fontFamily: 'var(--font-disp)', fontWeight: 500 }}>{s.branding.name}</span>}
          </div>
        )}

        <p className="v2-kicker">Prudent</p>
        <h1 className="v2-title" style={{ marginBottom: 10 }}>Let&apos;s get you signed in.</h1>

        {s.error && <FormAlert>{s.error}</FormAlert>}

        <form onSubmit={s.handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <TextField
            id="org-slug"
            label="Organization"
            value={s.organizationSlug}
            onChange={s.setOrganizationSlug}
            autoComplete="organization"
          />

          {s.ssoEnabled && s.ssoLoginHref ? (
            <motion.a
              whileTap={{ scale: 0.98 }}
              href={s.ssoLoginHref}
              onClick={s.onSsoClick}
              className="v2-sso"
            >
              Continue with SSO
            </motion.a>
          ) : (
            <>
              <TextField
                id="email"
                label="Email"
                type="email"
                value={s.email}
                onChange={s.setEmail}
                required
                autoComplete="email"
              />
              <PasswordField id="password" label="Password" value={s.password} onChange={s.setPassword} required />
              <motion.div whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
                <Button type="submit" loading={s.submitting}>Sign in →</Button>
              </motion.div>
              <Link href="/forgot-password" className="v2-link">Forgot password?</Link>
            </>
          )}
        </form>
      </motion.div>
    </main>
  );
}
