import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Markdown 顯示（伺服器端即可渲染，載入快）。
 * 不渲染原始 HTML（react-markdown 預設），避免內容中的 <script> 等被執行。
 * 樣式與編輯器共用 globals.css 的 .md 規則，切換編輯時畫面一致。
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("md", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
