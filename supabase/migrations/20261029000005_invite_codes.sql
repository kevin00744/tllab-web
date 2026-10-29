-- =============================================================================
-- TL Lab Hub — 05 邀請碼註冊（Email + 密碼）
-- -----------------------------------------------------------------------------
-- 流程（由網頁伺服器端以 service_role 執行）：
--   1. claim_invite_code(code, email)     驗證並佔用一次邀請碼
--   2. auth.admin.createUser(email, password, email_confirm = true)
--        → handle_new_auth_user() 依 email 綁定或建立成員
--      建立失敗時呼叫 release_invite_code(invite_id) 歸還次數
--   3. complete_invite_signup(invite_id, user_id)  套用邀請碼的權限與職稱
-- Supabase 的公開註冊（Allow new users to sign up）維持關閉；不需要 SMTP。
-- =============================================================================

create table public.invite_codes (
  id           uuid primary key default gen_random_uuid(),
  code_hash    text not null unique,                       -- sha256(正規化後的邀請碼)，不存原文
  code_hint    text not null,                              -- 末 4 碼，方便管理者辨識
  note         text,                                       -- 例如「2026 新生」
  app_role     public.app_role not null default 'member',
  position     public.member_position,                     -- 新建成員時套用的職稱
  email        text,                                       -- 限定只能由此 email 使用（可空）
  member_id    uuid references public.members (id) on delete cascade,  -- 綁定既有成員（可空）
  max_uses     integer not null default 1 check (max_uses between 1 and 100),
  used_count   integer not null default 0 check (used_count >= 0),
  expires_at   timestamptz not null default now() + interval '14 days',
  revoked_at   timestamptz,
  created_by   uuid default public.current_member_id() references public.members (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint invite_codes_usage check (used_count <= max_uses)
);
create index invite_codes_created_idx on public.invite_codes (created_at desc);

create table public.invite_redemptions (
  id          bigint generated always as identity primary key,
  invite_id   uuid not null references public.invite_codes (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  email       text not null,
  redeemed_at timestamptz not null default now()
);
create index invite_redemptions_invite_idx on public.invite_redemptions (invite_id);

alter table public.invite_codes enable row level security;
alter table public.invite_redemptions enable row level security;

-- 只有 Admin 可以查看、撤銷邀請碼；新增一律透過 create_invite_code()
create policy invite_codes_select on public.invite_codes for select to authenticated
  using (public.is_admin());
create policy invite_codes_update on public.invite_codes for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy invite_codes_delete on public.invite_codes for delete to authenticated
  using (public.is_admin());
create policy invite_redemptions_select on public.invite_redemptions for select to authenticated
  using (public.is_admin());

-- 邀請碼正規化：去除空白與連字號、轉大寫（使用者輸入 tl-ab12-... 也能通過）
create or replace function public.normalize_invite_code(p_code text)
returns text
language sql immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- -----------------------------------------------------------------------------
-- 產生邀請碼（Admin；或在 SQL Editor 以 postgres 執行）
-- 回傳邀請碼原文，只會出現這一次
-- -----------------------------------------------------------------------------
create or replace function public.create_invite_code(
  p_app_role       public.app_role default 'member',
  p_position       public.member_position default null,
  p_email          text default null,
  p_member_id      uuid default null,
  p_max_uses       integer default 1,
  p_expires_days   integer default 14,
  p_note           text default null
)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_raw  text;
  v_code text;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception '只有 Admin 可以產生邀請碼' using errcode = '42501';
  end if;
  if p_expires_days not between 1 and 365 then
    raise exception '有效天數需介於 1–365';
  end if;

  -- 兩個 UUID v4 的隨機十六進位字元，共 64 bits
  v_raw := upper(left(replace(gen_random_uuid()::text, '-', ''), 8)
              || left(replace(gen_random_uuid()::text, '-', ''), 8));
  v_code := 'TL-' || substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4)
              || '-' || substr(v_raw, 9, 4) || '-' || substr(v_raw, 13, 4);

  insert into public.invite_codes
    (code_hash, code_hint, note, app_role, position, email, member_id, max_uses, expires_at)
  values (
    encode(sha256(convert_to(public.normalize_invite_code(v_code), 'UTF8')), 'hex'),
    right(v_raw, 4), p_note, p_app_role, p_position, nullif(lower(trim(p_email)), ''),
    p_member_id, p_max_uses, now() + make_interval(days => p_expires_days)
  );
  return v_code;
end;
$$;

-- -----------------------------------------------------------------------------
-- 以下三個函式只給網頁伺服器端（service_role）呼叫
-- -----------------------------------------------------------------------------
create or replace function public.claim_invite_code(p_code text, p_email text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email  text := lower(trim(p_email));
  v_invite public.invite_codes;
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email 格式不正確' using errcode = '22023';
  end if;

  -- 原子性佔用一次，避免同時註冊超過可用次數
  update public.invite_codes ic
     set used_count = ic.used_count + 1
   where ic.code_hash = encode(sha256(convert_to(public.normalize_invite_code(p_code), 'UTF8')), 'hex')
     and ic.revoked_at is null
     and ic.expires_at > now()
     and ic.used_count < ic.max_uses
     and (ic.email is null or ic.email = v_email)
  returning ic.* into v_invite;

  if not found then
    -- 不透露是哪一項不符，避免被用來猜測邀請碼
    raise exception '邀請碼無效、已過期或已使用完畢' using errcode = '22023';
  end if;

  -- 綁定既有成員：先填入 email，建立帳號時 handle_new_auth_user() 會自動綁定
  if v_invite.member_id is not null then
    if exists (select 1 from public.members m
                where lower(m.email) = v_email and m.id <> v_invite.member_id) then
      raise exception '此 Email 已屬於其他成員' using errcode = '23505';
    end if;
    update public.members m
       set email = v_email
     where m.id = v_invite.member_id and m.user_id is null;
    if not found then
      raise exception '此邀請碼對應的成員已經註冊' using errcode = '22023';
    end if;
  end if;

  return v_invite.id;
end;
$$;

-- 建立帳號失敗（例如 Email 已被註冊）時歸還次數
create or replace function public.release_invite_code(p_invite_id uuid)
returns void
language sql security definer
set search_path = ''
as $$
  update public.invite_codes
     set used_count = greatest(used_count - 1, 0)
   where id = p_invite_id;
$$;

create or replace function public.complete_invite_signup(p_invite_id uuid, p_user_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_invite public.invite_codes;
  v_member_id uuid;
  v_email text;
begin
  select * into v_invite from public.invite_codes where id = p_invite_id;
  if not found then
    raise exception '邀請碼不存在';
  end if;

  update public.members m
     set app_role = v_invite.app_role,
         position = coalesce(v_invite.position, m.position)
   where m.user_id = p_user_id
  returning m.id, m.email into v_member_id, v_email;

  if v_member_id is null then
    raise exception '找不到此帳號對應的成員';
  end if;

  insert into public.invite_redemptions (invite_id, user_id, email)
  values (p_invite_id, p_user_id, coalesce(v_email, ''));
  return v_member_id;
end;
$$;

revoke execute on function public.claim_invite_code(text, text),
  public.release_invite_code(uuid),
  public.complete_invite_signup(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_invite_code(text, text),
  public.release_invite_code(uuid),
  public.complete_invite_signup(uuid, uuid)
  to service_role;

revoke execute on function public.create_invite_code(public.app_role, public.member_position, text, uuid, integer, integer, text)
  from public, anon;
grant execute on function public.create_invite_code(public.app_role, public.member_position, text, uuid, integer, integer, text)
  to authenticated;
