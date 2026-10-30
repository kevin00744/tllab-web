"use client";

import Link from "next/link";
import { AtSignIcon, MessageSquareIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteBoardPost, listBoard, saveBoardPost, type BoardFilter } from "@/app/(app)/board-actions";
import { EntityIcon } from "@/components/common/entity-icon";
import { MemberAvatar } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { parseBody } from "@/lib/board";
import { formatDateTime } from "@/lib/date";
import { format } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { BoardPost, BoardThread } from "@/types/entities";
import { BoardComposer, type BoardOptions } from "./board-composer";

const PAGE = 10;

function useAgo() {
  const { locale, t } = useI18n();
  return (iso: string) => {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return t.board.justNow;
    if (minutes < 60) return format(t.board.minutesAgo, { n: minutes });
    if (minutes < 24 * 60) return format(t.board.hoursAgo, { n: Math.floor(minutes / 60) });
    return formatDateTime(locale, iso, { dateStyle: "medium", timeStyle: "short" });
  };
}

/** 標註顯示目前的名稱（依介面語言）；成員或專案不在選項中時用留言當時的名稱 */
function Body({ body, options }: { body: string; options: BoardOptions }) {
  const current = (type: "member" | "project", id: string) =>
    type === "member" ? options.members.find((m) => m.id === id)?.name : options.projects.find((p) => p.id === id)?.title;
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {parseBody(body).map((s, i) =>
        s.type === "text" ? (
          <span key={i}>{s.text}</span>
        ) : (
          <Link
            key={i}
            href={s.type === "member" ? `/members/${s.id}` : `/projects/${s.id}`}
            className={cn(
              "rounded px-0.5 font-medium hover:underline",
              s.type === "member" ? "bg-primary/10 text-primary" : "bg-status-green-bg text-status-green-fg",
            )}
          >
            {s.type === "member" ? "@" : "#"}
            {current(s.type, s.id) ?? s.name}
          </Link>
        ),
      )}
    </p>
  );
}

