"use client";

import { KeyRoundIcon, TicketIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createInvite, deleteMember, resetMemberPassword } from "@/app/(app)/members/actions";
import { ConfirmDelete } from "@/components/common/confirm-delete";
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
import { format } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { MemberProfile } from "@/types/entities";
import { SecretReveal } from "./secret-reveal";

/** 成員頁的 Admin 面板：帳號狀態、重設密碼、產生綁定邀請碼、刪除成員 */
export function MemberAdmin({ member }: { member: MemberProfile }) {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <section className="rounded-xl border border-dashed px-4 py-3" aria-label={t.membersPage.adminSection}>
      <h2 className="mb-2 text-xs font-medium text-muted-foreground">{t.membersPage.adminSection}</h2>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t.membersPage.account}</span>
        <Badge tone={member.has_account ? "green" : "gray"} data-testid="account-status">
          {member.has_account ? t.membersPage.accountLinked : t.membersPage.accountNone}
        </Badge>
      </div>
      {member.manageable ? null : <p className="mb-2 text-xs text-status-amber-fg">{t.membersPage.adminLocked}</p>}
      <div className="flex flex-wrap gap-2">
        {member.has_account ? member.manageable ? <ResetPassword member={member} /> : null : <BoundInvite member={member} />}
        {member.is_me || !member.manageable ? null : (
          <ConfirmDelete
            name={member.name}
            trigger={
              <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                <Trash2Icon /> {t.membersPage.deleteMember}
              </Button>
            }
            onConfirm={async () => {
              const result = await deleteMember(member.id);
              if (!result.ok) {
                toast.error(t.errors[result.error]);
                return false;
              }
              toast.success(t.common.deleted);
              router.push("/members");
              return true;
            }}
          />
        )}
      </div>
    </section>
  );
}

function ResetPassword({ member }: { member: MemberProfile }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setPassword(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <KeyRoundIcon /> {t.membersPage.resetPassword}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" closeLabel={t.common.close}>
        <DialogHeader>
          <DialogTitle>{t.membersPage.resetPassword}</DialogTitle>
          <DialogDescription>{format(t.membersPage.resetPasswordBody, { name: member.name })}</DialogDescription>
        </DialogHeader>
        {password ? (
          <DialogBody>
            <SecretReveal value={password} label={t.membersPage.resetDone} />
          </DialogBody>
        ) : null}
        <DialogFooter>
          {password ? (
            <Button type="button" onClick={() => setOpen(false)}>
              {t.common.close}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await resetMemberPassword(member.id);
                    if (!result.ok) {
                      toast.error(result.error === "notFound" ? t.membersPage.noAccountToReset : t.errors[result.error]);
                      return;
                    }
                    setPassword(result.data);
                  })
                }
              >
                {t.membersPage.resetPassword}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 尚未註冊的成員：產生綁定此成員的邀請碼，註冊後自動連結 */
function BoundInvite({ member }: { member: MemberProfile }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setCode(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <TicketIcon /> {t.membersPage.makeInvite}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" closeLabel={t.common.close}>
        <DialogHeader>
          <DialogTitle>{code ? t.invitesPage.createdTitle : t.membersPage.makeInvite}</DialogTitle>
          <DialogDescription>{code ? t.invitesPage.createdBody : format(t.membersPage.makeInviteBody, { name: member.name })}</DialogDescription>
        </DialogHeader>
        {code ? (
          <DialogBody>
            <SecretReveal value={code} label={t.invitesPage.code} />
          </DialogBody>
        ) : null}
        <DialogFooter>
          {code ? (
            <Button type="button" onClick={() => setOpen(false)}>
              {t.common.close}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await createInvite({
                      app_role: member.app_role,
                      position: member.position,
                      email: member.email ?? "",
                      member_id: member.id,
                      max_uses: 1,
                      expires_days: 14,
                      note: member.name,
                    });
                    if (!result.ok) return void toast.error(t.errors[result.error]);
                    setCode(result.data);
                  })
                }
              >
                {t.membersPage.makeInvite}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
