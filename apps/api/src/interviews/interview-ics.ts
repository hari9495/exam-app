function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function toIcsUtc(d: Date): string {
  // YYYYMMDDTHHMMSSZ
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildInterviewIcs(d: {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  location: string;
  description: string;
  // For calendar sync: a CANCEL retracts the previously-sent invite. Clients match on UID and
  // apply the update only when SEQUENCE is higher, so a cancel must carry sequence >= the request's.
  method?: 'REQUEST' | 'CANCEL';
  sequence?: number;
}): string {
  const method = d.method ?? 'REQUEST';
  const sequence = d.sequence ?? 0;
  const status = method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//exam-app//interview//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${d.uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${toIcsUtc(new Date(0))}`,
    `DTSTART:${toIcsUtc(d.startsAt)}`,
    `DTEND:${toIcsUtc(d.endsAt)}`,
    `SUMMARY:${icsEscape(d.summary)}`,
    `LOCATION:${icsEscape(d.location)}`,
    `DESCRIPTION:${icsEscape(d.description)}`,
    `STATUS:${status}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
