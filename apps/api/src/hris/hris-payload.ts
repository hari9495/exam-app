// The structured "employee / hire" record posted to an org's HRIS on hire. Deliberately generic
// (works with any HRIS inbound API, an iPaaS like Merge/Workato, or Zapier) rather than
// vendor-specific. Snapshotted at hire time into HrisExportDelivery.payloadJson.
export interface HrisHireData {
  organizationId: string;
  hiredAt: Date;
  candidate: { id: string; name: string; email: string; phone: string | null };
  job: { id: string; title: string; department: string | null };
  offer: { compensation: string; startDate: string } | null;
}

export function buildHrisEmployeePayload(data: HrisHireData): Record<string, unknown> {
  return {
    event: 'candidate.hired',
    hiredAt: data.hiredAt.toISOString(),
    organizationId: data.organizationId,
    candidate: {
      id: data.candidate.id,
      name: data.candidate.name,
      email: data.candidate.email,
      phone: data.candidate.phone ?? null,
    },
    job: { id: data.job.id, title: data.job.title, department: data.job.department ?? null },
    offer: data.offer,
  };
}
