"use client";

import { unzipSync } from "fflate";
import { CheckCircle2Icon, ChevronDownIcon, ChevronRightIcon, FileArchiveIcon, Loader2Icon, TriangleAlertIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";

import { importNotion, type ImportStats } from "@/app/(app)/settings/import/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { format } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import {
  buildPayload,
  collectPeople,
  columnFields,
  defaultPages,
  directoryEntries,
  guessFaqPage,
  guessTarget,
  standalonePages,
  suggestDirectory,
  suggestPerson,
  TARGETS,
  templateRowKeys,
  type Choices,
  type ImportPayload,
  type MemberCandidate,
  type PeopleChoice,
  type Target,
} from "@/lib/notion/convert";
import { parseExport, type NotionExport, type NotionFile } from "@/lib/notion/parse";
import { plainExcerpt } from "@/lib/text";
import { cn } from "@/lib/utils";

const STEPS = ["file", "databases", "people", "pages", "confirm"] as const;
type Step = (typeof STEPS)[number];

/** zip（含 Notion 分段匯出的內層 zip）→ Markdown 與 CSV 檔 */
function readZip(buf: Uint8Array) {
  const decoder = new TextDecoder("utf-8");
  const files: NotionFile[] = [];
  let skipped = 0;
  const walk = (data: Uint8Array, depth: number) => {
    const entries = unzipSync(data);
    for (const [path, bytes] of Object.entries(entries)) {
      if (path.endsWith("/")) continue;
      if (/\.(md|csv)$/i.test(path)) files.push({ path, text: decoder.decode(bytes) });
      else if (/\.zip$/i.test(path) && depth < 2) walk(bytes, depth + 1);
      else skipped += 1;
    }
  };
  walk(buf, 0);
  return { files, skipped };
}

const encode = (c: PeopleChoice) => (c.kind === "existing" ? `existing:${c.memberId}` : c.kind === "row" ? `row:${c.rowKey}` : c.kind);
const decode = (v: string): PeopleChoice =>
  v.startsWith("existing:") ? { kind: "existing", memberId: v.slice(9) } : v.startsWith("row:") ? { kind: "row", rowKey: v.slice(4) } : { kind: v as "create" | "skip" };

