import { ArrowLeft, Building2 } from 'lucide-react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { InlineAlert } from '../../components/feedback';
import { Switch } from '../../components/choice';
import { Text } from '../../components/foundations';
import { useToastIfAny } from '../../components/notify';
import { Breadcrumbs, Card, ObjectHeader } from '../../components/shell';
import { ConsolePage, useReasonDialog } from './console-kit';
import type { CompanySettingsView, LoadState } from './types';

/** What each plan feature means, in the words staff read. */
const FEATURE_WORDS: Record<string, string> = { white_label: 'White-label' };
const HELP: Record<string, string> = {
  'brand.white_label': 'On: the careers site, job pages and every candidate page leave out "Powered by YukthiX". The company cannot change this itself.',
};

export interface CompanySettingsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  company: CompanySettingsView | null;
  /** platform.companies.manage: may change them; others only read. */
  canManage: boolean;
  onBack: () => void;
  onChange: (key: string, value: string, reason: string) => Promise<void>;
}

/**
 * Console › Companies › one company › Company settings (careers answer 442): settings only YukthiX staff change, each
 * allowed only when the company's plan includes it (D15), with a reason; the company's admins see each change in its history.
 */
export function CompanySettingsScreen(props: CompanySettingsScreenProps) {
  const c = props.company;
  const toast = useToastIfAny();
  const [dialog, askReason] = useReasonDialog();
  const change = (key: string, label: string, on: boolean) =>
    askReason({
      title: on ? `Turn this on for ${c!.name}?` : `Turn this off for ${c!.name}?`,
      consequence: on ? `${label}. The company's pages change at once; its admins see this change and your reason.` : `${label}: off. "Powered by YukthiX" shows again on the company's pages.`,
      confirmLabel: on ? 'Turn on' : 'Turn off',
      action: async (reason) => {
        await props.onChange(key, on ? 'on' : 'off', reason);
        toast?.toast({ tone: 'success', title: on ? 'Turned on' : 'Turned off', description: `${label} · ${c!.name}` });
      },
    });
  return (
    <ConsolePage crumb="Companies" title={props.state === 'ready' ? undefined : 'Company settings'} state={props.state} onRetry={props.onRetry} what="this company's settings">
      {c && (
        <>
          <div>
            <Button icon={ArrowLeft} size="sm" onClick={props.onBack}>
              Back to {c.name}
            </Button>
          </div>
          <ObjectHeader
            breadcrumbs={<Breadcrumbs items={[{ label: 'Console' }, { label: 'Companies' }, { label: c.name }, { label: 'Company settings' }]} />}
            name="Company settings"
            icon={Building2}
            secondary={`${c.name} · set by YukthiX, with a reason`}
            facts={[{ label: 'The plan includes', value: c.features.map((f) => FEATURE_WORDS[f] ?? f).join(', ') || 'None of these' }]}
          />
          <Card title="Plan settings">
            {c.settings.map((s) =>
              s.included ? (
                props.canManage ? (
                  <Switch key={s.key} label={s.label} description={HELP[s.key]} checked={s.value === 'on'} onChange={(on) => change(s.key, s.label, on)} />
                ) : (
                  <div key={s.key} className="yx-auth__stack">
                    <Text>{s.label}</Text>
                    <div>
                      <Badge tone={s.value === 'on' ? 'success' : 'neutral'}>{s.value === 'on' ? 'On' : 'Off'}</Badge>
                    </div>
                  </div>
                )
              ) : (
                <InlineAlert
                  key={s.key}
                  tone="info"
                  title={`${s.label}: not in this company's plan`}
                  actions={
                    s.value === 'on' && props.canManage ? (
                      <Button size="sm" onClick={() => change(s.key, s.label, false)}>
                        Turn off
                      </Button>
                    ) : undefined
                  }
                >
                  {s.value === 'on' ? 'It is on from before; you can turn it off.' : 'Add a product whose plan includes it first.'}
                </InlineAlert>
              ),
            )}
          </Card>
          {dialog}
        </>
      )}
    </ConsolePage>
  );
}
