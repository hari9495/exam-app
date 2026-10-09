'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { useStaffLogin } from '../../../lib/hooks/useStaffLogin';
import { BRAND } from '../../../lib/brand';
import { Button, TextField, PasswordField, FormAlert, WorkfoxMark } from '../../../components/ui-v2';
import { SecondFactorForm } from '../../../components/auth/SecondFactorForm';

const LINK = { alignSelf: 'flex-start', background: 'none', border: 0, padding: 0 };

const PROOF = [
  'Proctored, timed, integrity-scored',
  'Panel-ready reports the moment a candidate submits',
  'Your whole hiring loop in one place',
];

export default function V2LoginPage() {
  const s = useStaffLogin();
  const reduce = useReducedMotion();
  const [usePassword, setUsePassword] = useState(false);
  const orgName = s.branding?.name;
  const initial = (orgName || 'W').trim().charAt(0).toUpperCase();
  // A mobile number gets a text (SMS by default, WhatsApp on request); an email gets an email.
  const isMobile = s.identifier.trim() !== '' && !s.identifier.includes('@');
  const onOtpSubmit = (e: React.FormEvent) => {
    if (s.otpSent) return void s.verifyOtp(e);
    e.preventDefault();
    void s.sendOtp(isMobile ? 'sms' : undefined);
  };

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
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0.18 : 0.4, ease: [0.2, 0.7, 0.2, 1] }}
          style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: 'var(--font-disp)', fontWeight: 600, fontSize: 17, letterSpacing: '-0.01em' }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 28, height: 28, borderRadius: 7, background: 'var(--org-primary)', color: 'var(--org-on-primary)' }}>
              <WorkfoxMark size={17} title={BRAND.productName} />
            </span>
            {BRAND.productName}
          </span>

          {s.challenge ? (
            <>
              <div>
                <h1 className="v2-title">Two-step verification</h1>
                <p style={{ fontSize: 13, color: 'var(--muted)', margin: '3px 0 0' }}>Confirm it&apos;s you to finish signing in.</p>
              </div>
              <SecondFactorForm
                factors={s.challenge.factors}
                getPasskeyOptions={s.secondFactorPasskeyOptions}
                submit={s.verifySecondFactor}
                sendCode={s.sendSecondFactorCode}
              />
              <button type="button" className="v2-link" style={{ alignSelf: 'flex-start', background: 'none', border: 0, padding: 0 }} onClick={s.cancelChallenge}>
                Start again
              </button>
            </>
          ) : (
          <>
          <div>
            <h1 className="v2-title">Sign in</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '3px 0 0' }}>
              {orgName ? `to continue to ${orgName}` : 'Welcome back. Use your work email.'}
            </p>
          </div>

          {s.error && <FormAlert>{s.error}</FormAlert>}

          <form onSubmit={s.otpMode ? onOtpSubmit : s.handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

            {s.ssoEnabled && !usePassword ? (
              <>
                {s.ssoProviders.map((p) => (
                  <Button key={p.id} type="button" loading={s.submitting} fullWidth onClick={() => void s.startSso(p.id)}>
                    {p.type === 'oidc_google' ? 'Continue with Google' : p.type === 'oidc_entra' ? 'Continue with Microsoft' : `Continue with ${p.name}`}
                  </Button>
                ))}
                {/* Break-glass administrators (and companies that keep passwords alongside SSO). */}
                <button type="button" className="v2-link" style={LINK} onClick={() => setUsePassword(true)}>
                  Sign in with a password instead
                </button>
              </>
            ) : s.otpMode ? (
              <>
                {s.otpSent ? (
                  <>
                    <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                      If an account matches, we sent a 6-digit code to it. It expires in 5 minutes.
                    </p>
                    <TextField id="otp-code" label="6-digit code" value={s.otpCode} onChange={s.setOtpCode} required autoComplete="one-time-code" />
                    <Button type="submit" loading={s.submitting} fullWidth>Sign in</Button>
                    <button type="button" className="v2-link" style={LINK} disabled={s.submitting} onClick={() => void s.sendOtp(isMobile ? 'sms' : undefined)}>
                      Send a new code
                    </button>
                  </>
                ) : (
                  <>
                    <TextField id="identifier" label="Work email or mobile number" value={s.identifier} onChange={s.setIdentifier} required autoComplete="username" />
                    <Button type="submit" loading={s.submitting} fullWidth>{isMobile ? 'Text me a code' : 'Email me a code'}</Button>
                    {isMobile && (
                      <button type="button" className="v2-link" style={LINK} disabled={s.submitting} onClick={() => void s.sendOtp('whatsapp')}>
                        Send it on WhatsApp instead
                      </button>
                    )}
                  </>
                )}
                <button type="button" className="v2-link" style={LINK} onClick={s.toggleOtpMode}>
                  Use your password instead
                </button>
              </>
            ) : (
              <>
                <TextField id="email" label="Email" type="email" value={s.email} onChange={s.setEmail} required autoComplete="email" />
                <PasswordField id="password" label="Password" value={s.password} onChange={s.setPassword} required />
                <motion.div whileTap={reduce ? undefined : { scale: 0.98 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
                  <Button type="submit" loading={s.submitting} fullWidth>Sign in</Button>
                </motion.div>
                <Link href="/forgot-password" className="v2-link">Forgot password?</Link>
                <button type="button" className="v2-link" style={LINK} onClick={s.toggleOtpMode}>
                  Sign in with a one-time code instead
                </button>
              </>
            )}
          </form>
          </>
          )}
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