function Post({
  post,
  options,
  onChanged,
  onReply,
}: {
  post: BoardPost;
  options: BoardOptions;
  onChanged: () => Promise<void>;
  onReply?: () => void;
}) {
  const { t } = useI18n();
  const ago = useAgo();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const reply = !!post.parent_id;

  return (
    <div className={cn("flex gap-2.5", reply && "mt-3")} data-board-post={post.id}>
      {post.author ? <MemberAvatar member={post.author} className={reply ? "size-6" : "size-8"} /> : <span className="size-8 shrink-0 rounded-full bg-muted" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          {post.author ? (
            <Link href={`/members/${post.author.id}`} className="text-sm font-medium text-foreground hover:underline">
              {post.author.name}
            </Link>
          ) : null}
          <span title={post.created_at}>{ago(post.created_at)}</span>
          {post.edited ? <span>· {t.board.edited}</span> : null}
          {post.mentions_me ? (
            <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 text-primary">
              <AtSignIcon className="size-3" /> {t.board.mentionsMe}
            </span>
          ) : null}
        </div>
        {editing ? (
          <div className="mt-1">
            <BoardComposer
              options={options}
              initial={post.body}
              placeholder={t.board.placeholder}
              submitLabel={t.common.save}
              autoFocus
              onCancel={() => setEditing(false)}
              onSubmit={async (body) => {
                const r = await saveBoardPost({ id: post.id, body });
                if (!r.ok) {
                  toast.error(t.errors[r.error]);
                  return false;
                }
                setEditing(false);
                await onChanged();
                return true;
              }}
            />
          </div>
        ) : (
          <div className="mt-0.5">
            <Body body={post.body} options={options} />
          </div>
        )}
        {confirm ? (
          <div role="alert" className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md bg-status-red-bg px-2 py-1.5 text-xs text-status-red-fg">
            <span className="flex-1">{reply ? t.board.deleteReplyConfirm : t.board.deleteConfirm}</span>
            <Button size="sm" variant="outline" onClick={() => setConfirm(false)}>
              {t.common.cancel}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await deleteBoardPost(post.id);
                  if (!r.ok) return void toast.error(t.errors[r.error]);
                  setConfirm(false);
                  await onChanged();
                })
              }
            >
              {t.board.delete}
            </Button>
          </div>
        ) : null}
        {!editing ? (
          <div className="mt-1 flex flex-wrap gap-1 text-xs">
            {onReply ? (
              <button type="button" className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onReply}>
                {t.board.reply}
              </button>
            ) : null}
            {post.editable ? (
              <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setEditing(true)}>
                <PencilIcon className="size-3" /> {t.board.edit}
              </button>
            ) : null}
            {post.deletable ? (
              <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-destructive" onClick={() => setConfirm(true)}>
                <Trash2Icon className="size-3" /> {t.board.delete}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Thread({ thread, options, onChanged }: { thread: BoardThread; options: BoardOptions; onChanged: () => Promise<void> }) {
  const { t } = useI18n();
  const [replying, setReplying] = useState(false);
  const mention = thread.author ? `@[${thread.author.name}](${thread.author.id}) ` : "";
  return (
    <li className={cn("py-3", thread.mentions_me && "-mx-2 rounded-lg bg-primary/5 px-2")} data-board-thread={thread.id}>
      <Post post={thread} options={options} onChanged={onChanged} onReply={() => setReplying(true)} />
      {thread.projects.length ? (
        <div className="mt-1.5 ml-10 flex flex-wrap gap-1">
          {thread.projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-accent">
              <EntityIcon value={p.emoji} /> {p.title}
            </Link>
          ))}
        </div>
      ) : null}
      {thread.replies.length || replying ? (
        <div className="mt-1 ml-10 border-l pl-3">
          {thread.replies.map((r) => (
            <Post key={r.id} post={r} options={options} onChanged={onChanged} onReply={() => setReplying(true)} />
          ))}
          {replying ? (
            <div className="mt-3">
              <BoardComposer
                options={options}
                initial={mention}
                placeholder={t.board.replyPlaceholder}
                submitLabel={t.board.reply}
                autoFocus
                onCancel={() => setReplying(false)}
                onSubmit={async (body) => {
                  const r = await saveBoardPost({ parent_id: thread.id, body });
                  if (!r.ok) {
                    toast.error(t.errors[r.error]);
                    return false;
                  }
                  setReplying(false);
                  await onChanged();
                  return true;
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** 留言板：發文、回覆、@ 提及、# 標註專案；Dashboard 與專案頁共用（專案頁固定篩選該專案） */
export function MessageBoard({
  initial,
  options,
  project,
}: {
  initial: BoardThread[];
  options: BoardOptions;
  /** 專案頁：只顯示標註該專案的討論，新留言自動標註 */
  project?: { id: string; title: string };
}) {
  const { t } = useI18n();
  const [threads, setThreads] = useState(initial);
  const [mine, setMine] = useState(false);
  const [hasMore, setHasMore] = useState(initial.length >= PAGE);
  const [loading, startLoading] = useTransition();
  const base: BoardFilter = { project_id: project?.id, mine: mine || undefined, limit: PAGE };

  async function reload(filter: BoardFilter = base) {
    const r = await listBoard(filter);
    if (!r.ok) return void toast.error(t.errors[r.error]);
    setThreads(r.data);
    setHasMore(r.data.length >= PAGE);
  }

  return (
    <div data-testid="message-board">
      <BoardComposer
        options={options}
        placeholder={t.board.placeholder}
        submitLabel={t.board.post}
        onSubmit={async (text) => {
          const tag = project ? `#[${project.title.replace(/[[\]]/g, "")}](${project.id})` : "";
          const body = tag && !text.includes(`](${project!.id})`) ? `${text}\n${tag}` : text;
          const r = await saveBoardPost({ body });
          if (!r.ok) {
            toast.error(t.errors[r.error]);
            return false;
          }
          await reload();
          return true;
        }}
      />
      <div className="mt-3 flex gap-1 text-xs" role="tablist">
        {[false, true].map((v) => (
          <button
            key={String(v)}
            type="button"
            role="tab"
            aria-selected={mine === v}
            className={cn("rounded-full border px-2.5 py-0.5", mine === v ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}
            onClick={() =>
              startLoading(async () => {
                setMine(v);
                await reload({ ...base, mine: v || undefined });
              })
            }
          >
            {v ? t.board.mine : t.board.all}
          </button>
        ))}
      </div>
      {threads.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <MessageSquareIcon className="size-4" /> {mine ? t.board.emptyMine : t.board.empty}
        </p>
      ) : (
        <ul className="mt-1 divide-y" aria-busy={loading}>
          {threads.map((th) => (
            <Thread key={th.id} thread={th} options={options} onChanged={() => reload({ ...base, limit: Math.max(PAGE, threads.length) })} />
          ))}
        </ul>
      )}
      {hasMore ? (
        <div className="mt-2 text-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() =>
              startLoading(async () => {
                const r = await listBoard({ ...base, before: threads[threads.length - 1].id });
                if (!r.ok) return void toast.error(t.errors[r.error]);
                setThreads((prev) => [...prev, ...r.data]);
                setHasMore(r.data.length >= PAGE);
              })
            }
          >
            {t.board.more}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
