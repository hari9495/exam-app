import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import Redis from 'ioredis';
import { AuditService, OrgSecretsCryptoService, TenantPrismaService } from '@exam-platform/shared';
import { assertPublicHttpsHost, publicHttpsFetch } from '../common/ssrf';
import { REDIS_CONNECTION, logBullErrors } from '../jobs/redis-connection';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { FieldDef, Group, RecordValues, RuleError, TraceRow, evaluate, parseGroup } from './conditions';

// P19 automation (shared platform engine; the Service Desk is the first module to use it, SD-2.12). A module
// registers a record type: its allow-listed fields, its triggers (business events from the outbox, or time), how to
// load a record, and how to check and run its actions. The engine keeps everything else in one place for every module:
// versioned rules, the run trace, loop protection, per-company and per-rule limits, dry runs, recipes, retention and
// signed webhooks through the SSRF guard.

export const MAX_DEPTH = 3; // §10.1: a rule chain stops at depth 3
export const COMPANY_RUNS_PER_MINUTE = 300; // §10.1: per-company rule-run limit
const RETENTION_DAYS = 30;

export interface Chain {
  id: string;
  depth: number;
  fired: string[];
}
const CHAINS = new WeakMap<object, Chain>();
/** The chain a transaction belongs to while a rule's actions run in it (the module's events carry it on). */
export const chainOf = (tx: object): Chain | undefined => CHAINS.get(tx);

export interface TriggerDef {
  key: string;
  label: string;
  /** A time trigger: "N hours since …" (checked every 5 minutes, fires once per record per change). */
  time?: boolean;
}
export interface Trigger {
  type: string;
  hours?: number;
  /** Updated triggers: only when one of these fields changed. */
  fields?: string[];
}
export interface Action {
  type: string;
  [k: string]: unknown;
}
export interface Loaded {
  values: RecordValues;
  scopeId: string | null;
  /** Sensitive or private records keep their values out of the trace. */
  hide: boolean;
  /** A short label for the trace and dry runs (e.g. the ticket number). */
  label: string;
}

export interface RecordTypeHandler {
  key: string;
  module: string;
  triggers: TriggerDef[];
  /** The allow-listed fields rules may read, for a scope (live options such as a desk's categories). */
  fields(tx: Tx, org: string, scopeId: string | null): Promise<FieldDef[]>;
  /** An outbox event this record type reacts to, or null. */
  fromEvent(eventType: string, payload: Record<string, unknown>): { recordId: string; trigger: string; changed?: string[] } | null;
  /** Runs before anything else in each transaction the engine opens for this record type (e.g. system rights). */
  system(tx: Tx): Promise<void>;
  load(tx: Tx, org: string, recordId: string): Promise<Loaded | null>;
  /** Checks and normalises the module's own actions against live data; throws RuleError. */
  parseAction(tx: Tx, org: string, scopeId: string | null, input: Record<string, unknown>, can: { integrations: boolean }): Promise<Action>;
  execute(tx: Tx, org: string, recordId: string, action: Action, rule: { id: string; name: string }): Promise<string>;
  /** Records a time trigger may fire on now, with when they last changed. */
  timeCandidates(tx: Tx, org: string, scopeId: string | null, trigger: Trigger, now: Date): Promise<{ id: string; since: Date }[]>;
  /** Recent records for a dry run. */
  recent(tx: Tx, org: string, scopeId: string | null, limit: number): Promise<string[]>;
  /** What a webhook receives: ids and plain fields only, never message text. */
  webhookBody(loaded: Loaded, recordId: string): Record<string, unknown>;
  /** Tell the rule's admins it failed or stopped (in-app). */
  tellAdmins(org: string, scopeId: string | null, ruleId: string, ruleName: string, why: string): Promise<void>;
}

export interface RuleInput {
  name: string;
  description?: string | null;
  trigger: unknown;
  condition: unknown;
  actions: unknown;
  stopAfter?: boolean;
  maxRunsPerHour?: number;
  sortOrder?: number;
  changeNote?: string | null;
}

