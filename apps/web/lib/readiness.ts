import type { SystemCheck } from '@yukthix/ui/assessments';

// AS-4b (PRC-22): the candidate's computer, checked in the browser before the test. The checks are decided from what the
// browser can tell (probes below) and what this test needs; nothing is saved or sent, and the start checks again.

export interface Probe {
  /** null: not needed for this test (not asked). */
  camera: 'ok' | 'denied' | 'missing' | null;
  /** window.screen.isExtended: true = more than one display; undefined = the browser cannot tell. */
  extendedDisplay: boolean | undefined;
  /** The browser can record the screen (needed only when the test records it). */
  screenShareSupported: boolean;
  /** In Safe Exam Browser (needed only when the test requires it). */
  inSeb: boolean;
  secureContext: boolean;
  /** Round trip to the test server in ms; null when it could not be reached. */
  delayMs: number | null;
  cores: number | null;
}

export interface Needs {
  camera: boolean;
  screenShare: boolean;
  seb: boolean;
  watchesDisplays: boolean;
}

const SLOW_MS = 600;

export function readinessChecks(p: Probe, n: Needs): SystemCheck[] {
  const checks: SystemCheck[] = [];
  if (n.camera)
    checks.push(
      p.camera === 'ok'
        ? { id: 'camera', label: 'Camera', status: 'pass', detail: 'Camera found and allowed.', blocking: true }
        : {
            id: 'camera',
            label: 'Camera',
            status: 'fail',
            blocking: true,
            detail: p.camera === 'missing' ? 'No camera was found.' : 'The camera was not allowed.',
            fix: p.camera === 'missing' ? ['Connect a camera, or use a laptop with one.', 'Run the check again.'] : ['Select the camera icon in the address bar and choose "Allow".', 'Close other apps that use the camera.', 'Run the check again.'],
          },
    );
  if (n.watchesDisplays)
    checks.push(
      p.extendedDisplay === true
        ? { id: 'displays', label: 'Displays', status: 'fail', blocking: true, detail: 'More than one display is connected.', fix: ['Unplug the extra display, or switch to one display in your settings.', 'Run the check again.'] }
        : { id: 'displays', label: 'Displays', status: 'pass', blocking: true, detail: p.extendedDisplay === false ? 'One display connected.' : 'Your browser does not say; use one display.' },
    );
  if (n.screenShare)
    checks.push(
      p.screenShareSupported
        ? { id: 'screen', label: 'Screen share', status: 'pass', blocking: true, detail: 'This browser can share your screen. You will be asked at the start.' }
        : { id: 'screen', label: 'Screen share', status: 'fail', blocking: true, detail: 'This browser cannot share your screen.', fix: ['Use desktop Chrome, Edge or Firefox on a computer.'] },
    );
  const browserOk = p.secureContext && (!n.seb || p.inSeb);
  checks.push(
    browserOk
      ? { id: 'browser', label: n.seb ? 'Browser and Safe Exam Browser' : 'Browser', status: 'pass', blocking: true, detail: n.seb ? 'Safe Exam Browser found.' : 'This browser can run the test.' }
      : {
          id: 'browser',
          label: n.seb ? 'Browser and Safe Exam Browser' : 'Browser',
          status: 'fail',
          blocking: true,
          detail: !p.secureContext ? 'This page is not on a secure connection.' : 'This test needs Safe Exam Browser.',
          fix: !p.secureContext ? ['Open the test from the link in your invitation email.'] : ['Go back to your test page and download the exam configuration.', 'Open it: Safe Exam Browser brings you back here.'],
        },
  );
  checks.push(
    p.delayMs == null
      ? { id: 'network', label: 'Network', status: 'fail', blocking: true, detail: 'We could not reach the test server.', fix: ['Check your internet connection.', 'Run the check again.'] }
      : p.delayMs > SLOW_MS
        ? { id: 'network', label: 'Network', status: 'warn', detail: `Delay ${Math.round(p.delayMs)} ms. The test works, but slowly.`, fix: ['Move closer to your Wi-Fi router or use a cable.', 'Pause downloads and video calls.'] }
        : { id: 'network', label: 'Network', status: 'pass', blocking: true, detail: `Delay ${Math.round(p.delayMs)} ms.` },
  );
  checks.push(
    p.cores != null && p.cores < 2
      ? { id: 'device', label: 'Device', status: 'warn', detail: 'This computer is slow; close other apps before the test.' }
      : { id: 'device', label: 'Device', status: 'pass', detail: p.cores ? `${p.cores} processor cores.` : 'Device checked.' },
  );
  return checks;
}

/** What the browser can tell (asks for the camera only when the test needs it, and stops it at once). */
export async function runProbes(needs: Needs, ping: () => Promise<unknown>): Promise<Probe> {
  let camera: Probe['camera'] = null;
  if (needs.camera) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      camera = 'ok';
    } catch (e) {
      camera = (e as { name?: string }).name === 'NotFoundError' ? 'missing' : 'denied';
    }
  }
  let delayMs: number | null = null;
  try {
    const t0 = performance.now();
    await ping();
    delayMs = performance.now() - t0;
  } catch {
    delayMs = null;
  }
  return {
    camera,
    extendedDisplay: (window.screen as Screen & { isExtended?: boolean }).isExtended,
    screenShareSupported: typeof navigator.mediaDevices?.getDisplayMedia === 'function',
    inSeb: navigator.userAgent.includes('SEB'),
    secureContext: window.isSecureContext !== false,
    delayMs,
    cores: navigator.hardwareConcurrency ?? null,
  };
}
