// Irreversible action sheet (APX-D §6.4): impact, typed confirmation, reason, maker and checker. Moved from the pay kit
// into the shared kit (answer 962): Pay, Payments, Compliance and Expenses use it; the Help patterns story shows it.
import { useId, useState, type ReactNode } from 'react';
import { Lock, Send } from 'lucide-react';
import { Button } from './button';
import { Badge } from './display';
import { Drawer } from './drawer';
import { InlineAlert } from './feedback';
import { FormField } from './field';
import type { IconComponent } from './foundations';
import { TextArea, TextField } from './inputs';

/** The typed phrase must match exactly (entity + period in capitals). */
export function confirmPhraseMatches(typed: string, phrase: string) {
  return typed.trim() === phrase;
}


export interface ImpactRow {
  label: string;
  value: ReactNode;
}

export interface IrreversibleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Approve and lock September 2026" */
  title: string;
  subtitle?: ReactNode;
  impact: ImpactRow[];
  /** What cannot be undone. */
  cannotUndo: ReactNode;
  /** Correction path afterwards. */
  correction: ReactNode;
  /** Phrase to type, e.g. "KAVERI FOODS SEP 2026". */
  phrase: string;
  reasonRequired?: boolean;
  maker: string;
  checker: string;
  /** Sole-admin company: self-approval with a reason (P02 Q6). */
  selfApproval?: boolean;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  /** Blocks confirmation with a named reason (open attendance exceptions, missing permission…). */
  blocked?: ReactNode;
  children?: ReactNode;
  defaultTyped?: string;
  defaultReason?: string;
  done?: ReactNode;
  /** Confirm button colour: 'approve' (green) for approvals, 'primary' for publish or release, 'danger' only for destructive actions. Default 'danger'. */
  confirmVariant?: 'approve' | 'primary' | 'danger';
  /** Confirm button icon (default Lock; use Send for publishing). */
  confirmIcon?: IconComponent;
  /** Short reason shown beside the disabled confirm button while blocked, e.g. "4 attendance exceptions open". */
  blockedReason?: string;
  /** The fix for the block, shown in the blocked alert (e.g. "Open 4 exceptions"). */
  blockedAction?: ReactNode;
  /** When maker = checker: the person who can confirm instead, offered as "Send to … for approval". */
  otherApprover?: string;
  onSendToChecker?: () => void;
  /** Saving failed or the run changed meanwhile: shown at the top with Try again / Reload run. */
  error?: ReactNode;
  onRetry?: () => void;
  onReload?: () => void;
}

const REASON_MIN = 5;

