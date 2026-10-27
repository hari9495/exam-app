import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  ALargeSmall,
  Baseline,
  Bold,
  Braces,
  Check,
  Code,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  MoreHorizontal,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import { cx } from '../lib/cx';
import { Button, IconButton } from './button';
import { FormField, useFieldControl } from './field';
import { Icon, type IconComponent } from './foundations';
import { TextField } from './inputs';
import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from './menu';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './popover';
import { Segment } from './segment';

export interface MergeField {
  /** Path inserted as {{value}}, e.g. "employee.name". */
  value: string;
  /** Shown in the menu: "Employee name". */
  label: string;
}

export const DEFAULT_MERGE_FIELDS: MergeField[] = [
  { value: 'employee.name', label: 'Employee name' },
  { value: 'employee.designation', label: 'Designation' },
  { value: 'employee.joining_date', label: 'Joining date' },
  { value: 'employee.ctc', label: 'Annual CTC' },
  { value: 'manager.name', label: 'Reporting manager' },
  { value: 'company.name', label: 'Company name' },
];

/** A toolbar button; `hide` takes these. */
export type EditorTool =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'orderedList'
  | 'highlight'
  | 'color'
  | 'fontSize'
  | 'quote'
  | 'link'
  | 'code'
  | 'undo'
  | 'redo';

/** For editors whose server keeps no inline styles (the service desk's HTML allow-list). */
export const STYLE_TOOLS: EditorTool[] = ['highlight', 'color', 'fontSize'];

// Preset lists only, never free input: the letters API accepts exactly these (apps/api documents/letters/dto.ts).
// Highlights are Word's own highlight colours, so a letter looks the same in the editor, in Word and in the PDF.
export const TEXT_COLOURS = [
  { value: '#595959', label: 'Grey' },
  { value: '#C00000', label: 'Red' },
  { value: '#C55A11', label: 'Orange' },
  { value: '#548235', label: 'Green' },
  { value: '#2F5496', label: 'Blue' },
  { value: '#7030A0', label: 'Purple' },
];
export const HIGHLIGHT_COLOURS = [
  { value: '#FFFF00', label: 'Yellow' },
  { value: '#00FF00', label: 'Green' },
  { value: '#00FFFF', label: 'Turquoise' },
  { value: '#C0C0C0', label: 'Grey' },
];
/** '' is the normal size (no font-size mark). */
export const FONT_SIZES = [
  { value: '9pt', label: 'Small' },
  { value: '', label: 'Normal' },
  { value: '14pt', label: 'Large' },
  { value: '18pt', label: 'Extra large' },
];

