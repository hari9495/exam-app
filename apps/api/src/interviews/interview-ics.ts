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
}): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//exam-app//interview//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${d.uid}`,
    `DTSTAMP:${toIcsUtc(new Date(0))}`,
    `DTSTART:${toIcsUtc(d.startsAt)}`,
    `DTEND:${toIcsUtc(d.endsAt)}`,
    `SUMMARY:${icsEscape(d.summary)}`,
    `LOCATION:${icsEscape(d.location)}`,
    `DESCRIPTION:${icsEscape(d.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
