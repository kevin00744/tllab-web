"use client";

import { PencilIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { saveMember, type MemberInput } from "@/app/(app)/members/actions";
import { Field } from "@/components/common/field";
import { LinksEditor } from "@/components/common/links-editor";
import { MemberAvatar } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/client";
import { squareWebp } from "@/lib/image";
import type { MemberProfile } from "@/types/entities";

const POSITIONS = ["pi", "postdoc", "phd", "master", "undergrad", "staff"] as const;
const ROLES = ["admin", "member", "viewer"] as const;
const MAX_PHOTO = 5 * 1024 * 1024;

function initial(m: MemberProfile | null): MemberInput {
  return {
    id: m?.id,
    name: m?.name ?? "",
    name_en: m?.name_en ?? "",
    email: m?.email ?? "",
    avatar_url: m?.avatar_url ?? "",
    position: m?.position ?? "master",
    app_role: m?.app_role ?? "member",
    is_alumni: m?.is_alumni ?? false,
    is_system_admin: m?.is_system_admin ?? false,
    research_interests: m?.research_interests ?? [],
    bio: m?.bio ?? "",
    join_year: m?.join_year ? String(m.join_year) : String(new Date().getFullYear()),
    left_year: m?.left_year ? String(m.left_year) : "",
    current_affiliation: m?.current_affiliation ?? "",
    links: m?.links ?? [],
    sort_order: String(m?.sort_order ?? 0),
  };
}

export function MemberDialog({
  member,
  isAdmin,
  isSystemAdmin = false,
}: {
  member: MemberProfile | null;
  isAdmin: boolean;
  /** 目前使用者是否為系統管理員：可指定其他 Admin 為系統管理員 */
  isSystemAdmin?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (member ? !member.editable : !isAdmin) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {member ? (
          <Button variant="outline">
            <PencilIcon /> {member.is_me ? t.membersPage.edit : t.membersPage.editMember}
          </Button>
        ) : (
          <Button>
            <PlusIcon /> {t.membersPage.new}
          </Button>
        )}
      </DialogTrigger>
      {open ? <MemberForm member={member} isAdmin={isAdmin} isSystemAdmin={isSystemAdmin} onDone={() => setOpen(false)} /> : null}
    </Dialog>
  );
}

function MemberForm({
  member,
  isAdmin,
  isSystemAdmin,
  onDone,
}: {
  member: MemberProfile | null;
  isAdmin: boolean;
  isSystemAdmin: boolean;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState(() => initial(member));
  const [interests, setInterests] = useState(() => form.research_interests.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof MemberInput>(key: K, value: MemberInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function uploadPhoto(file: File) {
    if (!member) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > MAX_PHOTO) return toast.error(t.membersPage.photoTooLarge);
    setUploading(true);
    try {
      const blob = await squareWebp(file, 512);
      const supabase = createClient();
      const path = `${member.id}/${crypto.randomUUID()}.webp`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, await blob.arrayBuffer(), { contentType: "image/webp" });
      if (upErr) throw upErr;
      set("avatar_url", supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl);
    } catch (e) {
      console.warn("avatar upload failed", e);
      toast.error(t.errors.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setError(t.errors.nameRequired);
    const { is_system_admin, ...rest } = form;
    const input: MemberInput = {
      ...rest,
      // 只有系統管理員送出；不是 Admin 或為校友時無效
      ...(isSystemAdmin && member ? { is_system_admin: !!is_system_admin && form.app_role === "admin" && !form.is_alumni } : {}),
      research_interests: interests.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
      links: form.links.filter((l) => l.url.trim()),
    };
    startTransition(async () => {
      const result = await saveMember(input);
      if (!result.ok) return setError(t.errors[result.error]);
      toast.success(t.common.saved);
      onDone();
      if (member) router.refresh();
      else router.push(`/members/${result.data}`);
    });
  }

  const preview = { name: form.name || "?", avatar_url: form.avatar_url || null };
  // 管理員的身分只有系統管理員能變更（資料庫 trigger 另外把關）
  const locked = !!member && !member.manageable;

  return (
    <DialogContent className="sm:max-w-xl" closeLabel={t.common.close}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>{member ? (member.is_me ? t.membersPage.edit : t.membersPage.editMember) : t.membersPage.new}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <fieldset disabled={pending} className="grid gap-4">
            {error ? (
              <div role="alert" data-slot="form-error" className="rounded-md bg-status-red-bg px-3 py-2 text-sm text-status-red-fg">
                {error}
              </div>
            ) : null}
            {member ? (
              <div className="flex items-center gap-4">
                <MemberAvatar member={preview} className="size-16 text-xl" />
                <div className="grid gap-1.5">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                      <UploadIcon /> {uploading ? t.projectFiles.uploading : t.membersPage.uploadPhoto}
                    </Button>
                    {form.avatar_url ? (
                      <Button type="button" size="sm" variant="ghost" onClick={() => set("avatar_url", "")}>
                        <Trash2Icon /> {t.membersPage.removePhoto}
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{t.membersPage.photoHint}</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  data-testid="avatar-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadPhoto(f);
                    e.target.value = "";
                  }}
                />
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.fields.name} htmlFor="m-name">
                <Input id="m-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label={t.membersPage.nameEn} htmlFor="m-name-en">
                <Input id="m-name-en" value={form.name_en} onChange={(e) => set("name_en", e.target.value)} />
              </Field>
            </div>
            <Field label={t.membersPage.interests} htmlFor="m-interests" hint={t.membersPage.interestsHint}>
              <Input id="m-interests" value={interests} onChange={(e) => setInterests(e.target.value)} />
            </Field>
            <Field label={t.membersPage.bio} htmlFor="m-bio">
              <Textarea id="m-bio" rows={3} value={form.bio} onChange={(e) => set("bio", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.membersPage.joinYear} htmlFor="m-join">
                <Input id="m-join" type="number" min={1990} max={2100} value={form.join_year} onChange={(e) => set("join_year", e.target.value)} />
              </Field>
              <Field label={t.membersPage.leftYear} htmlFor="m-left">
                <Input id="m-left" type="number" min={1990} max={2100} value={form.left_year} onChange={(e) => set("left_year", e.target.value)} />
              </Field>
              <Field label={t.membersPage.affiliation} htmlFor="m-aff">
                <Input id="m-aff" value={form.current_affiliation} onChange={(e) => set("current_affiliation", e.target.value)} />
              </Field>
            </div>
            <LinksEditor label={t.membersPage.links} value={form.links} onChange={(links) => set("links", links)} />

            {isAdmin ? (
              <fieldset disabled={locked} className="grid gap-4 rounded-lg border border-dashed p-3" data-testid="admin-fields">
                <span className="text-xs font-medium text-muted-foreground">{t.membersPage.adminSection}</span>
                {locked ? <p className="text-xs text-status-amber-fg">{t.membersPage.adminLocked}</p> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t.auth.email} htmlFor="m-email">
                    <Input id="m-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                  </Field>
                  <Field label={t.account.position} htmlFor="m-position">
                    <NativeSelect id="m-position" value={form.position} onChange={(e) => set("position", e.target.value)}>
                      {POSITIONS.map((p) => (
                        <option key={p} value={p}>
                          {t.positions[p]}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label={t.account.role} htmlFor="m-role">
                    <NativeSelect id="m-role" value={form.app_role} onChange={(e) => set("app_role", e.target.value)}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t.roles[r]}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label={t.membersPage.sortOrder} htmlFor="m-sort">
                    <Input id="m-sort" type="number" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox data-testid="alumni" checked={form.is_alumni} onChange={(e) => set("is_alumni", e.target.checked)} />
                  {t.membersPage.alumni}
                </label>
                {isSystemAdmin && member ? (
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      data-testid="system-admin"
                      className="mt-0.5"
                      checked={!!form.is_system_admin && form.app_role === "admin" && !form.is_alumni}
                      disabled={form.app_role !== "admin" || form.is_alumni}
                      onChange={(e) => set("is_system_admin", e.target.checked)}
                    />
                    <span>
                      {t.roles.systemAdmin}
                      <span className="block text-xs text-muted-foreground">{t.membersPage.systemAdminHint}</span>
                    </span>
                  </label>
                ) : null}
              </fieldset>
            ) : null}
          </fieldset>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t.common.cancel}
          </Button>
          <Button type="submit" disabled={pending || uploading}>
            {pending ? t.common.saving : t.common.save}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