const MERGE_RE = /\{\{\s*[#/^]?[\w.]+\s*\}\}/g;

/** Highlights {{merge.fields}} and {{#section}} tags without changing the stored HTML, so templates stay plain text. */
const MergeFieldHighlight = Extension.create({
  name: 'yxMergeFieldHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('yxMergeFieldHighlight'),
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              for (const m of node.text.matchAll(MERGE_RE)) {
                decos.push(Decoration.inline(pos + m.index, pos + m.index + m[0].length, { class: 'yx-editor__merge' }));
              }
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});

export interface RichTextEditorProps {
  /** HTML. */
  value?: string;
  defaultValue?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  /** Shows the formatted content without the toolbar. */
  readOnly?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** Fields offered by "Insert field". Pass [] to hide the button. */
  mergeFields?: MergeField[];
  /** Buttons this place can't keep, e.g. letters hide 'code'. */
  hide?: EditorTool[];
  id?: string;
  /** Needed only outside a FormField. */
  'aria-label'?: string;
  className?: string;
}

/** Letter and message editor (TipTap). Put it inside <FormField> for label, help and error. */
export function RichTextEditor({
  value,
  defaultValue = '',
  onChange,
  placeholder = 'Start typing',
  readOnly,
  disabled,
  required,
  mergeFields = DEFAULT_MERGE_FIELDS,
  hide,
  id,
  'aria-label': ariaLabel,
  className,
}: RichTextEditorProps) {
  const { controlProps } = useFieldControl({ id, required, disabled });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [labelId, setLabelId] = useState<string | undefined>();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
      TextStyle,
      Color,
      FontSize,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder }),
      MergeFieldHighlight,
    ],
    content: value ?? defaultValue,
    editable: !readOnly && !disabled,
    onUpdate: ({ editor: e }) => onChangeRef.current?.(e.getHTML()),
  });

  // A <label for> can't name a contenteditable, so point aria-labelledby at the FormField label.
  useEffect(() => {
    const lbl = Array.from(document.getElementsByTagName('label')).find((l) => l.htmlFor === controlProps.id);
    if (!lbl) return;
    if (!lbl.id) lbl.id = `${controlProps.id}-label`;
    setLabelId(lbl.id);
  }, [controlProps.id]);

  const invalid = controlProps['aria-invalid'];
  const describedBy = controlProps['aria-describedby'];
  useEffect(() => {
    if (!editor) return;
    const attributes: Record<string, string> = {
      id: controlProps.id,
      class: 'yx-editor__content',
      role: 'textbox',
      'aria-multiline': 'true',
    };
    if (labelId) attributes['aria-labelledby'] = labelId;
    else if (ariaLabel) attributes['aria-label'] = ariaLabel;
    if (describedBy) attributes['aria-describedby'] = describedBy;
    if (invalid) attributes['aria-invalid'] = 'true';
    if (required) attributes['aria-required'] = 'true';
    if (readOnly || disabled) attributes['aria-readonly'] = 'true';
    editor.setOptions({ editorProps: { ...editor.options.editorProps, attributes } });
    editor.setEditable(!readOnly && !disabled, false);
  }, [editor, controlProps.id, labelId, ariaLabel, describedBy, invalid, required, readOnly, disabled]);

  // Controlled value from outside (e.g. switching templates).
  useEffect(() => {
    if (editor && value != null && value !== editor.getHTML()) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div
      className={cx('yx-editor', className)}
      data-invalid={invalid}
      data-readonly={readOnly || undefined}
      data-disabled={disabled || undefined}
    >
      {editor && !readOnly && <Toolbar editor={editor} mergeFields={mergeFields} hide={hide} disabled={disabled} />}
      <EditorContent editor={editor} className="yx-editor__area" />
    </div>
  );
}

type Chain = ReturnType<Editor['chain']>;
interface Tool {
  key: EditorTool;
  label: string;
  icon: IconComponent;
  /** Toggles have a pressed state; undo and redo don't. */
  active?: boolean;
  disabled?: boolean;
  apply?: (c: Chain) => Chain;
  /** A picker: its panel opens in a popover. */
  panel?: (close: () => void) => ReactNode;
}
type Slot = Tool | 'divider';

