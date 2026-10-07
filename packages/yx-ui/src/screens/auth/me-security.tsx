import { useState, type FormEvent } from 'react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextField } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Card, PageHeader } from '../../components/shell';
import { RecoveryCodes, day, deviceLabel, methodLabel, useStep, when } from './kit';
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
  onNewRecoveryCodes: () => Promise<string[]>;
  onSendMobileCode: (mobileNumber: string) => Promise<string>;
  onVerifyMobile: (code: string) => Promise<void>;
  onRemoveMobile: () => Promise<void>;
  onSignOutSession: (session: SessionRow) => Promise<void>;
  onSignOutOthers: () => Promise<void>;
  /** Fixed "today" for stories and tests. */
  now?: Date;
}

/** Me › Security (P12 §7): second steps, recovery codes, mobile number, where you're signed in, sign-in history. */
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

function TwoStepCard({ mfa, onAddPasskey, onStartTotp, onConfirmTotp, onRemoveFactor, onNewRecoveryCodes, now = new Date() }: MeSecurityScreenProps & { mfa: MfaStatus }) {
  const [totp, setTotp] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [removing, setRemoving] = useState<MfaFactor | null>(null);
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
  const allowed = mfa.allowedFactors;
  const hasTotp = mfa.factors.some((f) => f.type === 'totp');
  const overdue = new Date(mfa.enrolmentDueAt) <= now;
  const lastOne = mfa.required && mfa.factors.length === 1;

  return (
    <Card title="Two-step verification">
      <div className="yx-auth__stack">
        {mfa.required && mfa.factors.length === 0 && (
          <InlineAlert tone={overdue ? 'danger' : 'warning'} title={overdue ? 'Sensitive actions are paused' : `Set this up by ${day(mfa.enrolmentDueAt)}`}>
            Your role needs a second sign-in step. A passkey is the quickest.
          </InlineAlert>
        )}
        {mfa.factors.length > 0 ? (
          <ul className="yx-auth__list" aria-label="Your second steps">
            {mfa.factors.map((f) => (
              <li key={f.id} className="yx-auth__item">
                <div className="yx-auth__item-main">
                  <Text weight="medium">{f.type === 'passkey' ? `Passkey · ${f.label}` : 'Authenticator app'}</Text>
                  <Text tone="secondary" size="sm">Added {day(f.createdAt)}{f.lastUsedAt ? ` · last used ${day(f.lastUsedAt)}` : ' · not used yet'}</Text>
                </div>
                <Button size="sm" disabled={lastOne} title={lastOne ? 'Your role needs at least one' : undefined} onClick={() => setRemoving(f)} aria-label={`Remove ${f.type === 'passkey' ? f.label : 'authenticator app'}`}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          !mfa.required && <EmptyState compact title="No second step yet." description="Add a passkey: it is the quickest and can't be phished." />
        )}
        {lastOne && <Text as="p" tone="secondary" size="sm">You can't remove your only second step, because your role needs one. Add another first.</Text>}

        {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}
        {totp && <TotpConfirm setup={totp} code={code} onCode={setCode} onSubmit={confirmTotp} busy={busy} error={error} onCancel={() => setTotp(null)} />}
        {!totp && error && <InlineAlert tone="danger">{error}</InlineAlert>}

        {!totp && !codes && (
          <div className="yx-auth__row">
            {allowed.includes('passkey') && <Button variant="primary" loading={busy} onClick={() => void run(async () => show(await onAddPasskey()))}>Add a passkey</Button>}
            {allowed.includes('totp') && !hasTotp && <Button disabled={busy} onClick={() => void run(async () => setTotp(await onStartTotp()))}>Set up authenticator app</Button>}
            {mfa.factors.length > 0 && (
              <Button disabled={busy} onClick={() => void run(async () => setCodes(await onNewRecoveryCodes()))}>
                New recovery codes ({mfa.recoveryCodesRemaining} left)
              </Button>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.type === 'passkey' ? removing.label : 'authenticator app'}?`}
        consequence="You won't be able to use it to sign in. We'll email you about this change."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (removing) await onRemoveFactor(removing);
        }}
      />
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
            <Text weight="medium" className="yx-mono">{mfa.mobileNumber}</Text>
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
          <Text as="p" tone="secondary" role="status">We texted a 6-digit code to {sentTo}. It expires in 5 minutes.</Text>
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
                  {[s.ipAddress, s.geo, `active ${when(s.lastSeenAt)}`].filter(Boolean).join(' · ')}
                </Text>
                <Text tone="secondary" size="sm">Signed in {when(s.createdAt)} with {methodLabel(s.method).toLowerCase()}{s.assuranceLevel === 'aal2' ? ' and a second step' : ''}</Text>
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
