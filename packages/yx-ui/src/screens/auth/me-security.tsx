import { useState, type FormEvent } from 'react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Heading, Text } from '../../components/foundations';
import { PasswordField, TextField } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { MethodCards } from '../../components/choice';
import { Card, PageHeader } from '../../components/shell';
import { formatPhone } from '../../lib/format';
import { RecoveryCodes, day, deviceLabel, methodLabel, setupMethodOptions, useStep, when, type SetupMethod, ipLabel } from './kit';
import { TotpConfirm, type TotpSetup } from './mfa';
import { LoginEventsTable } from './tables';
import type { LoginEventRow, MfaFactor, MfaStatus, Page, SessionRow } from './types';

export type HistoryFilter = 'all' | 'success' | 'failed';

export interface MeSecurityScreenProps {
  state: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  mfa: MfaStatus | null;
  sessions: SessionRow[] | null;
  history: Page<LoginEventRow> | null;
  historyState: 'ready' | 'loading' | 'error';
  historyFilter: HistoryFilter;
  onHistoryFilter: (f: HistoryFilter) => void;
  onHistoryPage: (page: number) => void;
  onAddPasskey: () => Promise<{ recoveryCodes?: string[] }>;
  onStartTotp: () => Promise<TotpSetup>;
  onConfirmTotp: (code: string) => Promise<{ recoveryCodes?: string[] }>;
  onRemoveFactor: (factor: MfaFactor) => Promise<void>;
  /** Renames a passkey (a step-up action). */
  onRenamePasskey: (factor: MfaFactor, label: string) => Promise<void>;
  onNewRecoveryCodes: () => Promise<string[]>;
  onSendMobileCode: (mobileNumber: string) => Promise<string>;
  onVerifyMobile: (code: string) => Promise<void>;
  onRemoveMobile: () => Promise<void>;
  /** Changes the password; other devices are signed out, this one stays. Omit to hide the card (no password to change). */
  onChangePassword?: (currentPassword: string, newPassword: string) => Promise<void>;
  /** The company's minimum length (YukthiX floor 12). */
  passwordMinLength?: number;
  onSignOutSession: (session: SessionRow) => Promise<void>;
  onSignOutOthers: () => Promise<void>;
  /** Fixed "today" for stories and tests. */
  now?: Date;
}

/** Me › Security (P12 §7): sign-in methods (passkeys by name, authenticator app), recovery codes, mobile number, where you're signed in, sign-in history. */
export function MeSecurityScreen(props: MeSecurityScreenProps) {
  const { state, mfa, sessions } = props;
  return (
    <div className="yx-auth__page">
      <PageHeader title="My security" description="How you sign in, where you're signed in, and your recent sign-ins." />
      {state === 'loading' && (
        <div className="yx-auth__stack" aria-busy="true">
          <Skeleton height={160} />
          <Skeleton height={120} />
        </div>
      )}
      {state === 'error' && <ErrorState title="We couldn't load your security settings." description="Nothing has changed. Try again in a moment." onRetry={props.onRetry} />}
      {state === 'ready' && mfa && (
        <>
          <TwoStepCard {...props} mfa={mfa} />
          {props.onChangePassword && <PasswordCard onChangePassword={props.onChangePassword} minLength={props.passwordMinLength ?? 12} />}
          <MobileCard {...props} mfa={mfa} />
          <SessionsCard sessions={sessions ?? []} onSignOutSession={props.onSignOutSession} onSignOutOthers={props.onSignOutOthers} />
          <Card title="Sign-in history" actions={
            <Segment
              label="Show"
              options={[{ value: 'all', label: 'All' }, { value: 'success', label: 'Successful' }, { value: 'failed', label: 'Failed' }]}
              value={props.historyFilter}
              onChange={props.onHistoryFilter}
            />
          }>
            <LoginEventsTable
              label="Your sign-in history"
              page={props.history}
              state={props.historyState}
              onPageChange={props.onHistoryPage}
              filtered={props.historyFilter !== 'all'}
              onClearFilters={() => props.onHistoryFilter('all')}
            />
          </Card>
        </>
      )}
    </div>
  );
}