function Toolbar({ editor, mergeFields, hide = [], disabled }: { editor: Editor; mergeFields: MergeField[]; hide?: EditorTool[]; disabled?: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      highlight: (e.getAttributes('highlight').color as string | undefined) ?? '',
      color: (e.getAttributes('textStyle').color as string | undefined) ?? '',
      fontSize: (e.getAttributes('textStyle').fontSize as string | undefined) ?? '',
      quote: e.isActive('blockquote'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      href: (e.getAttributes('link').href as string | undefined) ?? '',
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  // Which picker is open, and whether from its own button or from the "More formatting" menu.
  const [picker, setPicker] = useState<{ key: EditorTool; at: 'bar' | 'more' } | null>(null);
  const close = () => setPicker(null);
  const run = (fn: (c: Chain) => Chain) => fn(editor.chain().focus()).run();

  const groups: Tool[][] = [
    [
      { key: 'bold', label: 'Bold', icon: Bold, active: s.bold, apply: (c) => c.toggleBold() },
      { key: 'italic', label: 'Italic', icon: Italic, active: s.italic, apply: (c) => c.toggleItalic() },
      { key: 'underline', label: 'Underline', icon: Underline, active: s.underline, apply: (c) => c.toggleUnderline() },
      { key: 'strike', label: 'Strikethrough', icon: Strikethrough, active: s.strike, apply: (c) => c.toggleStrike() },
    ],
    [
      { key: 'heading2', label: 'Heading 2', icon: Heading2, active: s.h2, apply: (c) => c.toggleHeading({ level: 2 }) },
      { key: 'heading3', label: 'Heading 3', icon: Heading3, active: s.h3, apply: (c) => c.toggleHeading({ level: 3 }) },
      { key: 'bulletList', label: 'Bulleted list', icon: List, active: s.bullet, apply: (c) => c.toggleBulletList() },
      { key: 'orderedList', label: 'Numbered list', icon: ListOrdered, active: s.ordered, apply: (c) => c.toggleOrderedList() },
    ],
    [
      {
        key: 'highlight',
        label: 'Highlight',
        icon: Highlighter,
        active: Boolean(s.highlight),
        panel: (done) => (
          <Swatches label="Highlight" none="No highlight" colours={HIGHLIGHT_COLOURS} value={s.highlight} onPick={(v) => (run((c) => (v ? c.setHighlight({ color: v }) : c.unsetHighlight())), done())} />
        ),
      },
      {
        key: 'color',
        label: 'Text colour',
        icon: Baseline,
        active: Boolean(s.color),
        panel: (done) => (
          <Swatches label="Text colour" none="Default colour" colours={TEXT_COLOURS} value={s.color} onPick={(v) => (run((c) => (v ? c.setColor(v) : c.unsetColor())), done())} />
        ),
      },
      {
        key: 'fontSize',
        label: 'Font size',
        icon: ALargeSmall,
        active: Boolean(s.fontSize),
        panel: () => (
          <div className="yx-editor__panel">
            <Segment label="Font size" options={FONT_SIZES} value={s.fontSize} onChange={(v) => (v ? editor.chain().setFontSize(v).run() : editor.chain().unsetFontSize().run())} />
          </div>
        ),
      },
    ],
    [
      { key: 'quote', label: 'Quote', icon: Quote, active: s.quote, apply: (c) => c.toggleBlockquote() },
      { key: 'link', label: 'Link', icon: Link2, active: s.link, panel: (done) => <LinkPanel editor={editor} active={s.link} href={s.href} done={done} /> },
      { key: 'code', label: 'Code', icon: Code, active: s.code, apply: (c) => c.toggleCode() },
    ],
    [
      { key: 'undo', label: 'Undo', icon: Undo2, disabled: !s.canUndo, apply: (c) => c.undo() },
      { key: 'redo', label: 'Redo', icon: Redo2, disabled: !s.canRedo, apply: (c) => c.redo() },
    ],
  ];
  const slots: Slot[] = groups
    .map((g) => g.filter((t) => !hide.includes(t.key)))
    .filter((g) => g.length)
    .flatMap((g, i) => (i ? ['divider' as const, ...g] : g));

  // Buttons that don't fit move into "More formatting". Each slot's right edge is measured once with all of them shown
  // (the buttons don't change size), so a resize only recounts.
  const toolsRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const ends = useRef<number[]>([]);
  const measuredFor = useRef('');
  const [shown, setShown] = useState(slots.length);
  const refocus = useRef(false);
  const key = slots.map((t) => (t === 'divider' ? '|' : t.key)).join();
  useLayoutEffect(() => {
    const el = toolsRef.current;
    if (!el) return;
    if (measuredFor.current !== key) {
      if (shown !== slots.length) {
        setShown(slots.length);
        return;
      }
      measuredFor.current = key;
      ends.current = [];
    }
    const fit = () => {
      // Measured once laid out (a hidden toolbar measures 0), while every slot is still shown.
      if (!ends.current[slots.length - 1]) {
        const kids = [...el.children] as HTMLElement[];
        ends.current = kids.slice(0, slots.length).map((k) => k.offsetLeft - kids[0].offsetLeft + k.offsetWidth);
      }
      const e = ends.current;
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      let n = slots.length;
      if (e[n - 1] > el.clientWidth) {
        // The first slot is always a button: "More formatting" is as wide.
        const room = el.clientWidth - e[0] - gap;
        while (n > 0 && (e[n - 1] > room || slots[n - 1] === 'divider')) n--;
      }
      setShown((was) => {
        if (n < was && [...el.children].slice(n, was).some((k) => k.contains(document.activeElement))) refocus.current = true;
        return n;
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slots change with key
  }, [key, shown]);
  useEffect(() => {
    if (refocus.current) moreRef.current?.focus();
    refocus.current = false;
  }, [shown]);

  const visible = slots.slice(0, shown);
  const extra = slots.slice(shown);
  while (extra[0] === 'divider') extra.shift();
  const morePanel = picker?.at === 'more' ? slots.find((t): t is Tool => t !== 'divider' && t.key === picker.key)?.panel : undefined;

  return (
    <div className="yx-editor__toolbar" role="toolbar" aria-label="Formatting">
      <div className="yx-editor__tools" ref={toolsRef}>
        {visible.map((t, i) =>
          t === 'divider' ? (
            <span key={`d${i}`} className="yx-editor__divider" aria-hidden="true" />
          ) : t.panel ? (
            <Popover key={t.key} open={picker?.key === t.key && picker.at === 'bar'} onOpenChange={(o) => setPicker(o ? { key: t.key, at: 'bar' } : null)}>
              <PopoverTrigger asChild>
                <IconButton icon={t.icon} label={t.label} aria-pressed={t.active} disabled={disabled} />
              </PopoverTrigger>
              <PopoverContent className={t.key === 'link' ? 'yx-editor__link' : undefined}>{t.panel(close)}</PopoverContent>
            </Popover>
          ) : (
            <IconButton key={t.key} icon={t.icon} label={t.label} aria-pressed={t.active} disabled={disabled || t.disabled} onClick={() => run(t.apply!)} />
          ),
        )}
        {extra.length > 0 && (
          <Popover open={Boolean(morePanel)} onOpenChange={(o) => !o && close()}>
            <Menu>
              <PopoverAnchor asChild>
                <MenuTrigger asChild>
                  <IconButton ref={moreRef} icon={MoreHorizontal} label="More formatting" disabled={disabled} />
                </MenuTrigger>
              </PopoverAnchor>
              {/* A picker chosen here opens in a popover by this button; the menu mustn't take focus back first. */}
              <MenuContent align="end" onCloseAutoFocus={(e) => picker?.at === 'more' && e.preventDefault()}>
                {extra.map((t, i) =>
                  t === 'divider' ? (
                    <MenuSeparator key={`d${i}`} />
                  ) : t.panel ? (
                    <MenuItem key={t.key} icon={t.icon} onSelect={() => setPicker({ key: t.key, at: 'more' })}>
                      {t.label}
                    </MenuItem>
                  ) : t.active === undefined ? (
                    <MenuItem key={t.key} icon={t.icon} disabled={t.disabled} onSelect={() => run(t.apply!)}>
                      {t.label}
                    </MenuItem>
                  ) : (
                    <MenuCheckboxItem key={t.key} checked={t.active} onSelect={() => run(t.apply!)}>
                      {t.label}
                    </MenuCheckboxItem>
                  ),
                )}
              </MenuContent>
            </Menu>
            <PopoverContent align="end" className={picker?.key === 'link' ? 'yx-editor__link' : undefined}>
              {morePanel?.(close)}
            </PopoverContent>
          </Popover>
        )}
      </div>
      {mergeFields.length > 0 && (
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" icon={Braces} disabled={disabled}>
              Insert field
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            {mergeFields.map((f) => (
              <MenuItem key={f.value} onSelect={() => run((c) => c.insertContent(`{{${f.value}}}`))} shortcut={<code>{`{{${f.value}}}`}</code>}>
                {f.label}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      )}
    </div>
  );
}

function Swatches({ label, none, colours, value, onPick }: { label: string; none: string; colours: { value: string; label: string }[]; value: string; onPick: (v: string | null) => void }) {
  const current = value.toUpperCase();
  return (
    <div className="yx-editor__panel" role="group" aria-label={label}>
      <div className="yx-editor__swatches">
        {colours.map((c) => (
          <button key={c.value} type="button" className="yx-editor__swatch" style={{ background: c.value }} aria-label={c.label} aria-pressed={current === c.value} title={c.label} onClick={() => onPick(c.value)}>
            {current === c.value && <Icon icon={Check} size="sm" />}
          </button>
        ))}
      </div>
      <Button size="sm" disabled={!value} onClick={() => onPick(null)}>
        {none}
      </Button>
    </div>
  );
}

const SAFE_HREF = /^(https?:\/\/|mailto:)\S+$/i;

function LinkPanel({ editor, active, href, done }: { editor: Editor; active: boolean; href: string; done: () => void }) {
  const [text, setText] = useState(href);
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    const url = text.trim();
    if (!SAFE_HREF.test(url)) {
      setError('Enter a full address starting with https:// or mailto:');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    done();
  };
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <FormField label="Link address" error={error}>
        <TextField type="url" value={text} onChange={setText} placeholder="https://" autoFocus />
      </FormField>
      <div className="yx-editor__link-actions">
        {active && (
          <Button
            size="sm"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              done();
            }}
          >
            Remove link
          </Button>
        )}
        <Button size="sm" variant="primary" type="submit">
          Apply link
        </Button>
      </div>
    </form>
  );
}
