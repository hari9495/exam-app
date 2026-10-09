import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Bold, Braces, Heading2, Heading3, Italic, Link2, List, ListOrdered, Redo2, Underline, Undo2 } from 'lucide-react';
import { cx } from '../lib/cx';
import { Button, IconButton } from './button';
import { FormField, useFieldControl } from './field';
import { TextField } from './inputs';
import { Menu, MenuContent, MenuItem, MenuTrigger } from './menu';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

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

const MERGE_RE = /\{\{\s*[\w.]+\s*\}\}/g;

/** Highlights {{merge.fields}} without changing the stored HTML, so templates stay plain text. */
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
      {editor && !readOnly && <Toolbar editor={editor} mergeFields={mergeFields} disabled={disabled} />}
      <EditorContent editor={editor} className="yx-editor__area" />
    </div>
  );
}

function Toolbar({ editor, mergeFields, disabled }: { editor: Editor; mergeFields: MergeField[]; disabled?: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      link: e.isActive('link'),
      href: (e.getAttributes('link').href as string | undefined) ?? '',
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const run = (fn: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => fn(editor.chain().focus()).run();
  const toggle = (label: string, icon: typeof Bold, active: boolean, fn: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => (
    <IconButton icon={icon} label={label} aria-pressed={active} disabled={disabled} onClick={() => run(fn)} />
  );

  return (
    <div className="yx-editor__toolbar" role="toolbar" aria-label="Formatting">
      <div className="yx-editor__tools">
        {toggle('Bold', Bold, s.bold, (c) => c.toggleBold())}
        {toggle('Italic', Italic, s.italic, (c) => c.toggleItalic())}
        {toggle('Underline', Underline, s.underline, (c) => c.toggleUnderline())}
        <span className="yx-editor__divider" aria-hidden="true" />
        {toggle('Heading 2', Heading2, s.h2, (c) => c.toggleHeading({ level: 2 }))}
        {toggle('Heading 3', Heading3, s.h3, (c) => c.toggleHeading({ level: 3 }))}
        {toggle('Bulleted list', List, s.bullet, (c) => c.toggleBulletList())}
        {toggle('Numbered list', ListOrdered, s.ordered, (c) => c.toggleOrderedList())}
        <LinkButton editor={editor} active={s.link} href={s.href} disabled={disabled} />
        <span className="yx-editor__divider" aria-hidden="true" />
        <IconButton icon={Undo2} label="Undo" disabled={disabled || !s.canUndo} onClick={() => run((c) => c.undo())} />
        <IconButton icon={Redo2} label="Redo" disabled={disabled || !s.canRedo} onClick={() => run((c) => c.redo())} />
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

const SAFE_HREF = /^(https?:\/\/|mailto:)\S+$/i;

function LinkButton({ editor, active, href, disabled }: { editor: Editor; active: boolean; href: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    const url = text.trim();
    if (!SAFE_HREF.test(url)) {
      setError('Enter a full address starting with https:// or mailto:');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setText(href);
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <IconButton icon={Link2} label="Link" aria-pressed={active} disabled={disabled} />
      </PopoverTrigger>
      <PopoverContent className="yx-editor__link">
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
                  setOpen(false);
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
      </PopoverContent>
    </Popover>
  );
}
