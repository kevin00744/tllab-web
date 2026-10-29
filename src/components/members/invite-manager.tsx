"use client";

import { BanIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createInvite, revokeInvite, type InviteInput } from "@/app/(app)/members/actions";
import { EmptyBlock, Field } from "@/components/common/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDateTime } from "@/lib/date";
import { useI18n } from "@/lib/i18n/client";
import type { Tone } from "@/lib/status";
import { roleTone } from "@/lib/status";
import type { InviteCode } from "@/types/entities";
import { SecretReveal } from "./secret-reveal";

const POSITIONS = ["pi", "postdoc", "phd", "master", "undergrad", "staff"] as const;
const ROLES = ["member", "viewer", "admin"] as const;
const statusTone: Record<InviteCode["status"], Tone> = { active: "green", used: "gray", expired: "amber", revoked: "red" };

type MemberOption = { id: string; name: string; has_account: boolean };

export function NewInviteButton({ members }: { members: MemberOption[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> {t.invitesPage.create}
        </Button>
      </DialogTrigger>
      {open ? <InviteForm members={members} onDone={() => setOpen(false)} /> : null}
    </Dialog>
  );
}

function InviteForm({ members, onDone }: { members: MemberOption[]; onDone: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<InviteInput>({
    app_role: "member",
    position: "",
    email: "",
    member_id: "",
    max_uses: 1,
    expires_days: 14,
    note: "",
  });
  const [code, setCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof InviteInput>(key: K, value: InviteInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  if (code) {
    return (
      <DialogContent className="max-w-md" closeLabel={t.common.close}>
        <DialogHeader>
          <DialogTitle>{t.invitesPage.createdTitle}</DialogTitle>
          <DialogDescription>{t.invitesPage.createdBody}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <SecretReveal value={code} label={t.invitesPage.code} />
          <p className="mt-3 text-xs text-muted-foreground">{t.invitesPage.howTo}</p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onDone}>
            {t.common.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="sm:max-w-lg" closeLabel={t.common.close}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await createInvite(form);
            if (!result.ok) return void toast.error(t.errors[result.error]);
            setCode(result.data);
            router.refresh();
          });
        }}
      >
        <DialogHeader>
          <DialogTitle>{t.invitesPage.create}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <fieldset disabled={pending} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.invitesPage.role} htmlFor="i-role">
                <NativeSelect id="i-role" value={form.app_role} onChange={(e) => set("app_role", e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t.roles[r]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t.invitesPage.position} htmlFor="i-position">
                <NativeSelect id="i-position" value={form.position} onChange={(e) => set("position", e.target.value)}>
                  <option value="">{t.invitesPage.keepPosition}</option>
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {t.positions[p]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label={t.invitesPage.email} htmlFor="i-email">
              <Input id="i-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label={t.invitesPage.bindMember} htmlFor="i-member">
              <NativeSelect id="i-member" value={form.member_id} onChange={(e) => set("member_id", e.target.value)}>
                <option value="">{t.common.none}</option>
                {members
                  .filter((m) => !m.has_account)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.invitesPage.maxUses} htmlFor="i-uses">
                <Input
                  id="i-uses"
                  type="number"
                  min={1}
                  max={100}
                  value={form.max_uses}
                  onChange={(e) => set("max_uses", Number(e.target.value))}
                />
              </Field>
              <Field label={t.invitesPage.expiresDays} htmlFor="i-days">
                <Input
                  id="i-days"
                  type="number"
                  min={1}
                  max={365}
                  value={form.expires_days}
                  onChange={(e) => set("expires_days", Number(e.target.value))}
                />
              </Field>
            </div>
            <Field label={t.invitesPage.note} htmlFor="i-note">
              <Input id="i-note" placeholder={t.invitesPage.notePlaceholder} value={form.note} onChange={(e) => set("note", e.target.value)} />
            </Field>
          </fieldset>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t.common.cancel}
          </Button>
          <Button type="submit" disabled={pending}>
            {t.invitesPage.create}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function InviteList({ invites }: { invites: InviteCode[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (invites.length === 0) return <EmptyBlock>{t.invitesPage.empty}</EmptyBlock>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">{t.invitesPage.hint}</th>
            <th className="px-3 py-2 font-medium">{t.invitesPage.status}</th>
            <th className="px-3 py-2 font-medium">{t.invitesPage.role}</th>
            <th className="px-3 py-2 font-medium">{t.invitesPage.note}</th>
            <th className="px-3 py-2 font-medium">{t.invitesPage.usage}</th>
            <th className="px-3 py-2 font-medium">{t.invitesPage.expires}</th>
            <th className="px-3 py-2 font-medium">{t.invitesPage.redeemedBy}</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {invites.map((inv) => (
            <tr key={inv.id} data-invite-id={inv.id}>
              <td className="px-4 py-2 font-mono text-xs">…{inv.code_hint}</td>
              <td className="px-3 py-2">
                <Badge tone={statusTone[inv.status]}>{t.invitesPage.statuses[inv.status]}</Badge>
              </td>
              <td className="px-3 py-2">
                <Badge tone={roleTone[inv.app_role]}>{t.roles[inv.app_role]}</Badge>
                {inv.position ? <span className="ml-1.5 text-xs text-muted-foreground">{t.positions[inv.position]}</span> : null}
              </td>
              <td className="max-w-56 px-3 py-2 text-xs">
                <div className="truncate">{inv.note || "—"}</div>
                {inv.email || inv.member ? (
                  <div className="truncate text-muted-foreground">{[inv.member?.name, inv.email].filter(Boolean).join(" · ")}</div>
                ) : null}
              </td>
              <td className="px-3 py-2 text-xs tabular-nums">
                {inv.used_count}/{inv.max_uses}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {formatDateTime(locale, inv.expires_at, { dateStyle: "medium", timeStyle: "short" })}
              </td>
              <td className="max-w-48 truncate px-3 py-2 text-xs text-muted-foreground">{inv.redeemed_by.join("、") || "—"}</td>
              <td className="px-4 py-2 text-right">
                {inv.status === "active" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await revokeInvite(inv.id);
                        if (!result.ok) return void toast.error(t.errors[result.error]);
                        toast.success(t.invitesPage.revoked);
                        router.refresh();
                      })
                    }
                  >
                    <BanIcon /> {t.invitesPage.revoke}
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
