'use client';

import { AccessLogScreen, type AccessLog } from '@yukthix/ui/access';
import { loadState } from '../../../../../lib/yx-org';
import { usePeople } from '../../../../../lib/yx-people';

// Me › Who accessed my data (PPL-33; P02 §7, YX-SEC-09): looks by others at one's pay, identity and bank details.
export default function YxPrivacyPage() {
  const log = usePeople<AccessLog>('/me/access-log');
  return <AccessLogScreen state={loadState(log)} onRetry={() => void log.refetch()} log={log.data ?? null} />;
}
