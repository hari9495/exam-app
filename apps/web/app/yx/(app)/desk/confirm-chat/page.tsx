'use client';

import { useState } from 'react';
import { Button, InlineAlert } from '@yukthix/ui';
import { useDeskWrite } from '../../../../../lib/yx-desk';

// Founder decision 9 Oct 2026: an agent's claim, reply and note from Teams or Slack need a YukthiX second factor in the
// last 12 hours. The bot links here; confirming asks for the second factor (the usual step-up prompt), then the agent
// sends the command again in the chat app.
export default function YxDeskConfirmChatPage() {
  const write = useDeskWrite();
  const [state, setState] = useState<'ask' | 'busy' | 'done' | 'error'>('ask');
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setState('busy');
    try {
      await write('/me/chat-confirm', 'POST');
      setState('done');
    } catch (e) {
      setError((e as Error).message);
      setState('error');
    }
  };
  return (
    <div className="yx-ops-stack">
      <h1>Confirm it is you for Teams and Slack</h1>
      <p>Claiming, replying and adding notes from Teams or Slack need a second-factor check in YukthiX at least every 12 hours.</p>
      {state === 'done' ? (
        <InlineAlert tone="success" title="Confirmed">
          Send your command again in Teams or Slack. This lasts 12 hours.
        </InlineAlert>
      ) : (
        <div className="yx-ops-row">
          <Button variant="primary" loading={state === 'busy'} onClick={() => void confirm()}>
            Confirm it is me
          </Button>
        </div>
      )}
      {state === 'error' && error && <InlineAlert tone="danger">{error}</InlineAlert>}
    </div>
  );
}
