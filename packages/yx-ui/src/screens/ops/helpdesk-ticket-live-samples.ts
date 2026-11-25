// Sample `live` data for the HLP-03 stories of states the real ticket workspace has (the side cards, collaborator and
// read-only views, an unproven email sender, resolved, no access) and for the tests. Not used by the app. The side
// cards (`rail`) are drawn in hlp-03.stories.tsx itself, so the design guards see them.
import { CANNED, CONTEXT, DETAIL, TICKET, TIMELINE, WORK } from '../desk/data';
import type { LiveTicket } from './helpdesk-ticket-live';

const ok = async () => undefined;

export function liveTicket(over: Partial<LiveTicket> = {}): LiveTicket {
  return {
    state: 'ready',
    onRetry: () => undefined,
    ticket: TICKET,
    detail: DETAIL,
    work: WORK,
    canned: CANNED,
    timeline: TIMELINE,
    context: CONTEXT,
    others: [],
    meName: 'Suresh Pillai',
    meId: 'u-suresh',
    onUpdate: ok,
    onAssign: ok,
    onPost: ok,
    onUpload: async () => ({ ...TICKET.attachments[0], id: 'n', scanStatus: 'pending', messageId: null }),
    onOpenFile: ok,
    onAddTime: ok,
    onRunScenario: ok,
    onConvert: ok,
    onAddCollaborator: ok,
    onRemoveCollaborator: ok,
    onAddWatcher: ok,
    onRemoveWatcher: ok,
    onSearchPeople: async () => [],
    onTyping: () => undefined,
    onOpenTicket: () => undefined,
    onResolveClick: () => undefined,
    onEscalateClick: () => undefined,
    onFindArticle: async () => [],
    ...over,
  };
}
