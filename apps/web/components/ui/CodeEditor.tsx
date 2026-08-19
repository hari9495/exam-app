'use client';

import Editor from '@monaco-editor/react';
// Side-effect import: points the Monaco loader at self-hosted /monaco/vs before
// the editor mounts (see lib/monaco-setup.ts).
import '../../lib/monaco-setup';

interface CodeEditorProps {
  language: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  height?: string;
}

// Same dark "IDE chrome" (traffic-light dots + language badge) as the candidate
// exam page's code editor, so recruiters preview a snippet the way candidates see it.
export function CodeEditor({ language, value, onChange, ariaLabel, height = '200px' }: CodeEditorProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#2D2D2D]">
      <div className="flex items-center justify-between bg-[#1E1E1E] px-3 py-2">
        <span className="inline-flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
        </span>
        <span className="rounded bg-[#2D2D2D] px-2 py-0.5 text-[11px] font-semibold text-gray-300">{language}</span>
      </div>
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={(next) => onChange(next ?? '')}
        wrapperProps={{ 'aria-label': ariaLabel }}
        options={{ minimap: { enabled: false }, fontSize: 13, padding: { top: 12 } }}
        theme="vs-dark"
      />
    </div>
  );
}
