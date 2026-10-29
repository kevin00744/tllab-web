"use client";

import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { Placeholder } from "@tiptap/extensions";
import {
  BoldIcon,
  CodeIcon,
  CodeSquareIcon,
  FileUpIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  QuoteIcon,
  StrikethroughIcon,
  TableIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

// 貼上的純文字像 Markdown（標題、清單、引用、程式碼、表格、待辦、粗體、連結）時，轉成對應格式
const MARKDOWN_HINT = /^(#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|>\s?|```|\|.+\||---\s*$)|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)/m;
// 來源若是網頁或文件（HTML 已有段落／標題等結構），維持一般貼上
const RICH_HTML = /<(h[1-6]|p|ul|ol|li|table|blockquote|pre)[\s>]/i;

/**
 * 類 Notion 的 Markdown 編輯器：所見即所得，支援 Markdown 快捷輸入
 * （# 標題、- 清單、1. 編號、[ ] 待辦、> 引用、``` 程式碼、--- 分隔線），內容以 Markdown 存取。
 */
export function MarkdownEditor({
  initial,
  placeholder,
  onChange,
  onEscape,
}: {
  initial: string;
  placeholder: string;
  onChange: (markdown: string) => void;
  onEscape: () => void;
}) {
  const editorRef = useRef<Editor | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder }),
      Markdown,
    ],
    content: initial,
    contentType: "markdown",
    immediatelyRender: false,
    autofocus: "end",
    editorProps: {
      attributes: { class: "md", "data-testid": "markdown-editor" },
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        const html = event.clipboardData?.getData("text/html") ?? "";
        const e = editorRef.current;
        if (!e || !MARKDOWN_HINT.test(text) || RICH_HTML.test(html) || e.isActive("codeBlock")) return false;
        e.chain().focus().insertContent(text, { contentType: "markdown" }).run();
        return true;
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Escape") {
          onEscape();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getMarkdown()),
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  if (!editor) return <div className="min-h-24" />;
  return (
    <div>
      <Toolbar editor={editor} />
      <SelectionMenu editor={editor} />
      <EditorContent editor={editor} className="pt-3" />
    </div>
  );
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-4",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      code: e.isActive("codeBlock"),
    }),
  });
  const b = t.projectDoc.block;
  const run = () => editor.chain().focus();

  async function importFile(file: File) {
    const text = await file.text();
    editor.chain().focus().insertContent(text, { contentType: "markdown" }).run();
    toast.success(t.projectDoc.imported);
  }

  return (
    <div className="sticky top-12 z-10 -mx-2 flex flex-wrap items-center gap-0.5 rounded-lg border bg-background/95 px-1 py-1 backdrop-blur">
      <ToolButton label={b.h1} active={state.h1} onClick={() => run().toggleHeading({ level: 1 }).run()}>
        <Heading1Icon />
      </ToolButton>
      <ToolButton label={b.h2} active={state.h2} onClick={() => run().toggleHeading({ level: 2 }).run()}>
        <Heading2Icon />
      </ToolButton>
      <ToolButton label={b.h3} active={state.h3} onClick={() => run().toggleHeading({ level: 3 }).run()}>
        <Heading3Icon />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolButton label={b.bullet} active={state.bullet} onClick={() => run().toggleBulletList().run()}>
        <ListIcon />
      </ToolButton>
      <ToolButton label={b.ordered} active={state.ordered} onClick={() => run().toggleOrderedList().run()}>
        <ListOrderedIcon />
      </ToolButton>
      <ToolButton label={b.task} active={state.task} onClick={() => run().toggleTaskList().run()}>
        <ListChecksIcon />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolButton label={b.quote} active={state.quote} onClick={() => run().toggleBlockquote().run()}>
        <QuoteIcon />
      </ToolButton>
      <ToolButton label={b.code} active={state.code} onClick={() => run().toggleCodeBlock().run()}>
        <CodeSquareIcon />
      </ToolButton>
      <ToolButton label={b.table} onClick={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <TableIcon />
      </ToolButton>
      <ToolButton label={b.divider} onClick={() => run().setHorizontalRule().run()}>
        <MinusIcon />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolButton label={t.projectDoc.importMd} onClick={() => fileRef.current?.click()}>
        <FileUpIcon />
      </ToolButton>
      <input
        ref={fileRef}
        type="file"
        accept=".md,.markdown,text/markdown,text/plain"
        className="hidden"
        data-testid="import-md"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** 選取文字時出現的格式工具列 */
function SelectionMenu({ editor }: { editor: Editor }) {
  const { t } = useI18n();
  const m = t.projectDoc.mark;
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
    }),
  });

  function setLink() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(t.projectDoc.linkPrompt, previous ?? "https://");
    if (url === null) return;
    if (url.trim() === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <BubbleMenu editor={editor} data-editor-popup className="flex gap-0.5 rounded-lg border bg-popover p-1 shadow-md">
      <ToolButton label={m.bold} active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
        <BoldIcon />
      </ToolButton>
      <ToolButton label={m.italic} active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <ItalicIcon />
      </ToolButton>
      <ToolButton label={m.strike} active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <StrikethroughIcon />
      </ToolButton>
      <ToolButton label={m.code} active={state.code} onClick={() => editor.chain().focus().toggleCode().run()}>
        <CodeIcon />
      </ToolButton>
      <ToolButton label={m.link} active={state.link} onClick={setLink}>
        <LinkIcon />
      </ToolButton>
    </BubbleMenu>
  );
}