/** Impact preview + typed confirmation + reason + maker ≠ checker, as a T4 sheet. */
export function IrreversibleSheet(p: IrreversibleSheetProps) {
  const [typed, setTyped] = useState(p.defaultTyped ?? '');
  const [reason, setReason] = useState(p.defaultReason ?? '');
  // Pressed before it is ready: the unmet field says why and takes focus (the button is never disabled, founder rule).
  const [tried, setTried] = useState(false);
  const fid = useId();
  const needReason = p.reasonRequired || p.selfApproval;
  const phraseOk = confirmPhraseMatches(typed, p.phrase);
  const reasonOk = !needReason || reason.trim().length >= REASON_MIN;
  const ok = phraseOk && reasonOk && !p.blocked;
  const makerCheckerOk = p.maker !== p.checker || p.selfApproval;
  // Approvals stay green behind typed confirmation (R7); publishing is not a lock; danger is for release and void.
  const approving = /^Approve/i.test(p.confirmLabel);
  const publishing = /^Publish/i.test(p.confirmLabel);
  const confirmVariant = p.confirmVariant ?? (approving ? 'approve' : publishing ? 'primary' : 'danger');
  const confirmIcon = p.confirmIcon ?? (publishing ? Send : Lock);
  // The first unmet condition, shown beside the disabled button (B7).
  const why = p.blocked
    ? (p.blockedReason ?? "Can't continue until the issue above is resolved")
    : !phraseOk
      ? `Type ${p.phrase} to continue`
      : !reasonOk
        ? `Add a reason (at least ${REASON_MIN} characters)`
        : null;
  const confirm = () => {
    if (ok) return p.onConfirm(reason);
    setTried(true);
    if (!p.blocked) document.getElementById(`${fid}-${!reasonOk ? 'reason' : 'phrase'}`)?.focus();
  };
  const close = (open: boolean) => {
    // Cancel clears the typed phrase and reason, so reopening never starts half-confirmed (B9).
    if (!open) {
      setTyped(p.defaultTyped ?? '');
      setReason(p.defaultReason ?? '');
      setTried(false);
    }
    p.onOpenChange(open);
  };
  return (
    <Drawer
      open={p.open}
      onOpenChange={close}
      title={p.title}
      subtitle={p.subtitle}
      size="lg"
      footer={
        p.done ? (
          <Button onClick={() => close(false)}>Close</Button>
        ) : !makerCheckerOk ? (
          <>
            <Button onClick={() => close(false)}>Cancel</Button>
            {p.onSendToChecker && (
              <Button variant="primary" icon={Send} onClick={p.onSendToChecker}>
                {p.otherApprover ? `Send to ${p.otherApprover} for approval` : 'Ask another approver'}
              </Button>
            )}
          </>
        ) : (
          <>
            {why && (
              <span className="yx-irrev__why" id={`${fid}-why`}>
                {why}
              </span>
            )}
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button variant={confirmVariant} icon={confirmIcon} aria-describedby={why ? `${fid}-why` : undefined} onClick={confirm}>
              {p.confirmLabel}
            </Button>
          </>
        )
      }
    >
      <div className="yx-irrev">
        {p.done ? (
          p.done
        ) : (
          <>
            {p.error && (
              <InlineAlert
                tone="danger"
                title="This didn't go through"
                actions={
                  <>
                    {p.onRetry && <Button onClick={p.onRetry}>Try again</Button>}
                    {p.onReload && <Button onClick={p.onReload}>Reload run</Button>}
                  </>
                }
              >
                {p.error}
              </InlineAlert>
            )}
            {p.blocked && (
              <InlineAlert tone="danger" title="You can't do this yet" actions={p.blockedAction}>
                {p.blocked}
              </InlineAlert>
            )}
            {!makerCheckerOk && (
              <InlineAlert tone="danger" title="Someone else must confirm this">
                You prepared this run, so {p.otherApprover ?? 'another approver'} has to confirm it.
              </InlineAlert>
            )}
            <section aria-label="What will happen">
              <h3 className="yx-irrev__title">What will happen</h3>
              <dl className="yx-irrev__impact">
                {p.impact.map((r) => (
                  <div key={r.label}>
                    <dt>{r.label}</dt>
                    <dd>{r.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {p.children}
            <InlineAlert tone="warning" title="This can't be undone">
              {p.cannotUndo}
              <br />
              {p.correction}
            </InlineAlert>
            <section className="yx-irrev__mc" aria-label="Maker and checker">
              <p>
                <span className="yx-irrev__k">Prepared by</span> {p.maker}
              </p>
              <p>
                <span className="yx-irrev__k">Confirming</span> {p.checker}
              </p>
              {p.selfApproval ? (
                <>
                  <Badge tone="warning">Self-approval</Badge>
                  <p className="yx-irrev__note">Only one eligible approver, so a reason is required.</p>
                </>
              ) : makerCheckerOk ? (
                <Badge tone="success">Maker and checker are different people</Badge>
              ) : (
                // The danger alert above already says why; the badge only names the fact (one alert per message).
                <Badge>Same person</Badge>
              )}
            </section>
            {makerCheckerOk && needReason && (
              <FormField id={`${fid}-reason`} label="Reason" required helper={`At least ${REASON_MIN} characters. Stored with the audit event.`} error={tried && !reasonOk ? `Add a reason (at least ${REASON_MIN} characters).` : undefined}>
                <TextArea value={reason} onChange={setReason} rows={2} />
              </FormField>
            )}
            {makerCheckerOk && (
              <FormField id={`${fid}-phrase`} label={`Type ${p.phrase} to confirm`} required helper="Must match exactly, in capitals. The phrase and the totals above are stored with the audit event." error={tried && !phraseOk ? `Type ${p.phrase} exactly, in capitals.` : undefined}>
                <TextField value={typed} onChange={setTyped} autoComplete="off" spellCheck={false} />
              </FormField>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
