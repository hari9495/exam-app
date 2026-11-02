import type { LiveSplit, SplitLineInput } from '@yukthix/ui/frame';

/** PPL-46: GET people/employees/:id/pay-split as the API sends it (dates as text). */
export interface PaySplitView {
  accounts: { account: string; label: string; usableFrom: string }[];
  current: { lines: SplitLineInput[]; usableFrom: string } | null;
  waiting: boolean;
  net: number | null;
}

/** The designed split card's data; `onSend` absent keeps it read only (the Pay tab). */
export const liveSplit = (v: PaySplitView, onSend?: (lines: SplitLineInput[]) => Promise<void>): LiveSplit => ({
  accounts: v.accounts.map((a) => ({ account: a.account, label: a.label })),
  current: v.current ? { lines: v.current.lines, usableFrom: new Date(v.current.usableFrom) } : null,
  waiting: v.waiting,
  net: v.net,
  ...(onSend ? { onSend } : {}),
});
