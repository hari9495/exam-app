import { createHash } from 'crypto';

// TIM-13 kiosk face sign-in (rule 14): a provider adapter. Provider: to decide. YukthiX keeps only the provider's
// reference and the person's consent, never an image. KIOSK_FACE_PROVIDER=dev-fake picks the laptop fake (refused in
// production); unset means face sign-in is not available on this server.

export interface FaceMatchProvider {
  readonly name: string;
  /** Enrols a face for one person; returns the provider's reference to keep. */
  enrol(org: string, employeeId: string, image: Buffer): Promise<string>;
  /** Who among the enrolled people this face is (1:N), or null when no one matches well enough. */
  identify(org: string, image: Buffer, enrolled: readonly { employeeId: string; providerRef: string }[]): Promise<string | null>;
  /** Removes the provider's copy when consent is withdrawn. */
  forget(org: string, providerRef: string): Promise<void>;
}

/** Laptop fake: the "face" matches when the same bytes are shown again. */
export class DevFakeFaceMatch implements FaceMatchProvider {
  readonly name = 'dev-fake';
  constructor() {
    if (process.env.NODE_ENV === 'production') throw new Error('Kiosk face match: the dev fake cannot run in production. Choose a provider (DECISION NEEDED).');
  }
  private ref(org: string, image: Buffer) {
    return createHash('sha256').update(org).update(image).digest('hex');
  }
  async enrol(org: string, _employeeId: string, image: Buffer) {
    return this.ref(org, image);
  }
  async identify(org: string, image: Buffer, enrolled: readonly { employeeId: string; providerRef: string }[]) {
    const r = this.ref(org, image);
    return enrolled.find((e) => e.providerRef === r)?.employeeId ?? null;
  }
  async forget() {}
}

export const FACE_MATCH = Symbol('FACE_MATCH');
export const faceMatchFromEnv = (env = process.env): FaceMatchProvider | null => (env.KIOSK_FACE_PROVIDER === 'dev-fake' ? new DevFakeFaceMatch() : null);
