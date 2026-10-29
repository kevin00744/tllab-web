import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Markdown 顯示（伺服器端即可渲染，載入快）。
 * 不渲染原始 HTML（react-markdown 預設），避免內容中的 <script> 等被執行。
 * 樣式與編輯器共用 globals.css 的 .md 規則，切換編輯時畫面一致。
 */
export function Markdown({ children, className, anchors = false }: { children: string; className?: string; anchors?: boolean }) {
  // anchors：1–3 級標題依序加上 id（h-1、h-2…），與 extractHeadings() 的目錄連結對應
  let n = 0;
  const heading = (Tag: "h1" | "h2" | "h3") =>
    function Heading({ children: c }: { children?: React.ReactNode }) {
      n += 1;
      return (
        <Tag id={`h-${n}`} className="scroll-mt-20">
          {c}
        </Tag>
      );
    };
  return (
    <div className={cn("md", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          ...(anchors ? { h1: heading("h1"), h2: heading("h2"), h3: heading("h3") } : {}),
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {c}
            </a>
          ),
          input: (props) => <input {...props} disabled />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
