export const CLIENT_REPORTABLE_EVENT_TYPES = [
  'tab_switch',
  'fullscreen_exit',
  'copy_paste',
  'right_click',
  'dev_tools_detected',
  'refresh_warning',
  'idle_timeout',
  'editor_paste',
  'window_blur',
  'multi_monitor_detected',
  'looking_down',
  'screen_share_started',
  'screen_share_stopped',
] as const;

type Severity = 'low' | 'medium' | 'high';

const SEVERITY_BY_EVENT_TYPE: Record<string, Severity> = {
  dev_tools_detected: 'high',
  multi_login: 'high',
  multi_monitor_detected: 'high',
  // Server-generated only (AI screen analysis) -- deliberately NOT client-reportable and NOT
  // strike-worthy: an AI false positive must flag for recruiter review, never auto-punish.
  remote_access_suspected: 'high',
  screen_share_stopped: 'high',
  tab_switch: 'medium',
  fullscreen_exit: 'medium',
  copy_paste: 'medium',
  editor_paste: 'medium',
  window_blur: 'medium',
  looking_down: 'medium',
  right_click: 'low',
  refresh_warning: 'low',
  idle_timeout: 'low',
  webcam_snapshot: 'low',
  screen_share_started: 'low',
};

export const STRIKE_WORTHY_EVENT_TYPES: ReadonlySet<string> = new Set([
  'tab_switch',
  'window_blur',
  'fullscreen_exit',
  'copy_paste',
  'right_click',
  'dev_tools_detected',
  'multi_monitor_detected',
  'idle_timeout',
  'screen_share_stopped',
]);

export function isStrikeWorthy(eventType: string): boolean {
  return STRIKE_WORTHY_EVENT_TYPES.has(eventType);
}

export function getProctoringEventSeverity(eventType: string): Severity {
  return SEVERITY_BY_EVENT_TYPE[eventType] ?? 'low';
}
