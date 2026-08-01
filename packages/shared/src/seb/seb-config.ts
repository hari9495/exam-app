import { createHash } from 'crypto';

// Safe Exam Browser (SEB) config generation and Config Key verification.
//
// The .seb file is an XML plist of SEB settings. SEB computes a "Config Key" from those
// settings (SHA256 of a canonical JSON serialization, per the documented algorithm at
// https://safeexambrowser.org/developer/seb-config-key.html) and, when sendBrowserExamKey
// is enabled, sends `X-SafeExamBrowser-ConfigKeyHash: SHA256(absoluteRequestUrl + configKey)`
// with every request. Because WE generate the settings, we can compute the same Config Key
// server-side and verify a request really originates from SEB running OUR config -- a normal
// browser (or SEB with a doctored config) cannot produce the right hash.
//
// NOTE: the canonical-JSON rules are implemented from the published spec and covered by
// self-consistent unit tests; verify once against a real SEB client before enabling
// lockdownRequired for real candidates (tracked in ADO #6858).

// Processes SEB kills/refuses to run alongside. Windows (os:1) executables; extend as new
// tools show up in incidents. Matching is on executable name, case-insensitive, per SEB.
const PROHIBITED_EXECUTABLES = [
  'anydesk',
  'teamviewer',
  'tv_w32',
  'tv_x64',
  'rustdesk',
  'remoting_host', // Chrome Remote Desktop
  'msra', // Windows Remote Assistance
  'mstsc', // Remote Desktop Connection
  'vncviewer',
  'vncserver',
  'zoom',
  'discord',
  'whatsapp',
  'telegram',
  'slack',
  'skype',
  'ms-teams',
  'teams',
];

export interface SebConfigInput {
  // Absolute URL SEB opens on launch -- the candidate's own start link (with invite token).
  startUrl: string;
}

type SebValue = string | number | boolean | SebValue[] | { [key: string]: SebValue };

// The SEB settings dictionary. Deliberately minimal: kiosk mode, hash headers on, prohibited
// remote-access/messaging processes. Everything else keeps SEB's defaults.
function buildSettings(input: SebConfigInput): Record<string, SebValue> {
  return {
    startURL: input.startUrl,
    sebMode: 0,
    browserWindowWebView: 3,
    // The whole point: send the ConfigKey hash headers so the server can verify SEB + config.
    sendBrowserExamKey: true,
    // Kiosk: block task switching (createNewDesktop is SEB-Windows's strongest mode).
    createNewDesktop: true,
    killExplorerShell: false,
    allowQuit: true,
    quitURLConfirm: true,
    prohibitedProcesses: PROHIBITED_EXECUTABLES.map((executable) => ({
      active: true,
      currentUser: true,
      strongKill: true,
      os: 1,
      executable,
    })),
  };
}

// --- Canonical JSON serialization per the SEB Config Key spec -----------------------------
// Keys sorted alphabetically case-insensitively; no whitespace; booleans as true/false;
// strings JSON-escaped; nested dicts/arrays recursively serialized. (originatorVersion would
// be excluded, but we never emit it.)
function canonicalJson(value: SebValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function computeConfigKey(settings: Record<string, SebValue>): string {
  return createHash('sha256').update(canonicalJson(settings), 'utf8').digest('hex');
}

// What SEB sends per request in X-SafeExamBrowser-ConfigKeyHash.
export function requestConfigKeyHash(absoluteUrl: string, configKey: string): string {
  return createHash('sha256').update(absoluteUrl + configKey, 'utf8').digest('hex');
}

// --- Plist serialization ------------------------------------------------------------------
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function plistValue(value: SebValue, indent: string): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return `${indent}<array/>`;
    return `${indent}<array>\n${value.map((entry) => plistValue(entry, indent + '  ')).join('\n')}\n${indent}</array>`;
  }
  if (typeof value === 'object') {
    const entries = Object.keys(value)
      .map((key) => `${indent}  <key>${escapeXml(key)}</key>\n${plistValue(value[key], indent + '  ')}`)
      .join('\n');
    return `${indent}<dict>\n${entries}\n${indent}</dict>`;
  }
  if (typeof value === 'boolean') {
    return `${indent}<${value ? 'true' : 'false'}/>`;
  }
  if (typeof value === 'number') {
    return `${indent}<integer>${value}</integer>`;
  }
  return `${indent}<string>${escapeXml(value)}</string>`;
}

export interface SebConfig {
  // The .seb file contents (unencrypted plist XML -- SEB accepts plain plist configs).
  plistXml: string;
  // Hex Config Key for server-side request verification.
  configKey: string;
}

export function buildSebConfig(input: SebConfigInput): SebConfig {
  const settings = buildSettings(input);
  const plistXml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0">\n' +
    plistValue(settings, '') +
    '\n</plist>\n';
  return { plistXml, configKey: computeConfigKey(settings) };
}
