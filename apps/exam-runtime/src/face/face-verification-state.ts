import { MismatchVoter } from './mismatch-voter';

// Module-scope, not instance-scope, on purpose. main.ts boots TWO separate Nest application
// containers in the same process (the public app and InternalAppModule for the recruiter/
// force-submit port) -- see main.ts:22 and :36. FaceModule is reachable from both (AppModule
// directly, and InternalAppModule -> InternalModule -> GradingModule -> FaceModule), so Nest
// constructs two independent FaceVerificationService instances with two independent DI graphs.
// If this per-attempt state lived on `this` inside that class, each instance would keep its own
// map: a voter accumulated during the exam (public app, port 3002) would be invisible to
// forgetAttempt() when finalize() runs under the internal app's force-submit path (port 3003),
// so it would clear an always-empty map and leak the real entry forever.
//
// A plain Node module is a singleton within one process, imported once and cached, regardless of
// how many times a framework constructs a class that reads it -- so keeping this state here
// instead of on the class makes both Nest containers observe the same maps without sharing a
// single service instance across two otherwise-independent app bootstraps.
export const voters = new Map<string, MismatchVoter>();
export const warnedModelUnavailableFor = new Set<string>();
export const warnedMissingEmbeddingFor = new Set<string>();

// ponytail: test-only reset hook -- spec files import this same module-level state (there is
// only one copy per process), so tests need a way to clear it between cases instead of relying
// on a fresh instance, which no longer isolates them.
export function __resetFaceVerificationStateForTests(): void {
  voters.clear();
  warnedModelUnavailableFor.clear();
  warnedMissingEmbeddingFor.clear();
}
