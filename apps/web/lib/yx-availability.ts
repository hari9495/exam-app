// T2-G (6.5): the app shows the designed "down for maintenance" page instead of the page itself only while a planned
// window is on now (the last answer the app had) and the API no longer answers.
export type MaintenanceNow = { phase: 'upcoming' | 'now'; title: string; startsAt: string; endsAt: string } | null | undefined;

export function downForMaintenance(m: MaintenanceNow, apiFailing: boolean, now = new Date()): boolean {
  return Boolean(apiFailing && m && new Date(m.startsAt) <= now && now < new Date(m.endsAt));
}
