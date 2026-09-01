'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useStaffLogin } from '../../../lib/hooks/useStaffLogin';
import { BRAND } from '../../../lib/brand';
import { Button, TextField, PasswordField, FormAlert, Card, WorkfoxMark } from '../../../components/ui-v2';

export default function V2LoginPage() {
  const s = useStaffLogin();
  const orgName = s.branding?.name;

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
        style={{
          width: '100%', maxWidth: 380,
          ['--org-primary' as string]: s.orgPrimary,
          ['--org-on-primary' as string]: s.orgOnPrimary,
        }}
      >
        <Card style={{ padding: '28px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
            {s.branding?.logoUrl ? (
              <img src={s.branding.logoUrl} alt="Organization logo" style={{ maxHeight: 40, objectFit: 'contain' }} />
            ) : (
              <span style={{ display: 'inline-grid', placeItems: 'center', width: 40, height: 40, borderRadius: 10, background: 'var(--org-primary)', color: 'var(--org-on-primary)' }}>
                <WorkfoxMark size={22} title={`${BRAND.productName}`} />
              </span>
            )}
            <div>
              <h1 className="v2-title">Sign in</h1>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 0' }}>
                to continue to {orgName || BRAND.productName}
              </p>
            </div>
          </div>

          {s.error && <FormAlert>{s.error}</FormAlert>}

          <form onSubmit={s.handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                  <Button type="submit" loading={s.submitting}>Sign in</Button>
                </motion.div>
                <Link href="/forgot-password" className="v2-link" style={{ textAlign: 'center' }}>Forgot password?</Link>
              </>
            )}
          </form>
        </Card>

        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--muted)', marginTop: 16 }}>
          {BRAND.productName} — a {BRAND.companyName} product
        </p>
      </motion.div>
    </main>
  );
}
