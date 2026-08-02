import { stringify } from 'csv-stringify/sync';
import { AuditLogEntry } from './audit-query.service';

const COLUMNS = [
  { key: 'createdAt', header: 'When' },
  { key: 'action', header: 'Action' },
  { key: 'entityType', header: 'Entity type' },
  { key: 'entityName', header: 'Entity name' },
  { key: 'entityId', header: 'Entity ID' },
  { key: 'actorEmail', header: 'Actor email' },
  { key: 'actorName', header: 'Actor name' },
  { key: 'actorRole', header: 'Actor role' },
  { key: 'metadata', header: 'Details' },
];

// Raw structured export -- action *keys*, not the frontend's prose labels, since
// the friendly-label map lives in apps/web (browser-only display strings) and
// duplicating it into the backend just to prettify a CSV isn't worth the drift
// risk. Auditors reviewing a full export tend to want the exact machine value
// anyway (it's grep-able), while the loaded-rows export in the UI already
// covers the human-readable case.
export function auditLogsToCsv(entries: AuditLogEntry[]): Buffer {
  const records = entries.map((entry) => ({
    createdAt: entry.createdAt.toISOString(),
    action: entry.action,
    entityType: entry.entityType,
    entityName: entry.entityName ?? '',
    entityId: entry.entityId ?? '',
    actorEmail: entry.actorEmail ?? '',
    actorName: entry.actorName ?? '',
    actorRole: entry.actorRole ?? '',
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : '',
  }));
  const csv = stringify(records, { header: true, columns: COLUMNS });
  return Buffer.from(csv, 'utf-8');
}
