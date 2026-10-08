'use client';

import { DeskSignUpScreen } from '@yukthix/ui/desk';
import { apiFetch } from '../../../lib/api-client';
import { botChallengeToken } from '../../../lib/bot-challenge';

// Public sign-up for a company that uses only the Service Desk (US-B-121): a 30-day trial, no card. The first admin
// sets a password from the email. Bot-checked (Turnstile, when configured) and rate-limited on the API.
export default function YxStartPage() {
  return (
    <DeskSignUpScreen
      signInHref="/yx/sign-in"
      onSubmit={async (input) => {
        const challengeToken = await botChallengeToken();
        await apiFetch('/desk/signup', { method: 'POST', body: JSON.stringify({ ...input, ...(challengeToken ? { challengeToken } : {}) }) });
      }}
    />
  );
}
