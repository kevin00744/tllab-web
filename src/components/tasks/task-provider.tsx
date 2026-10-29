"use client";

import { PlusIcon } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import type { FormOptions, Task } from "@/types/entities";
import { TaskDialog, type TaskDefaults } from "./task-dialog";

type Ctx = { openTask: (task: Task) => void; newTask: (defaults?: TaskDefaults) => void; options: FormOptions };
const TaskContext = createContext<Ctx | null>(null);

/** 任何地方點任務都開同一個對話框（看板、清單、行事曆、專案頁） */
export function TaskProvider({
  options,
  defaults,
  children,
}: {
  options: FormOptions;
  defaults?: TaskDefaults;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<{ open: boolean; task: Task | null; defaults: TaskDefaults }>({
    open: false,
    task: null,
    defaults: {},
  });
  const openTask = useCallback((task: Task) => setState({ open: true, task, defaults: {} }), []);
  const newTask = useCallback(
    (extra?: TaskDefaults) => setState({ open: true, task: null, defaults: { ...defaults, ...extra } }),
    [defaults],
  );

  return (
    <TaskContext.Provider value={{ openTask, newTask, options }}>
      {children}
      <TaskDialog
        task={state.task}
        defaults={state.defaults}
        options={options}
        open={state.open}
        onOpenChange={(open) => setState((s) => ({ ...s, open }))}
      />
    </TaskContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useTasks must be used inside <TaskProvider>");
  return ctx;
}

/** 由網址（?task=id，例如從搜尋結果點進來）直接打開該任務 */
export function OpenTaskOnLoad({ task }: { task: Task | null }) {
  const { openTask } = useTasks();
  const done = useRef(false);
  useEffect(() => {
    if (task && !done.current) {
      done.current = true;
      openTask(task);
    }
  }, [task, openTask]);
  return null;
}

export function NewTaskButton({ defaults, size }: { defaults?: TaskDefaults; size?: "sm" | "default" }) {
  const { t } = useI18n();
  const { newTask, options } = useTasks();
  if (!options.can_create) return null;
  return (
    <Button size={size} onClick={() => newTask(defaults)}>
      <PlusIcon /> {t.tasksPage.new}
    </Button>
  );
}
