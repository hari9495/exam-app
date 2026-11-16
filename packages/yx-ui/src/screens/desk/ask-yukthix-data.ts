import type { AskConversationView, AskState } from './ask-yukthix';

// Samples for the Ask YukthiX stories and tests (answers 2101 to 2108).
export const ASK_CHAT: AskConversationView = {
  id: 'c1',
  ticketRef: null,
  featureRequestSent: false,
  offerPerson: false,
  messages: [
    { id: 'u1', role: 'user', text: 'How do I apply for half a day of leave?', sources: [], outcome: null, feedback: null },
    {
      id: 'a1',
      role: 'assistant',
      text: '1. Open Leave and press Apply.\n2. Choose the day, then First half or Second half.\n3. Press Send for approval. Your manager approves it.',
      sources: [{ title: 'Apply for leave', href: '/yx/help/yukthix/yukthix-help/apply-for-leave' }],
      outcome: 'answered',
      feedback: null,
    },
  ],
};

export const ASK_UNSURE: AskConversationView = {
  ...ASK_CHAT,
  offerPerson: true,
  messages: [
    ...ASK_CHAT.messages,
    { id: 'u2', role: 'user', text: 'Why was my leave balance cut by two days last month?', sources: [], outcome: null, feedback: null },
    { id: 'a2', role: 'assistant', text: 'Someone needs to look at your leave records to answer this. Raise a support ticket and this chat goes with it.', sources: [], outcome: 'needs_person', feedback: 'down' },
  ],
};

export const ASK_STATE: AskState = { on: true, limit: 50, remaining: 47, canRaiseTicket: true, conversation: ASK_CHAT };
