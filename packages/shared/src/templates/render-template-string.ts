const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Replaces `{{ key }}` tokens with `vars[key]`. Missing keys become an empty
 * string. Pure, never throws, HTML-agnostic (escaping is the caller's job).
 */
export function renderTemplateString(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(TOKEN, (_match, key: string) => vars[key] ?? '');
}
