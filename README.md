# TL Lab Hub

TL Lab（Lab 911）內部使用的網頁系統，取代原本 Notion 上的實驗室 Team space。

- **About the team**：Team Members、Projects、Tasks、Publication Tracker
- **Resources**：Orientation Guide、FAQ、Software and Tools、Pipelines、Meeting Summary
- 首頁 Dashboard 一覽實驗室現況

技術：Next.js（App Router）+ TypeScript + Tailwind CSS + shadcn/ui，後端 Supabase（PostgreSQL + Auth + Storage），部署於 Vercel。

## 開發進度

| 階段 | 內容 | 狀態 |
|---|---|---|
| 1 | 資料庫 schema 與資料表關聯 | ✅ 待確認 |
| 2 | 版面架構（側邊欄 + 路由）與登入 | ⏳ |
| 3 | Dashboard 首頁 | ⏳ |
| 4 | Projects、Tasks、Publication Tracker | ⏳ |
| 5 | Team Members | ⏳ |
| 6 | Resources 各子頁面 | ⏳ |
| 7 | 全站搜尋、權限、活動紀錄、深色模式 | ⏳ |
| 8 | 從 Notion 匯入資料（CSV／Markdown） | ⏳ |

## 資料庫

Schema、ER 圖與權限說明見 [docs/database-schema.md](docs/database-schema.md)。

### 套用到 Supabase

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push          # 套用 supabase/migrations
```

示範資料（可選）：在 Supabase Dashboard → SQL Editor 執行 `supabase/seed.sql`，或本機開發時 `supabase db reset` 會自動載入。

> 上線前請把 `seed.sql` 中 PI 的 email 改成實際登入帳號（或在系統中由 Admin 修改），首次登入時才會自動綁定為 Admin。

### 本機測試 schema

```bash
scripts/test-db.sh
```

（完整部署說明會在階段 2 加入前端後補齊。）
