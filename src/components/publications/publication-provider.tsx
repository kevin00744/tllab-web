"use client";

import { PlusIcon } from "lucide-react";
import { createContext, useCallback, useContext, useState } from "react";

import type { PublicationInput } from "@/app/(app)/publications/actions";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import type { FormOptions, Publication } from "@/types/entities";
import { PublicationDialog } from "./publication-dialog";

type Defaults = Partial<PublicationInput>;
type Ctx = { open: (p: Publication) => void; create: (d?: Defaults) => void; options: FormOptions };
const PublicationContext = createContext<Ctx | null>(null);

export function PublicationProvider({
  options,
  defaults,
  children,
}: {
  options: FormOptions;
  defaults?: Defaults;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<{ open: boolean; item: Publication | null; defaults: Defaults }>({
    open: false,
    item: null,
    defaults: {},
  });
  const open = useCallback((item: Publication) => setState({ open: true, item, defaults: {} }), []);
  const create = useCallback(
    (extra?: Defaults) => setState({ open: true, item: null, defaults: { ...defaults, ...extra } }),
    [defaults],
  );
  return (
    <PublicationContext.Provider value={{ open, create, options }}>
      {children}
      <PublicationDialog
        publication={state.item}
        defaults={state.defaults}
        options={options}
        open={state.open}
        onOpenChange={(o) => setState((s) => ({ ...s, open: o }))}
      />
    </PublicationContext.Provider>
  );
}

export function usePublications() {
  const ctx = useContext(PublicationContext);
  if (!ctx) throw new Error("usePublications must be used inside <PublicationProvider>");
  return ctx;
}

export function NewPublicationButton({ size }: { size?: "sm" | "default" }) {
  const { t } = useI18n();
  const { create, options } = usePublications();
  if (!options.can_create) return null;
  return (
    <Button size={size} onClick={() => create()}>
      <PlusIcon /> {t.publicationsPage.new}
    </Button>
  );
}
