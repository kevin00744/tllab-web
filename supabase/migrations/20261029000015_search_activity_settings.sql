-- =============================================================================
-- TL Lab Hub — 15 全站搜尋、活動紀錄、頁面設定（階段 7）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 全站搜尋：多回傳 link_key（文件的網址代稱）；另搜尋會議地點、Action items、FAQ／Pipeline 標籤
-- 回傳欄位改變，需先 drop
-- -----------------------------------------------------------------------------
drop function if exists public.search_all(text, integer);
create or replace function public.search_all(q text, max_results integer default 30)
returns table (
  entity_type text,
  id          uuid,
  title       text,
  subtitle    text,
  emoji       text,
  score       real,
  link_key    text
)
language sql stable
set search_path = public, extensions
as $$
  with params as (
    select '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
           trim(q) as term
  ),
  hits as (
    select 'member'::text, m.id, m.name, coalesce(m.name_en, '') || ' · ' || array_to_string(m.research_interests, ', '),
           '👤'::text, similarity(m.name || ' ' || coalesce(m.name_en, ''), p.term), null::text
      from members m, params p
     where m.name ilike p.pat or m.name_en ilike p.pat or m.email ilike p.pat
        or array_to_string(m.research_interests, ' ') ilike p.pat
    union all
    select 'project', pr.id, pr.title, left(pr.description, 120), pr.emoji, similarity(pr.title, p.term), null
      from projects pr, params p
     where pr.title ilike p.pat or pr.description ilike p.pat or array_to_string(pr.tags, ' ') ilike p.pat
    union all
    select 'task', t.id, t.title, left(t.description, 120), '✅', similarity(t.title, p.term), null
      from tasks t, params p
     where t.title ilike p.pat or t.description ilike p.pat
    union all
    select 'publication', pb.id, pb.title, pb.venue, pb.emoji, similarity(pb.title, p.term), null
      from publications pb, params p
     where pb.title ilike p.pat or pb.venue ilike p.pat or pb.doi ilike p.pat or pb.notes ilike p.pat
    union all
    select 'meeting', mt.id, mt.title, to_char(mt.starts_at at time zone 'Asia/Taipei', 'YYYY-MM-DD'), mt.emoji,
           similarity(mt.title, p.term), null
      from meetings mt, params p
     where mt.title ilike p.pat or mt.summary ilike p.pat or mt.decisions ilike p.pat
        or mt.location ilike p.pat
        or exists (select 1 from action_items a where a.meeting_id = mt.id and a.content ilike p.pat)
    union all
    select 'document', d.id, d.title, left(d.content, 120), d.emoji, similarity(d.title, p.term), d.slug
      from documents d, params p
     where d.title ilike p.pat or d.content ilike p.pat
    union all
    select 'faq', f.id, f.question, f.category, '❓', similarity(f.question, p.term), null
      from faqs f, params p
     where f.question ilike p.pat or f.answer ilike p.pat or array_to_string(f.tags, ' ') ilike p.pat
    union all
    select 'software_tool', s.id, s.name, s.purpose, s.emoji, similarity(s.name, p.term), null
      from software_tools s, params p
     where s.name ilike p.pat or s.purpose ilike p.pat or s.category ilike p.pat
    union all
    select 'pipeline', pl.id, pl.name, left(pl.description, 120), pl.emoji, similarity(pl.name, p.term), null
      from pipelines pl, params p
     where pl.name ilike p.pat or pl.description ilike p.pat or array_to_string(pl.tags, ' ') ilike p.pat
  )
  select * from hits h(entity_type, id, title, subtitle, emoji, score, link_key)
   where length(trim(q)) > 0
   order by h.score desc, h.title
   limit greatest(1, least(max_results, 100));
$$;

revoke execute on function public.search_all(text, integer) from public, anon;
grant execute on function public.search_all(text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 活動紀錄
-- 篩選：entity_type、entity_id、actor_id、before（上一頁最後一筆的 id，往前翻頁）、limit（預設 30，最多 100）
-- 依時間排序：同一人 10 分鐘內的修改會合併到舊的一筆並更新時間，所以不能只依 id 排序
-- 只動到帳號綁定等內部欄位的更新不列出
-- -----------------------------------------------------------------------------
create or replace function public.list_activity(p_filter jsonb default '{}'::jsonb)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'action', l.action, 'entity_type', l.entity_type, 'entity_id', l.entity_id,
           'entity_title', l.entity_title, 'changes', l.changes, 'created_at', l.created_at,
           'actor', public.member_brief(l.actor_id),
           -- 文件以網址代稱連結；已刪除的資料為 null（不顯示連結）
           'link_key', case l.entity_type
             when 'document' then (select d.slug from public.documents d where d.id = l.entity_id)
             when 'member' then (select m.id::text from public.members m where m.id = l.entity_id)
             when 'project' then (select x.id::text from public.projects x where x.id = l.entity_id)
             when 'task' then (select x.id::text from public.tasks x where x.id = l.entity_id)
             when 'publication' then (select x.id::text from public.publications x where x.id = l.entity_id)
             when 'meeting' then (select x.id::text from public.meetings x where x.id = l.entity_id)
             when 'faq' then (select x.id::text from public.faqs x where x.id = l.entity_id)
             when 'software_tool' then (select x.id::text from public.software_tools x where x.id = l.entity_id)
             when 'pipeline' then (select x.id::text from public.pipelines x where x.id = l.entity_id)
           end
         ) order by l.created_at desc, l.id desc), '[]'::jsonb)
    from (select * from public.activity_log a
           where (p_filter ->> 'entity_type' is null or a.entity_type = p_filter ->> 'entity_type')
             and (p_filter ->> 'entity_id' is null or a.entity_id = (p_filter ->> 'entity_id')::uuid)
             and (p_filter ->> 'actor_id' is null or a.actor_id = (p_filter ->> 'actor_id')::uuid)
             and (p_filter ->> 'before' is null
                  or (a.created_at, a.id) < (select b.created_at, b.id from public.activity_log b
                                              where b.id = (p_filter ->> 'before')::bigint))
             and not (a.action = 'update' and a.changes is not null
                      and not exists (select 1 from jsonb_object_keys(a.changes) k
                                       where k not in ('user_id', 'updated_at', 'updated_by')))
           order by a.created_at desc, a.id desc
           limit least(greatest(coalesce((p_filter ->> 'limit')::int, 30), 1), 100)) l;
$$;

-- -----------------------------------------------------------------------------
-- 頁面設定：側邊欄 emoji 與名稱（Admin）
-- -----------------------------------------------------------------------------
insert into public.page_settings (key, emoji, title, title_en)
values ('activity', '🕘', '活動紀錄', 'Activity')
on conflict (key) do nothing;

create or replace function public.list_page_settings()
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'emoji', s.emoji, 'title', s.title, 'title_en', s.title_en)
                            order by s.key), '[]'::jsonb)
    from public.page_settings s;
$$;

create or replace function public.save_page_setting(p_key text, p_emoji text, p_title text, p_title_en text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if trim(coalesce(p_title, '')) = '' or trim(coalesce(p_title_en, '')) = '' then
    raise exception 'titleRequired' using errcode = '22023';
  end if;
  update public.page_settings
     set emoji = coalesce(nullif(trim(coalesce(p_emoji, '')), ''), emoji), title = trim(p_title), title_en = trim(p_title_en)
   where key = p_key;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['list_activity(jsonb)', 'list_page_settings()', 'save_page_setting(text, text, text, text)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
