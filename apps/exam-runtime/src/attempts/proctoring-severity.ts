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
] as const;

type Severity = 'low' | 'medium' | 'high';

const SEVERITY_BY_EVENT_TYPE: Record<string, Severity> = {
  dev_tools_detected: 'high',
  multi_login: 'high',
  multi_monitor_detected: 'high',
  tab_switch: 'medium',
  fullscreen_exit: 'medium',
  copy_paste: 'medium',
  editor_paste: 'medium',
  window_blur: 'medium',
  right_click: 'low',
  refresh_warning: 'low',
  idle_timeout: 'low',
};

export function getProctoringEventSeverity(eventType: string): Severity {
  return SEVERITY_BY_EVENT_TYPE[eventType] ?? 'low';
}
