// T2-G 41 (answer 2746): Settings › Modules. Each module on or off (People, Payroll and Compliance stay on) and the order
// the rail shows them in. A change takes effect at once (a switch, §16): switching a module off asks first, since its menus
// and pages go away for everyone; its data stays and switching it on brings everything back.
import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Card, PageHeader } from '../../components/shell';
import { IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { ErrorState, NoAccessState, Skeleton } from '../../components/feedback';
import { Switch } from '../../components/choice';
import { ConfirmDialog } from '../../components/overlay';
import { useToastIfAny } from '../../components/notify';
import { Select } from '../../components/select';
import { Text } from '../../components/foundations';
import { DesktopFrame } from '../_kit/frames';
import { settingsPanel } from './platform-kit';

export interface ModuleRow {
  id: string;
  label: string;
  on: boolean;
  /** People, Payroll and Compliance: cannot be switched off. */
  locked: boolean;
  /** T2-G 44 (answer 2745): the person named as the module's owner (shown on Home, answers its helpdesk questions); not a permission. */
  owner?: { id: string; name: string } | null;
}

export interface ModulesChange {
  off: string[];
  order: string[];
  /** T2-G 44: module id → owner's user id or null (only a changed owner is sent). */
  owners?: Record<string, string | null>;
}

export interface LiveModules {
  state: 'loading' | 'error' | 'no-access' | 'ready';
  onRetry: () => void;
  /** Saves the whole page (off and order); rejects with the server's reason. */
  onSave: (next: ModulesChange) => Promise<void>;
}

export interface ModulesScreenProps {
  modules: ModuleRow[];
  /** Without the company settings key the page is read-only. */
  canEdit?: boolean;
  /** T2-G 44: the company's people who can be named owner (absent: no owner choice). */
  people?: { value: string; label: string }[];
  live?: LiveModules;
}

const change = (rows: ModuleRow[]): ModulesChange => ({ off: rows.filter((r) => !r.on).map((r) => r.id), order: rows.map((r) => r.id) });

export function ModulesScreen({ modules, canEdit = true, people, live }: ModulesScreenProps) {
  const toast = useToastIfAny();
  const [local, setLocal] = useState<ModuleRow[] | null>(null);
  const [asking, setAsking] = useState<ModuleRow | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = local ?? modules;
  const save = async (next: ModuleRow[], done: string, owners?: Record<string, string | null>) => {
    setBusy(true);
    try {
      if (live) await live.onSave({ ...change(next), ...(owners ? { owners } : {}) });
      setLocal(live ? null : next);
      toast?.toast({ tone: 'success', title: done });
    } catch (e) {
      toast?.toast({ tone: 'error', title: e instanceof Error && e.message ? e.message : "We couldn't save this. Try again." });
    } finally {
      setBusy(false);
    }
  };
  const turn = (m: ModuleRow, on: boolean) => save(rows.map((r) => (r.id === m.id ? { ...r, on } : r)), on ? `${m.label} switched on` : `${m.label} switched off`);
  const name = (m: ModuleRow, userId: string | null) => {
    const who = userId ? (people?.find((p) => p.value === userId)?.label ?? '') : '';
    void save(rows.map((r) => (r.id === m.id ? { ...r, owner: userId ? { id: userId, name: who } : null } : r)), userId ? `${who} owns ${m.label}` : `${m.label} has no owner now`, { [m.id]: userId });
  };
  const move = (i: number, by: -1 | 1) => {
    const next = [...rows];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    void save(next, `${rows[i]!.label} moved ${by < 0 ? 'up' : 'down'}`);
  };
  const frame = (body: ReactNode) => (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel('1.6 Set-up hub')}>
      <PageHeader title="Modules" description="Switch off what your company does not use, choose the order of the menu and name an owner for each module. A module that is off keeps its data." />
      {body}
    </DesktopFrame>
  );
  if (live && live.state !== 'ready')
    return frame(
      <>
        {live.state === 'loading' && <Skeleton height={320} />}
        {live.state === 'error' && <ErrorState title="We couldn't load the modules." description="Check your connection and try again." onRetry={live.onRetry} />}
        {live.state === 'no-access' && <NoAccessState what="the modules" grantedBy="your System Admin" />}
      </>,
    );
  return frame(
    <Card title="Modules in the menu">
      <ol className="yx-plt-stack" aria-label="Modules, in menu order">
        {rows.map((m, i) => (
          <li key={m.id} className="yx-plt-row" data-justify="between">
            <Switch
              label={m.label}
              description={m.locked ? 'Always on.' : m.on ? undefined : 'Off: hidden from the menu. Its data is kept.'}
              checked={m.on}
              disabled={!canEdit || m.locked || busy}
              onChange={(on) => (on ? void turn(m, true) : setAsking(m))}
            />
            <div className="yx-plt-row">
              {people && canEdit ? (
                <Select aria-label={`Owner of ${m.label}`} value={m.owner?.id ?? null} onChange={(v) => name(m, v)} clearable placeholder="No owner" options={people} searchable disabled={busy} />
              ) : (
                m.owner && <Text tone="secondary">Owner: {m.owner.name}</Text>
              )}
              {m.locked && <Badge tone="neutral">Always on</Badge>}
              {canEdit && (
                <>
                  <IconButton icon={ArrowUp} label={`Move ${m.label} up`} size="sm" disabled={i === 0 || busy} onClick={() => move(i, -1)} />
                  <IconButton icon={ArrowDown} label={`Move ${m.label} down`} size="sm" disabled={i === rows.length - 1 || busy} onClick={() => move(i, 1)} />
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
      <ConfirmDialog
        open={Boolean(asking)}
        onOpenChange={(o) => !o && setAsking(null)}
        title={`Switch off ${asking?.label ?? ''}?`}
        consequence={`Its menus and pages go away for everyone in your company, and its screens cannot be opened. Nothing is deleted: switch it on again to bring everything back.`}
        confirmLabel="Switch off"
        destructive
        onConfirm={async () => {
          const m = asking!;
          setAsking(null);
          await turn(m, false);
        }}
      />
    </Card>,
  );
}