export function NotionImport({ members }: { members: MemberCandidate[] }) {
  const { t } = useI18n();
  const it = t.importPage;
  const [step, setStep] = useState<Step>("file");
  const [exp, setExp] = useState<NotionExport | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; files: number; skipped: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, Target>>({});
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [templates, setTemplates] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, PeopleChoice>>({});
  const [pages, setPages] = useState<Set<string> | null>(null);
  const [faqPageId, setFaqPageId] = useState<string | null>(null);
  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ stats: ImportStats; payload: ImportPayload } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function load(file: File) {
    setError(null);
    setLoading(true);
    try {
      const { files, skipped } = readZip(new Uint8Array(await file.arrayBuffer()));
      if (!files.length) throw new Error("empty");
      const parsed = parseExport(files);
      if (!parsed.databases.length && !parsed.pages.size) throw new Error("empty");
      const templ = templateRowKeys(parsed);
      const nextTargets: Record<string, Target> = {};
      const nextExcluded = new Set<string>();
      for (const db of parsed.databases) {
        for (const r of db.rows) if (!r.title || templ.has(r.key)) nextExcluded.add(r.key);
        nextTargets[db.id] = db.rows.some((r) => !nextExcluded.has(r.key)) ? guessTarget(db) : "skip";
      }
      setExp(parsed);
      setTemplates(templ);
      setTargets(nextTargets);
      setExcluded(nextExcluded);
      setOverrides({});
      setPages(null);
      setFaqPageId(guessFaqPage(parsed));
      setResult(null);
      setFileInfo({ name: file.name, files: files.length, skipped });
      setStep("databases");
    } catch (e) {
      console.warn("notion export parse failed", e);
      setError(it.readFailed);
    } finally {
      setLoading(false);
    }
  }

  // ---- 人員：自動建議＋手動調整
  const directory = useMemo(() => (exp ? directoryEntries(exp, targets, excluded) : []), [exp, targets, excluded]);
  const people = useMemo(() => (exp ? collectPeople(exp, { targets, excludedRows: excluded }) : []), [exp, targets, excluded]);
  const choiceFor = (key: string, fallback: () => PeopleChoice) => overrides[key] ?? fallback();
  const dirChoice = (d: (typeof directory)[number]) => choiceFor(`row:${d.rowKey}`, () => suggestDirectory(d, members));
  const personChoice = (p: (typeof people)[number]) => choiceFor(p.key, () => suggestPerson(p, members, directory));

  // ---- 頁面
  const effectivePages = useMemo(
    () => pages ?? (exp ? defaultPages(exp, { targets, excludedRows: excluded }) : new Set<string>()),
    [pages, exp, targets, excluded],
  );
  const choices: Choices | null = exp
    ? {
        targets,
        excludedRows: excluded,
        people: {
          ...Object.fromEntries(directory.map((d) => [`row:${d.rowKey}`, dirChoice(d)])),
          ...Object.fromEntries(people.map((p) => [p.key, personChoice(p)])),
        },
        pages: effectivePages,
        faqPageId,
        mode,
      }
    : null;
  // 匯入資料只在確認步驟計算（純函式，幾毫秒）；匯入後固定顯示當時送出的內容
  // （匯入完成會重新整理成員清單，重算會把新成員算成既有成員）
  const payload = result?.payload ?? (step === "confirm" && exp && choices ? buildPayload(exp, choices, members) : null);
  const stats = result?.stats ?? null;

  const toggle = (set: Set<string>, key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    return next;
  };

  const stepIndex = STEPS.indexOf(step);
  const go = (s: Step) => setStep(s);

  return (
    <div className="grid grid-cols-1 gap-6">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label={it.steps.label}>
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              disabled={!exp && s !== "file"}
              onClick={() => go(s)}
              aria-current={s === step ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 disabled:opacity-50",
                s === step ? "border-primary bg-primary/10 font-medium text-primary" : i < stepIndex ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="tabular-nums">{i + 1}</span> {it.steps[s]}
            </button>
          </li>
        ))}
      </ol>

      {step === "file" ? (
        <section className="grid gap-4 rounded-xl border p-5">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            {it.howTo.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
          <div>
            <Button type="button" onClick={() => fileRef.current?.click()} disabled={loading}>
              {loading ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} {loading ? it.reading : it.choose}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              data-testid="notion-zip"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void load(f);
                e.target.value = "";
              }}
            />
          </div>
          {fileInfo ? (
            <p className="flex items-center gap-2 text-sm">
              <FileArchiveIcon className="size-4 text-muted-foreground" />
              {format(it.loaded, { name: fileInfo.name, files: fileInfo.files, dbs: exp?.databases.length ?? 0 })}
              {fileInfo.skipped ? <span className="text-muted-foreground">{format(it.skippedFiles, { n: fileInfo.skipped })}</span> : null}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="flex items-center gap-2 text-sm text-status-red-fg">
              <TriangleAlertIcon className="size-4" /> {error}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{it.privacy}</p>
        </section>
      ) : null}

      {step === "databases" && exp ? (
        <section className="grid grid-cols-1 gap-3">
          <p className="text-sm text-muted-foreground">{it.dbHint}</p>
          {[...exp.databases]
            .sort((a, b) => Number(targets[a.id] === "skip") - Number(targets[b.id] === "skip"))
            .map((db) => {
              const target = targets[db.id] ?? "skip";
              const total = db.rows.filter((r) => r.title).length;
              const chosen = db.rows.filter((r) => r.title && !excluded.has(r.key)).length;
              const tmpl = db.rows.filter((r) => templates.has(r.key)).length;
              const parent = db.parentPageId ? exp.pages.get(db.parentPageId)?.title : null;
              const fields = target === "skip" ? [] : columnFields(db, target);
              const isOpen = open.has(db.id);
              return (
                <div key={db.id} className={cn("rounded-xl border", target === "skip" && "opacity-70")} data-db-id={db.id} data-db-name={db.name}>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-expanded={isOpen}
                      onClick={() => setOpen((o) => toggle(o, db.id, !o.has(db.id)))}
                    >
                      {isOpen ? <ChevronDownIcon className="size-4 shrink-0" /> : <ChevronRightIcon className="size-4 shrink-0" />}
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{db.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {parent ? `${format(it.inside, { page: parent })} · ` : ""}
                          {format(it.rowCount, { chosen, total })}
                          {tmpl ? ` · ${format(it.templateRows, { n: tmpl })}` : ""}
                        </span>
                      </span>
                    </button>
                    <NativeSelect
                      aria-label={format(it.targetFor, { name: db.name })}
                      value={target}
                      className="w-auto"
                      onChange={(e) => setTargets((x) => ({ ...x, [db.id]: e.target.value as Target }))}
                    >
                      {TARGETS.map((x) => (
                        <option key={x} value={x}>
                          {it.targets[x]}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  {isOpen ? (
                    <div className="border-t px-4 py-3">
                      {fields.length ? (
                        <p className="mb-2 flex flex-wrap gap-1 text-xs">
                          {fields
                            .filter((f) => f.field !== "ignore")
                            .map((f) => (
                              <Badge key={f.column} tone={f.field ? "blue" : "gray"} className="font-normal">
                                {f.column}
                                {f.field ? ` → ${it.fields[f.field as keyof typeof it.fields] ?? f.field}` : ` → ${it.fields.other}`}
                              </Badge>
                            ))}
                        </p>
                      ) : null}
                      <ul className="grid max-h-72 gap-1 overflow-y-auto text-sm">
                        {db.rows
                          .filter((r) => r.title)
                          .map((r) => (
                            <li key={r.key}>
                              <label className="flex items-center gap-2">
                                <Checkbox checked={!excluded.has(r.key)} onChange={(e) => setExcluded((s) => toggle(s, r.key, !e.target.checked))} />
                                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                                {templates.has(r.key) ? <Badge tone="amber">{it.template}</Badge> : null}
                              </label>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })}
          <div className="flex justify-end">
            <Button type="button" onClick={() => go("people")}>
              {it.next}
            </Button>
          </div>
        </section>
      ) : null}

      {step === "people" && exp ? (
        <section className="grid grid-cols-1 gap-4">
          <p className="text-sm text-muted-foreground">{it.peopleHint}</p>
          {directory.length ? (
            <div className="rounded-xl border">
              <h3 className="border-b px-4 py-2 text-sm font-semibold">{it.directory}</h3>
              <ul className="divide-y">
                {directory.map((d) => (
                  <li key={d.rowKey} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm" data-person={d.name}>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{d.name}</span>
                      {d.email ? <span className="ml-2 text-xs text-muted-foreground">{d.email}</span> : null}
                    </span>
                    <NativeSelect
                      aria-label={format(it.mapFor, { name: d.name })}
                      className="w-auto max-w-64"
                      value={encode(dirChoice(d))}
                      onChange={(e) => setOverrides((o) => ({ ...o, [`row:${d.rowKey}`]: decode(e.target.value) }))}
                    >
                      <option value="create">{it.createMember}</option>
                      <optgroup label={it.existingMembers}>
                        {members.map((m) => (
                          <option key={m.id} value={`existing:${m.id}`}>
                            {m.name}
                          </option>
                        ))}
                      </optgroup>
                      <option value="skip">{it.skip}</option>
                    </NativeSelect>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="rounded-xl border">
            <h3 className="border-b px-4 py-2 text-sm font-semibold">{it.namesInData}</h3>
            {people.length ? (
              <ul className="divide-y">
                {people.map((p) => (
                  <li key={p.key} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm" data-person={p.name}>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {format(it.mentions, { n: p.count })} · {p.sources.join("、")}
                      </span>
                    </span>
                    <NativeSelect
                      aria-label={format(it.mapFor, { name: p.name })}
                      className="w-auto max-w-64"
                      value={encode(personChoice(p))}
                      onChange={(e) => setOverrides((o) => ({ ...o, [p.key]: decode(e.target.value) }))}
                    >
                      <option value="create">{format(it.createNamed, { name: p.name })}</option>
                      {directory.length ? (
                        <optgroup label={it.directory}>
                          {directory
                            .filter((d) => dirChoice(d).kind !== "skip")
                            .map((d) => (
                              <option key={d.rowKey} value={`row:${d.rowKey}`}>
                                {d.name}
                              </option>
                            ))}
                        </optgroup>
                      ) : null}
                      <optgroup label={it.existingMembers}>
                        {members.map((m) => (
                          <option key={m.id} value={`existing:${m.id}`}>
                            {m.name}
                          </option>
                        ))}
                      </optgroup>
                      <option value="skip">{it.skip}</option>
                    </NativeSelect>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-muted-foreground">{it.noPeople}</p>
            )}
          </div>
          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => go("databases")}>
              {it.back}
            </Button>
            <Button type="button" onClick={() => go("pages")}>
              {it.next}
            </Button>
          </div>
        </section>
      ) : null}

      {step === "pages" && exp ? (
        <section className="grid grid-cols-1 gap-4">
          <div className="grid gap-1.5 rounded-xl border px-4 py-3">
            <label htmlFor="faq-page" className="text-sm font-medium">
              {it.faqPage}
            </label>
            <NativeSelect id="faq-page" value={faqPageId ?? ""} onChange={(e) => setFaqPageId(e.target.value || null)} className="max-w-md">
              <option value="">{t.common.none}</option>
              {standalonePages(exp).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">{it.faqHint}</p>
          </div>
          <div className="rounded-xl border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
              <h3 className="text-sm font-semibold">{it.pagesTitle}</h3>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setPages(new Set(standalonePages(exp).map((p) => p.id)))}>
                  {it.selectAll}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setPages(new Set())}>
                  {it.selectNone}
                </Button>
              </div>
            </div>
            <p className="px-4 pt-2 text-xs text-muted-foreground">{it.pagesHint}</p>
            <ul className="grid max-h-96 gap-1 overflow-y-auto px-4 py-2 text-sm">
              {standalonePages(exp)
                .filter((p) => p.id !== faqPageId)
                .sort((a, b) => Number(effectivePages.has(b.id)) - Number(effectivePages.has(a.id)) || a.title.localeCompare(b.title))
                .map((p) => (
                  <li key={p.id}>
                    <label className="flex items-start gap-2">
                      <Checkbox
                        className="mt-1"
                        checked={effectivePages.has(p.id)}
                        onChange={(e) => setPages(toggle(effectivePages, p.id, e.target.checked))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{p.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{plainExcerpt(p.fullBody, 100) || it.emptyPage}</span>
                      </span>
                    </label>
                  </li>
                ))}
            </ul>
          </div>
          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => go("people")}>
              {it.back}
            </Button>
            <Button type="button" onClick={() => go("confirm")}>
              {it.next}
            </Button>
          </div>
        </section>
      ) : null}

      {step === "confirm" && payload ? (
        <section className="grid grid-cols-1 gap-4">
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm" data-testid="import-summary">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">{it.entity}</th>
                  <th className="px-4 py-2 text-right font-medium">{it.toImport}</th>
                  {stats ? (
                    <>
                      <th className="px-3 py-2 text-right font-medium">{it.outcomes.created}</th>
                      <th className="px-3 py-2 text-right font-medium">{it.outcomes.updated}</th>
                      <th className="px-3 py-2 text-right font-medium">{it.outcomes.skipped}</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(["members", "projects", "tasks", "publications", "meetings", "pipelines", "software", "documents", "faqs"] as const).map((k) => (
                  <tr key={k} data-entity={k}>
                    <td className="px-4 py-2">{it.entities[k]}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {k === "members" ? payload.members.filter((m) => !m.existing_id).length : payload[k].length}
                    </td>
                    {stats ? (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums">{stats[k]?.created ?? 0}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{(stats[k]?.updated ?? 0) + (stats[k]?.linked ?? 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{stats[k]?.skipped ?? 0}</td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats ? (
            <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-status-green-bg px-4 py-3 text-sm text-status-green-fg">
              <CheckCircle2Icon className="size-4" /> {it.done}
              <span className="flex flex-wrap gap-3">
                <Link href="/projects" className="underline">
                  {t.nav.projects}
                </Link>
                <Link href="/tasks" className="underline">
                  {t.nav.tasks}
                </Link>
                <Link href="/members" className="underline">
                  {t.nav.members}
                </Link>
                <Link href="/activity" className="underline">
                  {t.nav.activity}
                </Link>
              </span>
            </div>
          ) : (
            <>
              <fieldset className="grid gap-2 rounded-xl border px-4 py-3 text-sm">
                <legend className="px-1 text-sm font-medium">{it.modeTitle}</legend>
                <label className="flex items-start gap-2">
                  <input type="radio" name="mode" className="mt-1 accent-primary" checked={mode === "skip"} onChange={() => setMode("skip")} />
                  <span>
                    {it.modeSkip}
                    <span className="block text-xs text-muted-foreground">{it.modeSkipHint}</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" name="mode" className="mt-1 accent-primary" checked={mode === "update"} onChange={() => setMode("update")} />
                  <span>
                    {it.modeUpdate}
                    <span className="block text-xs text-muted-foreground">{it.modeUpdateHint}</span>
                  </span>
                </label>
              </fieldset>
              {error ? (
                <p role="alert" className="flex items-center gap-2 text-sm text-status-red-fg">
                  <TriangleAlertIcon className="size-4" /> {error}
                </p>
              ) : null}
              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => go("pages")}>
                  {it.back}
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      setError(null);
                      const sent = payload;
                      const res = await importNotion(sent);
                      if (!res.ok) return setError(t.errors[res.error]);
                      setResult({ stats: res.data, payload: sent });
                    })
                  }
                >
                  {pending ? <Loader2Icon className="animate-spin" /> : null} {pending ? it.importing : it.start}
                </Button>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
