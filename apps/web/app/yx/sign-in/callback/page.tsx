'use client';

import { YxSignIn } from '../yx-sign-in';

// Back from "Continue with Google / Microsoft": the API sent the browser here with a single-use code
// in the fragment. Signed in, the second step, the company choice -- or the sign-in screen again.
export default function YxSignInCallbackPage() {
  return <YxSignIn callback />;
}
