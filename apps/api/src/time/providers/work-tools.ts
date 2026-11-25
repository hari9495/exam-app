// Work tools for timesheet suggestions (TIM-43) behind an adapter (BUILD-STANDARD §2, external providers).
// Providers: to decide (a work calendar such as Google / Microsoft 365, an issue tracker such as Jira, a code host such
// as GitHub / GitLab). The dev-fake needs no network and stores no token. A real provider that needs OAuth tokens keeps
// them encrypted with OrgSecretsCryptoService (never in tool_connections as plain text) and adds its own table or column.

export const WORK_TOOLS = Symbol('WORK_TOOLS');

export const TOOL_PROVIDERS = ['calendar', 'issues', 'code'] as const;
export type ToolProvider = (typeof TOOL_PROVIDERS)[number];
export const TOOL_LABEL: Record<ToolProvider, string> = { calendar: 'Work calendar', issues: 'Issue tracker', code: 'Code host' };

/** One suggested line from a tool: a date, time spent and what it was about. Never written anywhere by the server. */
export interface ToolLine {
  date: string;
  minutes: number;
  /** A project code or name the tool saw (event title, issue key), or null. */
  projectHint: string | null;
  activityHint: string | null;
  /** What the suggestion is based on, in plain words. */
  source: string;
  /** rule: the tool's own text names the project; ai: an estimate the person should check. */
  kind: 'rule' | 'ai';
}

export interface WorkToolConnector {
  /** Links the person's account; returns the label to show ("rekha@kaverifoods.in"). */
  connect(userId: string, provider: ToolProvider): Promise<{ accountLabel: string }>;
  /** Lines for the days of the week (Monday `week`) up to `upTo`. Never throws for "nothing found": an empty list. */
  suggestions(userId: string, provider: ToolProvider, week: string, upTo: string): Promise<ToolLine[]>;
}

const plus = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Local and test use: the same lines for every person and week, no network, nothing stored. */
export class DevFakeWorkTools implements WorkToolConnector {
  async connect(_userId: string, provider: ToolProvider) {
    return { accountLabel: `${TOOL_LABEL[provider]} (dev-fake)` };
  }

  async suggestions(_userId: string, provider: ToolProvider, week: string, upTo: string): Promise<ToolLine[]> {
    const all: Record<ToolProvider, (Omit<ToolLine, 'date'> & { day: number })[]> = {
      calendar: [
        { day: 0, minutes: 120, projectHint: 'FSSAI-AUDIT', activityHint: 'Line checks', source: 'Calendar: "FSSAI-AUDIT line checks"', kind: 'rule' },
        { day: 2, minutes: 60, projectHint: 'Client workshop', activityHint: null, source: 'Calendar: "Client workshop"', kind: 'rule' },
      ],
      issues: [{ day: 1, minutes: 90, projectHint: 'FSSAI-AUDIT', activityHint: 'Documentation', source: 'Estimated from 3 issues you closed in FSSAI-AUDIT · check the hours', kind: 'ai' }],
      code: [{ day: 3, minutes: 120, projectHint: null, activityHint: null, source: 'Estimated from 4 changes you pushed · check the hours', kind: 'ai' }],
    };
    return all[provider].map(({ day, ...l }) => ({ ...l, date: plus(week, day) })).filter((l) => l.date <= upTo);
  }
}

/** No provider chosen (production until one is): connecting is refused in plain words, never a blocked page. */
export class NoWorkTools implements WorkToolConnector {
  async connect(): Promise<{ accountLabel: string }> {
    throw new Error('NO_PROVIDER');
  }
  async suggestions() {
    return [];
  }
}

/** WORK_TOOLS_PROVIDER=dev-fake (the default outside production); unknown or unset in production: none. */
export function workToolsFromEnv(env: NodeJS.ProcessEnv = process.env): WorkToolConnector {
  const name = env.WORK_TOOLS_PROVIDER ?? (env.NODE_ENV === 'production' ? 'none' : 'dev-fake');
  return name === 'dev-fake' ? new DevFakeWorkTools() : new NoWorkTools();
}

export interface ProjectRef {
  id: string;
  code: string;
  name: string;
  activities: string[];
}

/**
 * A tool's hint onto the company's active timesheet projects: the project code, else the project name, else a code or
 * name inside the hint ("FSSAI-AUDIT line checks"). No match: null (the person chooses a project). The activity only
 * when it is one of that project's activities.
 */
export function matchProject(hint: string | null, activityHint: string | null, projects: readonly ProjectRef[]): { projectId: string | null; activity: string | null } {
  const h = hint?.trim().toLowerCase() ?? '';
  const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9-]+/g, ' ')} `;
  const p = !h
    ? undefined
    : (projects.find((x) => x.code.toLowerCase() === h) ??
      projects.find((x) => x.name.toLowerCase() === h) ??
      projects.find((x) => words(h).includes(` ${x.code.toLowerCase()} `)) ??
      projects.find((x) => x.name.length >= 4 && h.includes(x.name.toLowerCase())));
  if (!p) return { projectId: null, activity: null };
  const a = activityHint?.trim().toLowerCase();
  return { projectId: p.id, activity: (a && p.activities.find((x) => x.toLowerCase() === a)) || null };
}
