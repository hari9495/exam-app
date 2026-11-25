import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Assessments AS-0 (founder answer 2004): whose test results a person reads.
//   all  - test writers, recruiters (pipeline:manage), hiring admins (ats.headcount.manage) and auditors: every candidate
//          of the company;
//   own  - anyone else who may read results (a Hiring manager: asmt.results.view / ats.assessment.view): only candidates
//          who applied to one of their own jobs (they are its hiring manager, or they opened it);
//   none - no results at all (an Interview coordinator reading the hiring pages with candidate view only).
// A route that returns results marks itself with @ScopesResults(); PermissionsGuard works it out once per request, and
// @ResultsScopeOf() reads it ('none' unless the guard said otherwise, so a missed route fails closed).

export type ResultsScope = { mode: 'all' } | { mode: 'own'; userId: string } | { mode: 'none' };

/** The keys that read every candidate's results. */
export const RESULTS_ALL_KEYS = ['exam:manage', 'pipeline:manage', 'ats.headcount.manage', 'audit:view'] as const;
/** The key that reads results at all (directly or through its aliases). */
export const RESULTS_KEY = 'results:view';

export const SCOPES_RESULTS = 'scopesResults';
export const ScopesResults = () => SetMetadata(SCOPES_RESULTS, true);
export const ResultsScopeOf = createParamDecorator((_d: unknown, ctx: ExecutionContext): ResultsScope => ctx.switchToHttp().getRequest().resultsScope ?? { mode: 'none' });

/** The scope from the keys a person holds (aliases already applied). */
export function scopeFrom(granted: ReadonlySet<string>, userId: string | null | undefined): ResultsScope {
  if (RESULTS_ALL_KEYS.some((k) => granted.has(k))) return { mode: 'all' };
  if (granted.has(RESULTS_KEY) && userId) return { mode: 'own', userId };
  return { mode: 'none' };
}

/** The candidates of a person's own jobs (they are its hiring manager, or they opened it; deleted jobs never count). */
const ownJobs = (userId: string): Prisma.PipelineEntryListRelationFilter => ({ some: { job: { deletedAt: null, OR: [{ hiringManagerId: userId }, { createdById: userId }] } } });

/** A filter on invitations (and so their attempts and results) to the candidates this scope reads. */
export function invitationsInScope(scope: ResultsScope | undefined): Prisma.InvitationWhereInput {
  if (!scope || scope.mode === 'all') return {};
  if (scope.mode === 'none') return { id: { in: [] } };
  return { candidate: { pipelineEntries: ownJobs(scope.userId) } };
}

/** A filter on candidates to those whose results this scope reads. */
export function candidatesInScope(scope: ResultsScope | undefined): Prisma.CandidateWhereInput {
  if (!scope || scope.mode === 'all') return {};
  if (scope.mode === 'none') return { id: { in: [] } };
  return { pipelineEntries: ownJobs(scope.userId) };
}

/** On a controller of company-wide test numbers: only people who read every candidate's results (answer 2004). */
@Injectable()
export class CompanyWideResultsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const scope = context.switchToHttp().getRequest().resultsScope as ResultsScope | undefined;
    if (scope?.mode !== 'all') throw new ForbiddenException('Company-wide test numbers are for recruiters and the people who write tests. Open a job to see the results of its candidates.');
    return true;
  }
}
