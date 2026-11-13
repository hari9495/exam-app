/**
 * Ask YukthiX platform settings (Console › Platform settings): each a default and a range. The model is a setting so
 * YukthiX can move to a newer Claude model without a release (the claude-api skill's current default).
 */
export const ASK_MODEL_KEY = 'help.assistant.model';
export const ASK_MODEL_DEFAULT = 'claude-opus-5-5';
/** A Claude model ID as the Models API names it (letters, digits and hyphens; no date suffix needed). */
export const ASK_MODEL_PATTERN = /^claude-[a-z0-9]+(-[a-z0-9]+){1,6}$/;

export const ASK_SETTINGS = {
  // Answer 2108: 50 questions per person per day.
  'help.assistant.daily_questions': { label: 'Ask YukthiX: questions per person per day', default: 50, min: 1, max: 500 },
  // Answer 2104: after this many unhelpful answers in a chat, the assistant offers a person.
  'help.assistant.unhelpful_handover': { label: 'Ask YukthiX: offer a person after this many unhelpful answers', default: 2, min: 1, max: 5 },
  // Conversations are deleted this many days after their last message.
  'help.assistant.keep_days': { label: 'Ask YukthiX: keep conversations for (days after the last message)', default: 90, min: 7, max: 730 },
} as const;
export type AskSettingKey = keyof typeof ASK_SETTINGS;
