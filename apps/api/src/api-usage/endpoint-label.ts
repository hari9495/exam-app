// Stable, bounded-cardinality usage key: METHOD + the matched route TEMPLATE (e.g.
// "GET /public/exams/:id"), never the concrete URL (which would interpolate ids and
// explode cardinality). routePath comes from Express's req.route.path at record time.
export function endpointLabel(method: string, routePath: string | undefined): string {
  return `${method.toUpperCase()} ${routePath ?? 'unknown'}`;
}