type Run = { outcome: string; trace: TraceRow[]; actions: { type: string; result: string }[]; error?: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const WEBHOOK_QUEUE = 'rule-webhooks';
const JOBS_QUEUE = 'rule-jobs';

@Injectable()
export class AutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationService.name);
  private readonly handlers = new Map<string, RecordTypeHandler>();
  private readonly hooks: Queue;
  private readonly jobs: Queue;
  private workers: Worker[] = [];

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
  ) {
    this.hooks = logBullErrors(new Queue(WEBHOOK_QUEUE, { connection }), WEBHOOK_QUEUE);
    this.jobs = logBullErrors(new Queue(JOBS_QUEUE, { connection }), JOBS_QUEUE);
  }

  async onModuleInit() {
    this.workers = [
      logBullErrors(new Worker(WEBHOOK_QUEUE, (job) => this.deliver(job), { connection: this.connection }), WEBHOOK_QUEUE),
      logBullErrors(
        new Worker(
          JOBS_QUEUE,
          async (job) => {
            const n = job.name === 'dispatch' ? await this.dispatch() : job.name === 'tick' ? await this.tick() : await this.retention();
            if (n) this.logger.log(`${job.name}: ${n}`);
          },
          { connection: this.connection },
        ),
        JOBS_QUEUE,
      ),
    ];
    await this.jobs.upsertJobScheduler('rule-dispatch', { every: 5_000 }, { name: 'dispatch', data: {} });
    await this.jobs.upsertJobScheduler('rule-tick', { every: 5 * 60_000 }, { name: 'tick', data: {} });
    await this.jobs.upsertJobScheduler('rule-retention', { pattern: '15 2 * * *', tz: 'Asia/Kolkata' }, { name: 'retention', data: {} });
  }

  async onModuleDestroy() {
    for (const w of this.workers) await w.close();
    await this.hooks.close();
    await this.jobs.close();
  }

  register(h: RecordTypeHandler) {
    this.handlers.set(h.key, h);
  }

  handler(key: string): RecordTypeHandler {
    const h = this.handlers.get(key);
    if (!h) throw new NotFoundException('No such record type.');
    return h;
  }

  // ------------------------------------------------------------------------------------------ saving rules

  /** Checks a rule from outside against the record type's allow-listed fields, triggers and actions. */
  async parse(tx: Tx, org: string, h: RecordTypeHandler, scopeId: string | null, input: Pick<RuleInput, 'trigger' | 'condition' | 'actions'>, can: { integrations: boolean }) {
    try {
      const fields = await h.fields(tx, org, scopeId);
      if (!isObj(input.trigger)) throw new RuleError('Choose when the rule runs.');
      const t = input.trigger;
      const def = h.triggers.find((d) => d.key === t.type);
      if (!def) throw new RuleError('Choose when the rule runs.');
      for (const k of Object.keys(t)) if (!['type', 'hours', 'fields'].includes(k)) throw new RuleError(`The trigger has an unknown part "${k.slice(0, 20)}".`);
      const trigger: Trigger = { type: def.key };
      if (def.time) {
        if (!Number.isInteger(t.hours) || (t.hours as number) < 1 || (t.hours as number) > 24 * 90) throw new RuleError('Say after how many hours (1 to 2,160).');
        trigger.hours = t.hours as number;
      }
      if (t.fields !== undefined) {
        if (!Array.isArray(t.fields) || t.fields.length > 20 || t.fields.some((f) => typeof f !== 'string' || !fields.some((x) => x.key === f))) throw new RuleError('Choose fields from the list.');
        trigger.fields = [...new Set(t.fields as string[])];
      }
      const condition: Group = input.condition === undefined || input.condition === null ? { id: 'all', join: 'and', items: [] } : parseGroup(input.condition, fields);
      if (!Array.isArray(input.actions) || !input.actions.length || input.actions.length > 10) throw new RuleError('Add 1 to 10 actions.');
      const actions: Action[] = [];
      for (const a of input.actions) {
        if (!isObj(a) || typeof a.type !== 'string') throw new RuleError('Choose what each action does.');
        if (a.type === 'webhook') {
          if (!can.integrations) throw new RuleError('Calling a webhook needs the integrations permission (desk.integration.manage).');
          const hook = typeof a.webhookId === 'string' ? await tx.automationWebhook.findFirst({ where: { organizationId: org, id: a.webhookId, active: true } }) : null;
          if (!hook || Object.keys(a).some((k) => !['type', 'webhookId'].includes(k))) throw new RuleError('Choose one of the company webhooks.');
          actions.push({ type: 'webhook', webhookId: hook.id });
        } else actions.push(await h.parseAction(tx, org, scopeId, a, can));
      }
      return { trigger, condition, actions };
    } catch (e) {
      if (e instanceof RuleError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  async create(tx: Tx, ctx: CompanyContext, by: string, h: RecordTypeHandler, scopeId: string | null, input: RuleInput, can: { integrations: boolean }, recipeKey?: string) {
    const org = ctx.organizationId;
    const parsed = await this.parse(tx, org, h, scopeId, input, can);
    const rule = await tx.rule.create({
      data: { organizationId: org, ownerModule: h.module, recordType: h.key, scopeId, name: input.name.trim(), description: input.description?.trim() || null, stopAfter: Boolean(input.stopAfter), maxRunsPerHour: input.maxRunsPerHour ?? 200, sortOrder: input.sortOrder ?? 0, recipeKey: recipeKey ?? null, createdBy: by },
    });
    await tx.ruleVersion.create({ data: { organizationId: org, ruleId: rule.id, version: 1, trigger: parsed.trigger as unknown as Prisma.InputJsonValue, condition: parsed.condition as unknown as Prisma.InputJsonValue, actions: parsed.actions as unknown as Prisma.InputJsonValue, changeNote: input.changeNote ?? (recipeKey ? `From the recipe ${recipeKey}` : null), createdBy: by } });
    await AuditService.recordIn(tx, ctx, { actorUserId: by, action: 'rule.created', entityType: 'rule', entityId: rule.id, metadata: { recordType: h.key, scopeId, name: rule.name, recipeKey: recipeKey ?? null, ...parsed } });
    return rule;
  }

  /** A change is a new version (YX-RULE-06); runs keep pointing at the version they used. */
  async update(tx: Tx, ctx: CompanyContext, by: string, h: RecordTypeHandler, ruleId: string, version: number, input: Partial<RuleInput>, can: { integrations: boolean }) {
    const org = ctx.organizationId;
    const rule = await tx.rule.findFirst({ where: { organizationId: org, id: ruleId, recordType: h.key } });
    if (!rule) throw new NotFoundException('No such rule.');
    if (rule.version !== version) throw new ConflictException('Someone changed this rule. Reload to see the latest.');
    let next = rule.currentVersion;
    if (input.trigger !== undefined || input.condition !== undefined || input.actions !== undefined) {
      const cur = await tx.ruleVersion.findFirstOrThrow({ where: { organizationId: org, ruleId, version: rule.currentVersion } });
      const parsed = await this.parse(tx, org, h, rule.scopeId, { trigger: input.trigger ?? cur.trigger, condition: input.condition ?? cur.condition, actions: input.actions ?? cur.actions }, can);
      next = rule.currentVersion + 1;
      await tx.ruleVersion.create({ data: { organizationId: org, ruleId, version: next, trigger: parsed.trigger as unknown as Prisma.InputJsonValue, condition: parsed.condition as unknown as Prisma.InputJsonValue, actions: parsed.actions as unknown as Prisma.InputJsonValue, changeNote: input.changeNote ?? null, createdBy: by } });
    }
    const updated = await tx.rule.update({
      where: { id: rule.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.stopAfter !== undefined ? { stopAfter: input.stopAfter } : {}),
        ...(input.maxRunsPerHour !== undefined ? { maxRunsPerHour: input.maxRunsPerHour } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        currentVersion: next,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    await AuditService.recordIn(tx, ctx, { actorUserId: by, action: 'rule.updated', entityType: 'rule', entityId: rule.id, metadata: { from: rule.currentVersion, to: next, changes: Object.keys(input) } });
    return updated;
  }

  async setStatus(tx: Tx, ctx: CompanyContext, by: string, h: RecordTypeHandler, ruleId: string, version: number, status: 'active' | 'paused' | 'retired') {
    const rule = await tx.rule.findFirst({ where: { organizationId: ctx.organizationId, id: ruleId, recordType: h.key } });
    if (!rule) throw new NotFoundException('No such rule.');
    if (rule.version !== version) throw new ConflictException('Someone changed this rule. Reload to see the latest.');
    if (rule.status === 'retired') throw new ConflictException('A retired rule stays retired. Copy it into a new rule instead.');
    const updated = await tx.rule.update({ where: { id: rule.id }, data: { status, pausedReason: null, version: { increment: 1 }, updatedAt: new Date() } });
    await AuditService.recordIn(tx, ctx, { actorUserId: by, action: `rule.${status}`, entityType: 'rule', entityId: rule.id, metadata: { from: rule.status } });
    return updated;
  }

  async view(tx: Tx, org: string, ruleId: string) {
    const rule = await tx.rule.findFirst({ where: { organizationId: org, id: ruleId } });
    if (!rule) return null;
    const v = await tx.ruleVersion.findFirstOrThrow({ where: { organizationId: org, ruleId, version: rule.currentVersion } });
    return { ...rule, trigger: v.trigger, condition: v.condition, actions: v.actions, changeNote: v.changeNote };
  }

  async runs(tx: Tx, org: string, ruleId: string) {
    return tx.automationRun.findMany({ where: { organizationId: org, ruleId }, orderBy: { at: 'desc' }, take: 100 });
  }

  /** US-B-130: which recent records the rule would change, with each condition's result. Changes nothing. */
  async dryRun(tx: Tx, org: string, h: RecordTypeHandler, ruleId: string) {
    const rule = await this.view(tx, org, ruleId);
    if (!rule) throw new NotFoundException('No such rule.');
    const fields = await h.fields(tx, org, rule.scopeId);
    const out: { recordId: string; label: string; match: boolean; trace: TraceRow[] }[] = [];
    for (const id of await h.recent(tx, org, rule.scopeId, 50)) {
      const r = await h.load(tx, org, id);
      if (!r) continue;
      const e = evaluate(rule.condition as unknown as Group, r.values, fields, { hideActual: r.hide });
      out.push({ recordId: id, label: r.label, match: e.pass, trace: e.trace });
    }
    return { checked: out.length, matched: out.filter((x) => x.match).length, records: out };
  }

  // ------------------------------------------------------------------------------------------ running

  /** Job every 5 seconds: business events from the outbox, each once (claimed with SKIP LOCKED). */
  async dispatch(): Promise<number> {
    const events = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.$queryRaw<{ id: string; organization_id: string; event_type: string; payload: Record<string, unknown> }[]>`
        UPDATE event_outbox SET automation_at = now()
        WHERE id IN (SELECT id FROM event_outbox WHERE automation_at IS NULL ORDER BY occurred_at LIMIT 200 FOR UPDATE SKIP LOCKED)
        RETURNING id, organization_id, event_type, payload`,
    );
    let n = 0;
    for (const ev of events) {
      for (const h of this.handlers.values()) {
        const hit = h.fromEvent(ev.event_type, ev.payload ?? {});
        if (!hit) continue;
        const raw = isObj(ev.payload?._chain) ? (ev.payload._chain as Partial<Chain>) : null;
        const chain: Chain = raw && typeof raw.id === 'string' && Number.isInteger(raw.depth) && Array.isArray(raw.fired) ? { id: raw.id, depth: raw.depth as number, fired: raw.fired.filter((x): x is string => typeof x === 'string') } : { id: randomUUID(), depth: 0, fired: [] };
        try {
          n += await this.fire({ organizationId: ev.organization_id, isSuperAdmin: false }, h, hit.recordId, hit.trigger, hit.changed ?? [], chain, ev.id);
        } catch (e) {
          this.logger.warn(`rules for ${ev.event_type} ${ev.id}: ${(e as Error).message}`);
        }
      }
    }
    return n;
  }

  /** Runs the active rules of one trigger on one record. Returns how many matched. */
  async fire(ctx: CompanyContext, h: RecordTypeHandler, recordId: string, trigger: string, changed: string[], chain: Chain, eventId: string | null = null): Promise<number> {
    const org = ctx.organizationId;
    const sys = <T>(fn: (tx: Tx) => Promise<T>) =>
      this.tenantPrisma.forTenant(ctx, async (tx) => {
        await h.system(tx);
        return fn(tx);
      });
    const loaded = await sys((tx) => h.load(tx, org, recordId));
    if (!loaded) return 0;
    const rules = await sys(async (tx) => {
      const rs = await tx.rule.findMany({ where: { organizationId: org, recordType: h.key, status: 'active', scopeId: loaded.scopeId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
      if (!rs.length) return [];
      const vs = await tx.ruleVersion.findMany({ where: { organizationId: org, OR: rs.map((r) => ({ ruleId: r.id, version: r.currentVersion })) } });
      return rs.map((r) => ({ rule: r, v: vs.find((x) => x.ruleId === r.id && x.version === r.currentVersion)! })).filter((x) => x.v && (x.v.trigger as unknown as Trigger).type === trigger);
    });
    let matched = 0;
    for (const { rule, v } of rules) {
      const t = v.trigger as unknown as Trigger;
      if (t.fields?.length && !t.fields.some((f) => changed.includes(f))) continue;
      const started = Date.now();
      const record = (outcome: string, run: Partial<Run>) =>
        sys((tx) => tx.automationRun.create({ data: { organizationId: org, ruleId: rule.id, ruleVersion: v.version, recordType: h.key, recordId, trigger, eventId, chainId: chain.id, depth: chain.depth, outcome, trace: (run.trace ?? []) as unknown as Prisma.InputJsonValue, actions: (run.actions ?? []) as unknown as Prisma.InputJsonValue, error: run.error?.slice(0, 500) ?? null, durationMs: Date.now() - started } }));
      // Loop protection (YX-RULE-11, §10.1): never the same rule twice in one chain, and the chain stops at depth 3.
      if (chain.fired.includes(rule.id) || chain.depth >= MAX_DEPTH) {
        await record('loop_stopped', { error: chain.depth >= MAX_DEPTH ? `Stopped: rules changed this record ${MAX_DEPTH} times in a row` : 'Stopped: this rule already ran in this chain of changes' });
        if (chain.depth >= MAX_DEPTH) await h.tellAdmins(org, rule.scopeId, rule.id, rule.name, 'Rules kept changing the same record; the chain was stopped.');
        continue;
      }
      // Per-company limit per minute, then the rule's own limit per hour (US-G-051: the rule stops, the admin is told).
      const busy = await sys((tx) => tx.automationRun.count({ where: { organizationId: org, at: { gte: new Date(Date.now() - 60_000) }, outcome: { in: ['matched', 'not_matched', 'failed'] } } }));
      if (busy >= COMPANY_RUNS_PER_MINUTE) {
        await record('limit_stopped', { error: `Skipped: the company ran ${COMPANY_RUNS_PER_MINUTE} rules in the last minute` });
        continue;
      }
      const hourly = await sys((tx) => tx.automationRun.count({ where: { organizationId: org, ruleId: rule.id, outcome: 'matched', at: { gte: new Date(Date.now() - 3_600_000) } } }));
      if (hourly >= rule.maxRunsPerHour) {
        const why = `Paused: it ran ${rule.maxRunsPerHour} times in an hour, its limit`;
        await sys(async (tx) => {
          await tx.rule.updateMany({ where: { id: rule.id, status: 'active' }, data: { status: 'paused', pausedReason: why, version: { increment: 1 }, updatedAt: new Date() } });
          await AuditService.recordIn(tx, ctx, { actorUserId: null, action: 'rule.paused_at_limit', entityType: 'rule', entityId: rule.id, metadata: { limit: rule.maxRunsPerHour } });
        });
        await record('limit_stopped', { error: why });
        await h.tellAdmins(org, rule.scopeId, rule.id, rule.name, why);
        continue;
      }
      const fields = await sys((tx) => h.fields(tx, org, rule.scopeId));
      const current = await sys((tx) => h.load(tx, org, recordId));
      if (!current) return matched;
      const e = evaluate(v.condition as unknown as Group, current.values, fields, { hideActual: current.hide });
      if (!e.pass) {
        await record('not_matched', { trace: e.trace });
        continue;
      }
      const next: Chain = { id: chain.id, depth: chain.depth + 1, fired: [...chain.fired, rule.id] };
      const done: { type: string; result: string }[] = [];
      const hooks: { webhookId: string; index: number }[] = [];
      try {
        const runId = await sys(async (tx) => {
          CHAINS.set(tx, next);
          for (const a of v.actions as unknown as Action[]) {
            if (a.type === 'webhook') {
              hooks.push({ webhookId: a.webhookId as string, index: done.length });
              done.push({ type: 'webhook', result: 'Queued' });
            } else done.push({ type: a.type, result: await h.execute(tx, org, recordId, a, { id: rule.id, name: rule.name }) });
          }
          const run = await tx.automationRun.create({ data: { organizationId: org, ruleId: rule.id, ruleVersion: v.version, recordType: h.key, recordId, trigger, eventId, chainId: chain.id, depth: chain.depth, outcome: 'matched', trace: e.trace as unknown as Prisma.InputJsonValue, actions: done as unknown as Prisma.InputJsonValue, durationMs: Date.now() - started } });
          return run.id;
        });
        matched++;
        for (const hk of hooks) {
          await this.hooks.add('deliver', { org, runId, webhookId: hk.webhookId, index: hk.index, body: { event: `${h.key}.${trigger}`, rule: { id: rule.id, name: rule.name }, ...h.webhookBody(current, recordId) } }, { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: true, removeOnFail: 100 });
        }
      } catch (err) {
        // The actions rolled back together; the failure is the run's trace (US-B-131).
        const msg = err instanceof Error ? err.message : String(err);
        await record('failed', { trace: e.trace, actions: done, error: msg });
        await h.tellAdmins(org, rule.scopeId, rule.id, rule.name, `It failed: ${msg.slice(0, 200)}`);
      }
      if (rule.stopAfter) break;
    }
    return matched;
  }

  /** Job every 5 minutes: time rules ("no update for 24 hours"), once per record per change (§10.1). */
  async tick(now = new Date()): Promise<number> {
    const rules = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.rule.findMany({ where: { status: 'active' }, select: { id: true, organizationId: true, recordType: true, scopeId: true, currentVersion: true } }));
    let n = 0;
    for (const r of rules) {
      const h = this.handlers.get(r.recordType);
      if (!h) continue;
      const ctx: CompanyContext = { organizationId: r.organizationId, isSuperAdmin: false };
      try {
        const due = await this.tenantPrisma.forTenant(ctx, async (tx) => {
          await h.system(tx);
          const v = await tx.ruleVersion.findFirstOrThrow({ where: { organizationId: r.organizationId, ruleId: r.id, version: r.currentVersion } });
          const t = v.trigger as unknown as Trigger;
          if (!h.triggers.find((d) => d.key === t.type)?.time) return [];
          const cands = await h.timeCandidates(tx, r.organizationId, r.scopeId, t, now);
          const out: string[] = [];
          for (const c of cands.slice(0, 100)) {
            const ran = await tx.automationRun.findFirst({ where: { organizationId: r.organizationId, ruleId: r.id, recordId: c.id, trigger: t.type, at: { gte: c.since } }, select: { id: true } });
            if (!ran) out.push(c.id);
          }
          return out.map((id) => ({ id, type: t.type }));
        });
        for (const d of due) n += await this.fire(ctx, h, d.id, d.type, [], { id: randomUUID(), depth: 0, fired: [] });
      } catch (e) {
        this.logger.warn(`time rule ${r.id}: ${(e as Error).message}`);
      }
    }
    return n;
  }

  /** Nightly: the trace is kept 30 days (§5.3). */
  async retention(): Promise<number> {
    return this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => (await tx.automationRun.deleteMany({ where: { at: { lt: new Date(Date.now() - RETENTION_DAYS * 86_400_000) } } })).count);
  }

  // ------------------------------------------------------------------------------------------ webhooks

  /** A new webhook: https to a public host only; the signing secret is shown once and kept encrypted. */
  async createWebhook(tx: Tx, ctx: CompanyContext, by: string, name: string, url: string) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new BadRequestException('Enter a web address starting with https://.');
    }
    if (u.username || u.password) throw new BadRequestException('Leave user names and passwords out of the address; the request is signed instead.');
    await assertPublicHttpsHost(u);
    const secret = randomBytes(32).toString('base64url');
    const row = await tx.automationWebhook.create({ data: { organizationId: ctx.organizationId, name: name.trim(), url: u.toString(), secretEncrypted: this.crypto.encrypt(secret), createdBy: by } });
    await AuditService.recordIn(tx, ctx, { actorUserId: by, action: 'rule.webhook_created', entityType: 'automation_webhook', entityId: row.id, metadata: { name: row.name, host: u.host } });
    return { id: row.id, name: row.name, url: row.url, secret };
  }

  async setWebhookActive(tx: Tx, ctx: CompanyContext, by: string, id: string, active: boolean) {
    const n = await tx.automationWebhook.updateMany({ where: { organizationId: ctx.organizationId, id }, data: { active, version: { increment: 1 }, updatedAt: new Date() } });
    if (!n.count) throw new NotFoundException('No such webhook.');
    await AuditService.recordIn(tx, ctx, { actorUserId: by, action: active ? 'rule.webhook_on' : 'rule.webhook_off', entityType: 'automation_webhook', entityId: id });
    return { id, active };
  }

  async webhooks(tx: Tx, org: string) {
    return (await tx.automationWebhook.findMany({ where: { organizationId: org }, orderBy: { name: 'asc' } })).map((w) => ({ id: w.id, name: w.name, url: w.url, active: w.active }));
  }

  /** Signed POST (HMAC-SHA256 over "timestamp.body"), pinned to a public address, no redirects, 10 s limit. */
  private async deliver(job: Job<{ org: string; runId: string; webhookId: string; index: number; body: Record<string, unknown> }>) {
    const { org, runId, webhookId, index, body } = job.data;
    const ctx = { organizationId: org, isSuperAdmin: false };
    const hook = await this.tenantPrisma.forTenant(ctx, (tx) => tx.automationWebhook.findFirst({ where: { organizationId: org, id: webhookId } }));
    const note = (result: string) =>
      this.tenantPrisma.forTenant(ctx, async (tx) => {
        const run = await tx.automationRun.findFirst({ where: { organizationId: org, id: runId } });
        if (!run) return;
        const acts = run.actions as unknown as { type: string; result: string }[];
        if (acts[index]) acts[index].result = result;
        await tx.automationRun.update({ where: { id: run.id }, data: { actions: acts as unknown as Prisma.InputJsonValue } });
      });
    if (!hook?.active) return note('Not sent: the webhook is switched off');
    const payload = JSON.stringify({ ...body, sentAt: new Date().toISOString() });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = createHmac('sha256', this.crypto.decrypt(hook.secretEncrypted)).update(`${ts}.${payload}`).digest('hex');
    let status = 0;
    try {
      const res = await publicHttpsFetch(hook.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-yukthix-timestamp': ts, 'x-yukthix-signature': `sha256=${sig}`, 'user-agent': 'YukthiX-Rules/1' }, body: payload });
      status = res.status;
    } catch (e) {
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) await this.failed(org, runId, `Webhook failed: ${(e as Error).message}`, note);
      throw e;
    }
    if (status >= 200 && status < 300) return note(`Sent (HTTP ${status})`);
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) await this.failed(org, runId, `Webhook answered HTTP ${status}`, note);
    throw new Error(`HTTP ${status}`);
  }

  private async failed(org: string, runId: string, why: string, note: (r: string) => Promise<unknown>) {
    await note(`${why} after 3 tries`);
    const run = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => tx.automationRun.findFirst({ where: { organizationId: org, id: runId }, select: { ruleId: true, recordType: true } }));
    const rule = run && (await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => tx.rule.findFirst({ where: { organizationId: org, id: run.ruleId } })));
    if (rule) await this.handlers.get(rule.recordType)?.tellAdmins(org, rule.scopeId, rule.id, rule.name, why);
  }
}
