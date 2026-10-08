// SD-1.20 email rules (US-G-018) and email commands (US-G-019). Both pure, so they are unit tested on their own.
// Rules match plain text only (contains / equals / starts with / ends with): no regular expressions written by an admin
// ever run over mail an outsider writes.

export interface RuleRow {
  id: string;
  name: string;
  field: string;
  headerName: string | null;
  op: string;
  value: string;
  action: string;
  actionValue: unknown;
  stop: boolean;
}

export interface MailFacts {
  from: string;
  to: string[];
  subject: string;
  body: string;
  headers: Map<string, string>;
}

export interface RuleOutcome {
  reject: string | null;
  spam: string | null;
  categoryId: string | null;
  deskId: string | null;
  priority: number | null;
  tags: string[];
  /** Values copied from "Key: value" lines into the ticket's own fields (custom). */
  fields: Record<string, string>;
  matched: string[];
}

function valuesOf(r: RuleRow, m: MailFacts): string[] {
  switch (r.field) {
    case 'from':
      return [m.from];
    case 'domain':
      return [m.from.split('@')[1] ?? ''];
    case 'to':
      return m.to;
    case 'subject':
      return [m.subject];
    case 'body':
      return [m.body.slice(0, 20_000)];
    case 'header':
      return [m.headers.get((r.headerName ?? '').toLowerCase()) ?? ''];
    default:
      return [];
  }
}

export function ruleMatches(r: RuleRow, m: MailFacts): boolean {
  const want = r.value.toLowerCase();
  return valuesOf(r, m).some((raw) => {
    const v = raw.toLowerCase();
    if (r.op === 'equals') return v === want;
    if (r.op === 'starts_with') return v.startsWith(want);
    if (r.op === 'ends_with') return v.endsWith(want);
    return v.includes(want);
  });
}

/** "Order number: 12345" → 12345 (the first such line). */
export function readField(body: string, key: string): string | null {
  const k = key.trim().toLowerCase();
  for (const line of body.split('\n').slice(0, 500)) {
    const i = line.indexOf(':');
    if (i > 0 && line.slice(0, i).trim().toLowerCase() === k) {
      const v = line.slice(i + 1).trim();
      if (v) return v.slice(0, 200);
    }
  }
  return null;
}

export function runRules(rules: readonly RuleRow[], m: MailFacts): RuleOutcome {
  const out: RuleOutcome = { reject: null, spam: null, categoryId: null, deskId: null, priority: null, tags: [], fields: {}, matched: [] };
  for (const r of rules) {
    if (!ruleMatches(r, m)) continue;
    out.matched.push(r.name);
    const v = (r.actionValue ?? {}) as { categoryId?: string; deskId?: string; tag?: string; priority?: number; key?: string; field?: string };
    if (r.action === 'reject') out.reject = `Rule "${r.name}"`;
    if (r.action === 'spam') out.spam = `Rule "${r.name}"`;
    if (r.action === 'route') {
      out.categoryId = v.categoryId ?? out.categoryId;
      out.deskId = v.deskId ?? out.deskId;
    }
    if (r.action === 'tag' && v.tag) out.tags.push(v.tag);
    if (r.action === 'priority' && v.priority && v.priority >= 1 && v.priority <= 4) out.priority = v.priority;
    if (r.action === 'parse_field' && v.key && v.field) {
      const found = readField(m.body, v.key);
      if (found) out.fields[v.field] = found;
    }
    if (r.stop || out.reject || out.spam) break;
  }
  out.tags = [...new Set(out.tags)].slice(0, 10);
  return out;
}

// ------------------------------------------------------------------------------------------ email commands

export interface EmailCommand {
  name: string;
  arg: string;
}

/** Commands are lines like "#status solved" at the very top of the reply (at most five). The rest is the message. */
export function readCommands(text: string): { commands: EmailCommand[]; rest: string } {
  const lines = text.split('\n');
  const commands: EmailCommand[] = [];
  let i = 0;
  for (; i < lines.length && commands.length < 5; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const m = /^#([a-z_]{2,20})(?:\s+(.{0,100}))?$/i.exec(line);
    if (!m) break;
    commands.push({ name: m[1].toLowerCase(), arg: (m[2] ?? '').trim() });
  }
  return { commands, rest: lines.slice(i).join('\n').trim() };
}

export const AGENT_COMMANDS = ['status', 'priority', 'assign', 'tag', 'note'] as const;
export const REQUESTER_COMMANDS = ['close'] as const;

export const COMMAND_HELP =
  'Commands go on the first lines of your reply, one per line. Agents: #status <status name>, #priority 1-4, #assign me (or a colleague\'s email), #tag <word>. ' +
  'The person who raised the ticket: #close. Commands work only from your own work address.';