function TwoStepCard({ mfa, onAddPasskey, onStartTotp, onConfirmTotp, onRemoveFactor, onRenamePasskey, onNewRecoveryCodes, now = new Date() }: MeSecurityScreenProps & { mfa: MfaStatus }) {
  const [totp, setTotp] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [removing, setRemoving] = useState<MfaFactor | null>(null);
  const [renaming, setRenaming] = useState<MfaFactor | null>(null);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState<SetupMethod | null>(null);
  const { busy, error, run } = useStep();
  const show = (r: { recoveryCodes?: string[] }) => r.recoveryCodes?.length && setCodes(r.recoveryCodes);
  const confirmTotp = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      show(await onConfirmTotp(code.trim()));
      setTotp(null);
      setCode('');
    });
  };
  const add = (method: SetupMethod) => {
    setAdding(method);
    void run(async () => (method === 'passkey' ? show(await onAddPasskey()) : setTotp(await onStartTotp()))).finally(() => setAdding(null));
  };
  const hasTotp = mfa.factors.some((f) => f.type === 'totp');
  const addable = setupMethodOptions(mfa.allowedFactors.filter((f) => f !== 'totp' || !hasTotp));
  const overdue = new Date(mfa.enrolmentDueAt) <= now;
  const lastOne = mfa.required && mfa.factors.length === 1;
  const nameOf = (f: MfaFactor) => (f.type === 'passkey' ? `Passkey · ${f.label}` : 'Authenticator app');

  return (
    <Card title="Sign-in methods">
      <div className="yx-auth__stack">
        {mfa.required && mfa.factors.length === 0 && (
          <InlineAlert tone={overdue ? 'danger' : 'warning'} title={overdue ? 'Sensitive actions are paused' : `Set this up by ${day(mfa.enrolmentDueAt)}`}>
            Your role needs a passkey or an authenticator app. A passkey is the quickest.
          </InlineAlert>
        )}
        {mfa.factors.length > 0 ? (
          <ul className="yx-auth__list" aria-label="Your sign-in methods">
            {mfa.factors.map((f) => (
              <li key={f.id} className="yx-auth__item">
                <div className="yx-auth__item-main">
                  <Text weight="medium">{nameOf(f)}</Text>
                  <Text tone="secondary" size="sm">Added {day(f.createdAt)}{f.lastUsedAt ? ` · last used ${day(f.lastUsedAt)}` : ' · not used yet'}</Text>
                </div>
                <span className="yx-auth__row">
                  {f.type === 'passkey' && (
                    <Button size="sm" aria-label={`Rename ${f.label}`} onClick={() => { setName(f.label); setRenaming(f); }}>Rename</Button>
                  )}
                  <Button size="sm" disabled={lastOne} title={lastOne ? 'Your role needs at least one' : undefined} onClick={() => setRemoving(f)} aria-label={`Remove ${nameOf(f)}`}>
                    Remove
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          !mfa.required && <EmptyState compact title="No passkey or authenticator app yet." description="Add a passkey: you sign in with your face, fingerprint or PIN, and it can't be phished." />
        )}
        {lastOne && <Text as="p" tone="secondary" size="sm">You can't remove your only sign-in method, because your role needs one. Add another first.</Text>}

        {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}
        {totp && <TotpConfirm setup={totp} code={code} onCode={setCode} onSubmit={confirmTotp} busy={busy} error={error} onCancel={() => setTotp(null)} />}

        {!totp && !codes && addable.length > 0 && (
          <section className="yx-auth__stack" aria-labelledby="yx-add-method">
            <Heading level={4} as="h3" id="yx-add-method">Add a sign-in method</Heading>
            <MethodCards aria-label="Sign-in methods you can add" options={addable} onSelect={(m) => add(m as SetupMethod)} busy={adding} />
          </section>
        )}
        {!totp && error && <InlineAlert tone="danger">{error}</InlineAlert>}
        {!totp && !codes && mfa.factors.length > 0 && (
          <section className="yx-auth__stack" aria-labelledby="yx-recovery">
            <Heading level={4} as="h3" id="yx-recovery">Recovery codes</Heading>
            <Text as="p" tone="secondary" size="sm">
              {mfa.recoveryCodesRemaining} of 10 left. Use one if you lose your passkey or phone. Making new codes stops the old ones.
            </Text>
            <div className="yx-auth__row">
              <Button disabled={busy} onClick={() => void run(async () => setCodes(await onNewRecoveryCodes()))}>
                Make new codes
              </Button>
            </div>
          </section>
        )}
      </div>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing ? nameOf(removing) : ''}?`}
        consequence="You won't be able to use it to sign in. We'll email you about this change."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (removing) await onRemoveFactor(removing);
        }}
      />
      <ConfirmDialog
        open={renaming !== null}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Rename passkey"
        consequence="A name that tells you which device it is on."
        confirmLabel="Save name"
        confirmDisabled={!name.trim() || name.trim() === renaming?.label}
        onConfirm={async () => {
          if (renaming) await onRenamePasskey(renaming, name.trim());
        }}
      >
        <FormField label="Name" required>
          <TextField value={name} onChange={setName} maxLength={64} />
        </FormField>
      </ConfirmDialog>
    </Card>
  );
}

function PasswordCard({ onChangePassword, minLength }: { onChangePassword: (current: string, next: string) => Promise<void>; minLength: number }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, setError, run } = useStep();
  const reset = () => {
    setOpen(false);
    setCurrent('');
    setNext('');
    setAgain('');
    setError(null);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (next.length < minLength) return setError(`Use at least ${minLength} characters.`);
    if (next !== again) return setError('The two new passwords are not the same.');
    if (next === current) return setError('Choose a password you have not used here before.');
    void run(async () => {
      await onChangePassword(current, next);
      reset();
      setDone(true);
    });
  };
  return (
    <Card title="Password">
      {!open ? (
        <div className="yx-auth__item">
          <div className="yx-auth__item-main">
            <Text tone="secondary" size="sm">
              {done ? 'Password changed. Other devices were signed out, and we emailed you about it.' : 'Change it any time. Other devices are signed out; you stay signed in here.'}
            </Text>
          </div>
          <Button size="sm" onClick={() => { setDone(false); setOpen(true); }}>Change password</Button>
        </div>
      ) : (
        <form className="yx-auth__form" onSubmit={submit} noValidate>
          <FormField label="Current password" required>
            <PasswordField value={current} onChange={setCurrent} autoComplete="current-password" maxLength={1024} />
          </FormField>
          <FormField label="New password" required helper={`At least ${minLength} characters. Passwords found in known breaches are refused.`}>
            <PasswordField value={next} onChange={setNext} autoComplete="new-password" maxLength={128} />
          </FormField>
          <FormField label="New password again" required>
            <PasswordField value={again} onChange={setAgain} autoComplete="new-password" maxLength={128} />
          </FormField>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <div className="yx-auth__row">
            <Button type="submit" variant="primary" loading={busy} disabled={!current || !next || !again}>Change password</Button>
            <Button onClick={reset}>Cancel</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function MobileCard({ mfa, onSendMobileCode, onVerifyMobile, onRemoveMobile }: MeSecurityScreenProps & { mfa: MfaStatus }) {
  const [number, setNumber] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const { busy, error, run } = useStep();
  const send = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => setSentTo(await onSendMobileCode(number.trim())));
  };
  const verify = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await onVerifyMobile(code.trim());
      setSentTo(null);
      setNumber('');
      setCode('');
    });
  };
  return (
    <Card title="Mobile number">
      {mfa.mobileNumber ? (
        <div className="yx-auth__item">
          <div className="yx-auth__item-main">
            <Text weight="medium">{formatPhone(mfa.mobileNumber)}</Text>
            <Text tone="secondary" size="sm">Verified. Used for sign-in codes where your company allows them.</Text>
          </div>
          <ConfirmDialog
            trigger={<Button size="sm" aria-label="Remove mobile number">Remove</Button>}
            title="Remove your mobile number?"
            consequence="You won't get sign-in codes by text any more."
            confirmLabel="Remove number"
            destructive
            onConfirm={onRemoveMobile}
          />
        </div>
      ) : sentTo ? (
        <form className="yx-auth__form" onSubmit={verify} noValidate>
          <Text as="p" tone="secondary" role="status">We texted a 6-digit code to {formatPhone(sentTo)}. It expires in 5 minutes.</Text>
          <FormField label="Code from the text" required>
            <TextField value={code} onChange={setCode} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
          </FormField>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <div className="yx-auth__row">
            <Button type="submit" variant="primary" loading={busy} disabled={code.trim().length < 6}>Verify number</Button>
            <Button onClick={() => setSentTo(null)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <form className="yx-auth__form" onSubmit={send} noValidate>
          <FormField label="Mobile number" helper="With country code, for example +91 98450 12345.">
            <TextField value={number} onChange={setNumber} type="tel" inputMode="tel" autoComplete="tel" maxLength={32} />
          </FormField>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <div className="yx-auth__row">
            <Button type="submit" loading={busy} disabled={!number.trim()}>Text me a code</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function SessionsCard({ sessions, onSignOutSession, onSignOutOthers }: { sessions: SessionRow[]; onSignOutSession: (s: SessionRow) => Promise<void>; onSignOutOthers: () => Promise<void> }) {
  const others = sessions.filter((s) => !s.current).length;
  return (
    <Card
      title="Where you're signed in"
      actions={others > 0 && (
        <ConfirmDialog
          trigger={<Button size="sm">Sign out everywhere else</Button>}
          title={`Sign out of ${others} other ${others === 1 ? 'session' : 'sessions'}?`}
          consequence="This browser stays signed in."
          confirmLabel="Sign out"
          onConfirm={onSignOutOthers}
        />
      )}
    >
      {sessions.length === 0 ? (
        <EmptyState compact title="No other sessions." />
      ) : (
        <ul className="yx-auth__list" aria-label="Your sessions">
          {sessions.map((s) => (
            <li key={s.id} className="yx-auth__item">
              <div className="yx-auth__item-main">
                <span className="yx-auth__badges">
                  <Text weight="medium">{deviceLabel(s.userAgent)}</Text>
                  {s.current && <Badge tone="success">This browser</Badge>}
                </span>
                <Text tone="secondary" size="sm">
                  {[ipLabel(s.ipAddress), s.geo, `active ${when(s.lastSeenAt)}`].filter(Boolean).join(' · ')}
                </Text>
                <Text tone="secondary" size="sm">Signed in {when(s.createdAt)} with {methodLabel(s.method).toLowerCase()}{s.assuranceLevel === 'aal2' && s.method !== 'passkey' ? ' and a second step' : ''}</Text>
              </div>
              {!s.current && (
                <ConfirmDialog
                  trigger={<Button size="sm" aria-label={`Sign out ${deviceLabel(s.userAgent)}, last active ${when(s.lastSeenAt)}`}>Sign out</Button>}
                  title={`Sign out ${deviceLabel(s.userAgent)}?`}
                  consequence="That device has to sign in again."
                  confirmLabel="Sign out"
                  onConfirm={() => onSignOutSession(s)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
