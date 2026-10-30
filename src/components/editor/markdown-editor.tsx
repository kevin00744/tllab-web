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
  TypeIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

// 貼上的純文字像 Markdown（標題、清單、引用、程式碼、表格、待辦、粗體、連結）時，轉成對應格式
const MARKDOWN_HINT = /^(#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|>\s?|```|\|.+\||---\s*$)|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)/m;
// 來源若是網頁或文件（HTML 已有段落／標題等結構），維持一般貼上
const RICH_HTML = /<(h[1-6]|p|ul|ol|li|table|blockquote|pre)[\s>]/i;

type Chain = ReturnType<Editor["chain"]>;
type BlockKey = "text" | "h1" | "h2" | "h3" | "bullet" | "ordered" | "task" | "quote" | "code" | "table" | "divider";

// 「/」區塊選單：名稱（中英文）、Markdown 快捷鍵提示、轉換指令
const BLOCKS: { key: BlockKey; icon: React.ElementType; shortcut: string; keywords: string; run: (c: Chain) => Chain }[] = [
  { key: "text", icon: TypeIcon, shortcut: "", keywords: "text paragraph 文字 段落 內文", run: (c) => c.setParagraph() },
  { key: "h1", icon: Heading1Icon, shortcut: "#", keywords: "h1 heading title 標題 大標題", run: (c) => c.setHeading({ level: 1 }) },
  { key: "h2", icon: Heading2Icon, shortcut: "##", keywords: "h2 heading subtitle 標題 中標題", run: (c) => c.setHeading({ level: 2 }) },
  { key: "h3", icon: Heading3Icon, shortcut: "###", keywords: "h3 heading 標題 小標題", run: (c) => c.setHeading({ level: 3 }) },
  { key: "bullet", icon: ListIcon, shortcut: "-", keywords: "bullet list ul 清單 項目 列表", run: (c) => c.toggleBulletList() },
  { key: "ordered", icon: ListOrderedIcon, shortcut: "1.", keywords: "numbered ordered list ol 編號 清單 列表", run: (c) => c.toggleOrderedList() },
  { key: "task", icon: ListChecksIcon, shortcut: "[ ]", keywords: "todo task checkbox 待辦 勾選 清單", run: (c) => c.toggleTaskList() },
  { key: "quote", icon: QuoteIcon, shortcut: ">", keywords: "quote blockquote 引用", run: (c) => c.toggleBlockquote() },
  { key: "code", icon: CodeSquareIcon, shortcut: "```", keywords: "code block 程式碼 代碼", run: (c) => c.toggleCodeBlock() },
  { key: "table", icon: TableIcon, shortcut: "", keywords: "table 表格", run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
  { key: "divider", icon: MinusIcon, shortcut: "---", keywords: "divider hr line 分隔線 水平線", run: (c) => c.setHorizontalRule() },
];

type Slash = { from: number; to: number; query: string; index: number; top: number; left: number };

/** 游標前面是「/關鍵字」時開啟區塊選單（行首或空白後的 /） */
function slashAt(editor: Editor, box: HTMLElement | null): Omit<Slash, "index"> | null {
  const { selection } = editor.state;
  if (!selection.empty || editor.isActive("codeBlock") || !box) return null;
  const { $from } = selection;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
  const m = /(?:^|\s)\/([^\s/]{0,20})$/.exec(before);
  if (!m) return null;
  const coords = editor.view.coordsAtPos($from.pos);
  const rect = box.getBoundingClientRect();
  return { from: $from.pos - m[1].length - 1, to: $from.pos, query: m[1], top: coords.bottom - rect.top + 4, left: Math.max(0, Math.min(coords.left - rect.left, rect.width - 240)) };
}

/**
 * 類 Notion 的 Markdown 編輯器：所見即所得，支援 Markdown 快捷輸入
 * （# 標題、- 清單、1. 編號、[ ] 待辦、> 引用、``` 程式碼、--- 分隔線），內容以 Markdown 存取。
 */
export function MarkdownEditor({
  initial,
  placeholder,
  onChange,
  onEscape,
  compact = false,
  id,
  autofocus = true,
}: {
  initial: string;
  placeholder: string;
  onChange: (markdown: string) => void;
  /** 按 Esc 時呼叫；沒有提供時交給外層（例如關閉對話框） */
  onEscape?: () => void;
  /** 表單欄位用：精簡工具列、外框 */
  compact?: boolean;
  id?: string;
  autofocus?: boolean;
}) {
  const { t } = useI18n();
  const editorRef = useRef<Editor | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [slash, setSlash] = useState<Slash | null>(null);
  const slashRef = useRef<Slash | null>(null);
  useEffect(() => {
    slashRef.current = slash;
  }, [slash]);
  const matches = (q: string) => {
    const s = q.toLowerCase();
    return BLOCKS.filter((b) => !s || b.keywords.toLowerCase().includes(s) || t.projectDoc.block[b.key].toLowerCase().includes(s));
  };
  const applyBlock = (key: BlockKey) => {
    const e = editorRef.current;
    const s = slashRef.current;
    if (!e || !s) return;
    BLOCKS.find((b) => b.key === key)!.run(e.chain().focus().deleteRange({ from: s.from, to: s.to })).run();
    setSlash(null);
  };
  const refreshSlash = (e: Editor) => {
    const next = slashAt(e, boxRef.current);
    setSlash((prev) => (next ? { ...next, index: prev && prev.from === next.from ? prev.index : 0 } : null));
  };
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({
        // 空白文件顯示說明；其他空白行提示可以輸入「/」
        placeholder: ({ editor: e }) => (e.isEmpty ? placeholder : t.projectDoc.slashHint),
        showOnlyCurrent: true,
      }),
      Markdown,
    ],
    content: initial,
    contentType: "markdown",
    immediatelyRender: false,
    autofocus: autofocus ? "end" : false,
    editorProps: {
      attributes: { class: cn("md", compact && "min-h-20 px-3 py-2"), "data-testid": "markdown-editor", ...(id ? { id } : {}) },
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        const html = event.clipboardData?.getData("text/html") ?? "";
        const e = editorRef.current;
        if (!e || !MARKDOWN_HINT.test(text) || RICH_HTML.test(html) || e.isActive("codeBlock")) return false;
        e.chain().focus().insertContent(text, { contentType: "markdown" }).run();
        return true;
      },
      handleKeyDown: (_view, event) => {
        const s = slashRef.current;
        if (s) {
          const list = matches(s.query);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (list.length) setSlash({ ...s, index: (s.index + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length });
            return true;
          }
          if ((event.key === "Enter" || event.key === "Tab") && list.length) {
            applyBlock(list[Math.min(s.index, list.length - 1)].key);
            return true;
          }
          if (event.key === "Escape") {
            setSlash(null);
            return true;
          }
        }
        if (event.key === "Escape" && onEscape) {
          onEscape();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getMarkdown());
      refreshSlash(e);
    },
    onSelectionUpdate: ({ editor: e }) => refreshSlash(e),
    onBlur: () => setSlash(null),
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  if (!editor) return <div className={compact ? "min-h-28 rounded-md border" : "min-h-24"} />;
  const list = slash ? matches(slash.query) : [];
  return (
    <div className={cn("relative", compact && "rounded-md border focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50")} ref={boxRef}>
      <Toolbar editor={editor} compact={compact} />
      <SelectionMenu editor={editor} />
      <EditorContent editor={editor} className={compact ? "" : "pt-3"} />
      {slash ? (
        <div
          role="listbox"
          aria-label={t.projectDoc.slashMenu}
          data-testid="slash-menu"
          data-editor-popup
          className="absolute z-30 max-h-72 w-60 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md"
          style={{ top: slash.top, left: slash.left }}
        >
          {list.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">{t.projectDoc.slashEmpty}</p> : null}
          {list.map((b, i) => (
            <button
              key={b.key}
              type="button"
              role="option"
              aria-selected={i === slash.index}
              data-block={b.key}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setSlash({ ...slash, index: i })}
              onClick={() => applyBlock(b.key)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm [&_svg]:size-4 [&_svg]:text-muted-foreground",
                i === slash.index && "bg-accent",
              )}
            >
              <b.icon />
              <span className="flex-1">{t.projectDoc.block[b.key]}</span>
              {b.shortcut ? <kbd className="font-mono text-xs text-muted-foreground">{b.shortcut}</kbd> : null}
            </button>
          ))}
        </div>
      ) : null}
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

function Toolbar({ editor, compact = false }: { editor: Editor; compact?: boolean }) {
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
    <div
      className={cn(
        "flex flex-wrap items-center gap-0.5 px-1 py-1",
        compact ? "border-b" : "sticky top-12 z-10 -mx-2 rounded-lg border bg-background/95 backdrop-blur",
      )}
    >
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
