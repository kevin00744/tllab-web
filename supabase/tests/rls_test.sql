-- =============================================================================
-- TL Lab Hub — 權限與功能測試（由 scripts/test-db.sh 執行）
-- 失敗時 raise exception 中止
-- =============================================================================

-- 測試用：活動紀錄只有 Admin 讀得到（migration 19），以下用 definer helper 檢查 trigger 寫入的內容
create function public.t_activity() returns setof public.activity_log
language sql security definer set search_path = '' as $$ select * from public.activity_log $$;
create function public.t_list_activity(p jsonb) returns jsonb
language sql security definer set search_path = '' as $$ select public.list_activity(p) $$;
grant execute on function public.t_activity(), public.t_list_activity(jsonb) to authenticated;

-- 模擬登入：PI(admin)、張家豪(member)、楊子豪(校友 viewer)、未登記的新帳號
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'PI@tllab.example', '{"full_name": "Tsung-Lin Liu"}'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'chiahao.chang@tllab.example', '{"avatar_url": "https://example.com/a.png"}'),
  ('aaaaaaaa-0000-0000-0000-000000000013', 'tzuhao.yang@alumni.example', '{}'),
  ('aaaaaaaa-0000-0000-0000-000000000099', 'stranger@gmail.com', '{"name": "Stranger"}');

do $$
begin
  assert (select user_id from members where id = '10000000-0000-0000-0000-000000000001')
         = 'aaaaaaaa-0000-0000-0000-000000000001', 'PI 應以 email（不分大小寫）綁定';
  assert (select avatar_url from members where id = '10000000-0000-0000-0000-000000000005')
         = 'https://example.com/a.png', '綁定時應帶入頭像';
  assert (select app_role from members where email = 'stranger@gmail.com') = 'viewer', '未登記帳號應為 viewer';
  assert (select name from members where email = 'stranger@gmail.com') = 'Stranger';
end $$;

-- ---------------------------------------------------------------------------
-- anon：只能讀公開資料（完整測試見「階段 10」）
-- ---------------------------------------------------------------------------
set role anon;
do $$
begin
  assert (select count(*) from members) > 0, 'anon 可讀成員公開欄位';
  begin
    perform email from members limit 1;
    raise exception 'anon 不應讀到 email';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- viewer（校友）：可讀不可寫
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000013';
do $$
declare n int;
begin
  assert (select count(*) from projects) = 6, 'viewer 應可讀所有專案';
  assert (select count(*) from v_upcoming_deadlines) > 0, 'viewer 應可讀 deadline 檢視';
  begin
    insert into tasks (title) values ('viewer 不該能新增');
    raise exception 'viewer 不應可新增任務';
  exception when insufficient_privilege then null;
  end;
  update projects set progress = 99 where id = '20000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'viewer 不應可修改專案';
end $$;

-- ---------------------------------------------------------------------------
-- member（張家豪，AO 專案負責人）
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';
do $$
declare
  n int;
  v_task uuid;
begin
  -- 自己負責的專案可改
  update projects set progress = 70 where id = '20000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 1, 'member 應可修改自己負責的專案';

  -- 無關的專案不可改
  update projects set progress = 99 where id = '20000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'member 不應可修改無關專案';

  -- 無關的任務不可改（顯微鏡控制軟體重構的任務）
  update tasks set status = 'done' where id = '50000000-0000-0000-0000-000000000014';
  get diagnostics n = row_count;
  assert n = 0, 'member 不應可修改無關任務';

  -- 自己專案下的任務可改，完成時自動填 completed_at
  update tasks set status = 'done' where id = '50000000-0000-0000-0000-000000000003';
  assert (select completed_at is not null from tasks where id = '50000000-0000-0000-0000-000000000003');

  -- 新增任務並指派他人
  insert into tasks (title, project_id, due_date) values ('測試任務', null, lab_today() + 1)
    returning id into v_task;
  assert (select created_by from tasks where id = v_task) = '10000000-0000-0000-0000-000000000005',
    'created_by 應自動填入';
  insert into task_assignees (task_id, member_id) values (v_task, '10000000-0000-0000-0000-000000000006');

  -- 不可冒名建立
  begin
    insert into tasks (title, created_by) values ('冒名', '10000000-0000-0000-0000-000000000001');
    raise exception '不應可冒名建立任務';
  exception when insufficient_privilege then null;
  end;

  -- 可改自己的個人資料，但不可提升權限
  update members set bio = '光學設計' where id = '10000000-0000-0000-0000-000000000005';
  get diagnostics n = row_count;
  assert n = 1, 'member 應可修改自己的資料';
  begin
    update members set app_role = 'admin' where id = '10000000-0000-0000-0000-000000000005';
    raise exception '不應可自行提升權限';
  exception when insufficient_privilege then null;
  end;
  update members set bio = 'x' where id = '10000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  assert n = 0, 'member 不應可修改他人資料';

  -- 無關會議的 Action item 不可轉 Task（會議 3 未出席、也非被指派者）
  begin
    perform convert_action_item_to_task(
      (select id from action_items where content = '寄送類器官樣本規格給合作實驗室'));
    raise exception '不應可轉換無關的 Action item';
  exception when insufficient_privilege then null;
  end;

  -- 活動紀錄
  assert exists (select 1 from t_activity()
                  where actor_id = '10000000-0000-0000-0000-000000000005'
                    and entity_type = 'project' and changes ? 'progress'), '應記錄專案修改';
  assert exists (select 1 from t_activity()
                  where entity_id = v_task and changes ? 'assignee_added'), '應記錄指派';

  -- 搜尋（中英文）
  assert exists (select 1 from search_all('斑馬魚') where entity_type = 'project'), '中文搜尋';
  assert exists (select 1 from search_all('trackformer') where entity_type = 'publication'), '英文不分大小寫搜尋';
  assert exists (select 1 from search_all('Napari') where entity_type = 'software_tool');
  assert not exists (select 1 from search_all('   ')), '空字串不應回傳結果';
  assert not exists (select 1 from search_all('100%')), '% 應被跳脫';

  -- Dashboard
  assert (dashboard_kpis() ->> 'active_projects')::int = 3, 'KPI 進行中專案數';
  assert (dashboard_kpis() ->> 'tasks_overdue')::int >= 1, 'KPI 逾期任務';
  assert (dashboard_kpis() ->> 'publications_under_submission')::int = 2, 'KPI 投稿中';
  assert (select sum(total) from v_publication_stage_counts) = 8;
end $$;

-- ---------------------------------------------------------------------------
-- admin（PI）
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$
declare
  n int;
  v_item uuid;
  v_task uuid;
begin
  update projects set status = 'active' where id = '20000000-0000-0000-0000-000000000005';
  get diagnostics n = row_count;
  assert n = 1, 'admin 應可修改任何專案';

  update members set app_role = 'member' where email = 'stranger@gmail.com';
  get diagnostics n = row_count;
  assert n = 1, 'admin 應可調整權限';

  -- Action item 一鍵轉 Task
  select id into v_item from action_items where content = '寄送類器官樣本規格給合作實驗室';
  v_task := convert_action_item_to_task(v_item);
  assert (select task_id from action_items where id = v_item) = v_task;
  assert (select project_id from tasks where id = v_task) is not null, '任務應繼承會議關聯專案';
  assert exists (select 1 from task_assignees where task_id = v_task
                    and member_id = '10000000-0000-0000-0000-000000000007'), '任務應繼承指派對象';
  assert convert_action_item_to_task(v_item) = v_task, '重複轉換應回傳同一任務';
end $$;

reset role;
reset request.jwt.claim.sub;

-- 至少保留一位 Admin
do $$
begin
  update members set app_role = 'member' where id = '10000000-0000-0000-0000-000000000002';
  begin
    update members set app_role = 'member' where id = '10000000-0000-0000-0000-000000000001';
    raise exception '應阻擋移除最後一位 Admin';
  exception when raise_exception then
    if sqlerrm not like '%至少需要保留一位 Admin%' then raise; end if;
  end;
end $$;

-- Storage bucket 建立
do $$
begin
  assert (select count(*) from storage.buckets where id in ('avatars', 'attachments')) = 2;
end $$;

-- ---------------------------------------------------------------------------
-- 邀請碼註冊
-- ---------------------------------------------------------------------------
create temp table t_codes (k text primary key, code text);
grant all on t_codes to authenticated, service_role;

-- 非 Admin 不能產生邀請碼；Admin 可以
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000013';  -- viewer
do $$
begin
  begin
    perform create_invite_code();
    raise exception 'viewer 不應可產生邀請碼';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from invite_codes) = 0, 'viewer 不應看到邀請碼';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';  -- PI (admin)
do $$
declare v text;
begin
  v := create_invite_code(p_position => 'master', p_note => '2026 新生');
  assert v ~ '^TL-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$', '邀請碼格式：' || v;
  insert into t_codes values ('single', v);
  insert into t_codes values ('multi', create_invite_code(p_max_uses => 2));
  insert into t_codes values ('locked', create_invite_code(p_email => 'Only.Me@example.com'));
  insert into t_codes values ('admin', create_invite_code(p_app_role => 'admin'));
  insert into t_codes values ('expired', create_invite_code());
  -- 綁定既有成員（示範資料中尚未登入的林冠宇）
  insert into t_codes values ('bind', create_invite_code(p_member_id => '10000000-0000-0000-0000-000000000003'));
  assert (select count(*) from invite_codes) = 6, 'admin 應可看到邀請碼';
  assert not exists (select 1 from invite_codes where code_hash like '%' || 'TL-' || '%'), '不應存原文';
  assert (select created_by from invite_codes where note = '2026 新生') = '10000000-0000-0000-0000-000000000001';
end $$;
reset role;
reset request.jwt.claim.sub;
update invite_codes set expires_at = now() - interval '1 second'
 where code_hash = encode(sha256(convert_to(normalize_invite_code((select code from t_codes where k = 'expired')), 'UTF8')), 'hex');

-- 一般使用者不可直接呼叫伺服器端函式
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$
begin
  begin
    perform claim_invite_code((select code from t_codes where k = 'single'), 'x@example.com');
    raise exception 'authenticated 不應可呼叫 claim_invite_code';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
reset request.jwt.claim.sub;

-- 模擬網頁伺服器端註冊流程（service_role）
create function pg_temp.signup(p_code text, p_email text) returns uuid language plpgsql as $$
declare v_invite uuid; v_user uuid;
begin
  set local role service_role;
  v_invite := claim_invite_code(p_code, p_email);
  reset role;
  insert into auth.users (email) values (p_email) returning id into v_user;  -- auth.admin.createUser
  set local role service_role;
  perform complete_invite_signup(v_invite, v_user);
  reset role;
  return v_user;
end $$;

do $$
declare
  v_user uuid;
  v_invite uuid;
  n int;
begin
  -- 單次邀請碼：使用者輸入小寫、少了連字號也能通過；套用職稱與權限
  v_user := pg_temp.signup(lower(replace((select code from t_codes where k = 'single'), '-', ' ')), 'Newbie@Example.com');
  assert (select app_role from members where user_id = v_user) = 'member', '應套用邀請碼權限';
  assert (select position from members where user_id = v_user) = 'master', '應套用邀請碼職稱';
  assert exists (select 1 from invite_redemptions where user_id = v_user), '應記錄使用紀錄';

  -- 已用完
  begin
    perform pg_temp.signup((select code from t_codes where k = 'single'), 'second@example.com');
    raise exception '單次邀請碼不應可重複使用';
  exception when invalid_parameter_value then null;
  end;

  -- 多次邀請碼
  perform pg_temp.signup((select code from t_codes where k = 'multi'), 'm1@example.com');
  perform pg_temp.signup((select code from t_codes where k = 'multi'), 'm2@example.com');
  begin
    perform pg_temp.signup((select code from t_codes where k = 'multi'), 'm3@example.com');
    raise exception '超過次數不應可使用';
  exception when invalid_parameter_value then null;
  end;

  -- 限定 Email
  begin
    perform pg_temp.signup((select code from t_codes where k = 'locked'), 'other@example.com');
    raise exception '限定 Email 的邀請碼不應給別人用';
  exception when invalid_parameter_value then null;
  end;
  perform pg_temp.signup((select code from t_codes where k = 'locked'), 'only.me@EXAMPLE.com');

  -- 過期、錯誤的邀請碼
  begin
    perform pg_temp.signup((select code from t_codes where k = 'expired'), 'late@example.com');
    raise exception '過期邀請碼不應可使用';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform pg_temp.signup('TL-0000-0000-0000-0000', 'guess@example.com');
    raise exception '錯誤邀請碼不應可使用';
  exception when invalid_parameter_value then null;
  end;

  -- 撤銷
  update invite_codes set revoked_at = now() where app_role = 'admin';
  begin
    perform pg_temp.signup((select code from t_codes where k = 'admin'), 'boss@example.com');
    raise exception '撤銷的邀請碼不應可使用';
  exception when invalid_parameter_value then null;
  end;

  -- 綁定既有成員：註冊後連到原本的成員資料，不會多出一筆
  select count(*) into n from members;
  v_user := pg_temp.signup((select code from t_codes where k = 'bind'), 'kuanyu.real@gmail.com');
  assert (select id from members where user_id = v_user) = '10000000-0000-0000-0000-000000000003', '應綁定既有成員';
  assert (select count(*) from members) = n, '不應新增成員';

  -- 建立帳號失敗時歸還次數
  update invite_codes set revoked_at = null where app_role = 'admin';
  set local role service_role;
  v_invite := claim_invite_code((select code from t_codes where k = 'admin'), 'boss@example.com');
  perform release_invite_code(v_invite);
  reset role;
  assert (select used_count from invite_codes where id = v_invite) = 0, '失敗時應歸還次數';
end $$;

-- ---------------------------------------------------------------------------
-- 刪除成員：保留論文作者姓名，關聯欄位設為 null
-- ---------------------------------------------------------------------------
do $$
begin
  delete from members where id = '10000000-0000-0000-0000-000000000004';  -- 王詩涵（論文作者、專案負責人）
  assert exists (select 1 from publication_authors
                  where publication_id = '30000000-0000-0000-0000-000000000002'
                    and author_order = 1 and member_id is null and display_name = 'Shih-Han Wang'),
    '作者姓名應保留';
  assert (select owner_id from projects where id = '20000000-0000-0000-0000-000000000002') is null;
end $$;

-- ---------------------------------------------------------------------------
-- Dashboard：get_dashboard()（以張家豪身分）
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';
do $$
declare
  d jsonb := get_dashboard();
  prev date;
  item jsonb;
begin
  assert (d ->> 'today')::date = lab_today();
  assert (d -> 'kpis' ->> 'active_projects')::int >= 1, 'KPI';
  -- 我的任務：只含指派給自己、未完成，依截止日排序
  assert jsonb_array_length(d -> 'my_tasks') >= 2, '我的任務';
  assert not exists (
    select 1 from jsonb_array_elements(d -> 'my_tasks') t
     where not exists (select 1 from task_assignees ta
                        where ta.task_id = (t ->> 'id')::uuid
                          and ta.member_id = '10000000-0000-0000-0000-000000000005')
        or t ->> 'status' = 'done'), '只能有自己未完成的任務';
  for item in select * from jsonb_array_elements(d -> 'my_tasks') loop
    if item ->> 'due_date' is not null then
      assert prev is null or (item ->> 'due_date')::date >= prev, '依截止日排序';
      prev := (item ->> 'due_date')::date;
    end if;
  end loop;
  assert (d ->> 'my_open')::int >= jsonb_array_length(d -> 'my_tasks');
  -- 專案：不含已完成；進行中排最前
  assert not exists (select 1 from jsonb_array_elements(d -> 'projects') p where p ->> 'status' = 'completed');
  assert d -> 'projects' -> 0 ->> 'status' = 'active', '進行中專案排前面';
  -- 論文：六個階段依序
  assert jsonb_array_length(d -> 'publication_stages') = 6;
  assert d -> 'publication_stages' -> 0 ->> 'stage' = 'idea' and d -> 'publication_stages' -> 5 ->> 'stage' = 'published';
  -- 會議：最近 3 筆過去會議（新到舊）＋下次會議
  assert jsonb_array_length(d -> 'recent_meetings') = 3;
  assert (d -> 'recent_meetings' -> 0 ->> 'starts_at')::timestamptz >= (d -> 'recent_meetings' -> 1 ->> 'starts_at')::timestamptz;
  assert (d -> 'next_meeting' ->> 'starts_at')::timestamptz > now(), '下次會議';
  -- 截止日：未來 14 天內、含任務與論文
  assert not exists (select 1 from jsonb_array_elements(d -> 'deadlines') x
                      where (x ->> 'due_date')::date not between lab_today() and lab_today() + 13);
  assert exists (select 1 from jsonb_array_elements(d -> 'deadlines') x where x ->> 'kind' = 'publication');
  assert exists (select 1 from jsonb_array_elements(d -> 'deadlines') x where (x ->> 'mine')::boolean);
end $$;
reset role;
reset request.jwt.claim.sub;

-- anon：可呼叫，但沒有個人化資料（階段 10）
set role anon;
do $$
declare d jsonb := get_dashboard();
begin
  assert d -> 'my_tasks' = '[]'::jsonb or d -> 'my_tasks' is null, 'anon 沒有我的任務';
  assert not exists (select 1 from jsonb_array_elements(d -> 'deadlines') x where (x ->> 'mine')::boolean);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 階段 4 API：專案／任務／論文
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000006', 'pohan.huang@tllab.example');

-- 張家豪（member）
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';
do $$
declare
  v_pid uuid;
  v_tid uuid;
  v_pub uuid;
  j jsonb;
begin
  -- 專案列表：進行中排前，帶 editable
  j := list_projects();
  assert jsonb_array_length(j) = 6;
  assert j -> 0 ->> 'status' = 'active';
  assert (select (x ->> 'editable')::boolean from jsonb_array_elements(j) x
           where x ->> 'id' = '20000000-0000-0000-0000-000000000001'), '自己負責的專案 editable';
  assert not (select (x ->> 'editable')::boolean from jsonb_array_elements(j) x
               where x ->> 'id' = '20000000-0000-0000-0000-000000000002'), '無關專案不可編輯';
  assert jsonb_array_length(list_projects('{"status":"completed"}')) = 1;
  assert jsonb_array_length(list_projects('{"q":"斑馬魚"}')) = 1;
  assert jsonb_array_length(list_projects('{"q":"100%"}')) = 0, '% 需跳脫';

  -- 建立專案＋參與成員
  v_pid := save_project('{"title":"  新專案  ","emoji":"🧬","status":"active","progress":10,
                          "start_date":"2026-11-01","due_date":"2027-06-30","tags":["AI"," AI ",""],
                          "owner_id":"10000000-0000-0000-0000-000000000005",
                          "member_ids":["10000000-0000-0000-0000-000000000006","10000000-0000-0000-0000-000000000008"]}');
  j := get_project(v_pid);
  assert j ->> 'title' = '新專案' and j -> 'tags' = '["AI"]'::jsonb, '標題去空白、標籤去重';
  assert jsonb_array_length(j -> 'members') = 2;
  assert (j ->> 'editable')::boolean and (j ->> 'deletable')::boolean;

  -- 驗證
  begin perform save_project('{"title":" "}'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'titleRequired'; end;
  begin perform save_project('{"title":"a","start_date":"2026-12-01","due_date":"2026-11-01"}'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'dateOrder'; end;

  -- 無權限編輯／刪除
  begin perform save_project('{"id":"20000000-0000-0000-0000-000000000002","title":"偷改"}'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  begin perform delete_project('20000000-0000-0000-0000-000000000002'); raise exception 'x';
  exception when insufficient_privilege then null; end;

  -- 專案詳細頁：任務、論文、會議
  j := get_project('20000000-0000-0000-0000-000000000001');
  assert jsonb_array_length(j -> 'tasks') >= 4, '專案任務';
  assert jsonb_array_length(j -> 'publications') = 2, '專案論文';
  assert jsonb_array_length(j -> 'meetings') = 2, '專案會議';

  -- 任務：建立、指派、篩選、拖拉、刪除
  v_tid := save_task(jsonb_build_object('title', '新任務', 'project_id', v_pid, 'priority', 'high',
                     'due_date', lab_today() - 1,
                     'assignee_ids', jsonb_build_array('10000000-0000-0000-0000-000000000005')));
  assert exists (select 1 from jsonb_array_elements(list_tasks('{"mine":true}')) x where x ->> 'id' = v_tid::text);
  assert exists (select 1 from jsonb_array_elements(list_tasks('{"overdue":true}')) x where x ->> 'id' = v_tid::text);
  assert jsonb_array_length(list_tasks(jsonb_build_object('project_id', v_pid))) = 1;
  assert jsonb_array_length(list_tasks(jsonb_build_object('due_from', lab_today(), 'due_to', lab_today() + 7))) >= 3;
  j := move_task(v_tid, 'done', 0.5);
  assert j ->> 'status' = 'done' and (j ->> 'completed_at') is not null and (j ->> 'position')::float = 0.5;
  begin perform move_task('50000000-0000-0000-0000-000000000014', 'done', 1); raise exception 'x';
  exception when insufficient_privilege then null; end;
  perform save_task(jsonb_build_object('id', v_tid, 'title', '新任務（改）', 'status', 'in_review',
                    'assignee_ids', '[]'::jsonb));
  assert (select count(*) from task_assignees where task_id = v_tid) = 0;
  perform delete_task(v_tid);
  assert not exists (select 1 from tasks where id = v_tid);

  -- 論文：建立（含外部作者）、統計
  v_pub := save_publication(jsonb_build_object('title', '新論文', 'type', 'conference', 'stage', 'drafting',
             'authors', jsonb_build_array(
               jsonb_build_object('member_id', '10000000-0000-0000-0000-000000000005'),
               jsonb_build_object('display_name', 'External Coauthor'),
               jsonb_build_object('display_name', '  '),
               jsonb_build_object('member_id', '10000000-0000-0000-0000-000000000001', 'is_corresponding', true))));
  j := (select x from jsonb_array_elements(list_publications('{"stage":"drafting"}')) x where x ->> 'id' = v_pub::text);
  assert jsonb_array_length(j -> 'authors') = 3, '空白作者略過';
  assert (j -> 'authors' -> 0 ->> 'is_first_author')::boolean, '第一位預設為第一作者';
  assert j -> 'authors' -> 1 ->> 'name' = 'External Coauthor';
  assert (j -> 'authors' -> 2 ->> 'is_corresponding')::boolean;
  assert jsonb_array_length(list_publications('{"member_id":"10000000-0000-0000-0000-000000000005"}')) >= 3;
  j := publication_year_stats();
  assert exists (select 1 from jsonb_array_elements(j) x
                  where (x ->> 'year')::int = extract(year from lab_today()) and (x ->> 'journal')::int >= 1);
  -- 表單選單
  j := form_options();
  assert jsonb_array_length(j -> 'members') > 0 and (j ->> 'can_create')::boolean;
end $$;

-- 黃柏翰：只有「作者」身分的論文，修改作者清單（含移除自己）仍可成功
reset role;
reset request.jwt.claim.sub;
insert into publications (id, title, created_by) values ('30000000-0000-0000-0000-0000000000aa', '只有作者身分', '10000000-0000-0000-0000-000000000001');
insert into publication_authors (publication_id, member_id, author_order) values
  ('30000000-0000-0000-0000-0000000000aa', '10000000-0000-0000-0000-000000000006', 1);
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000006';
do $$
begin
  assert (select (x ->> 'editable')::boolean from jsonb_array_elements(list_publications()) x
           where x ->> 'id' = '30000000-0000-0000-0000-0000000000aa'), '作者可編輯';
  perform save_publication('{"id":"30000000-0000-0000-0000-0000000000aa","title":"只有作者身分","authors":[{"display_name":"Someone Else"}]}');
  assert (select count(*) from publication_authors where publication_id = '30000000-0000-0000-0000-0000000000aa') = 1;
  begin
    perform save_publication('{"id":"30000000-0000-0000-0000-0000000000aa","title":"再改"}');
    raise exception '移除自己後不應可再編輯';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 校友（viewer）不可建立
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000013';
do $$
begin
  begin perform save_task('{"title":"viewer"}'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  assert not (form_options() ->> 'can_create')::boolean;
end $$;
reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- 專案文件（attachments）
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';  -- 張家豪：AO 專案負責人
do $$
declare j jsonb;
begin
  insert into attachments (entity_type, entity_id, storage_path, file_name, kind, size_bytes, uploaded_by)
  values ('project', '20000000-0000-0000-0000-000000000001', 'project/20000000-0000-0000-0000-000000000001/a.pptx',
          'notes.pptx', 'slides', 120, current_member_id());
  j := list_attachments('project', '20000000-0000-0000-0000-000000000001');
  assert jsonb_array_length(j) = 1 and (j -> 0 ->> 'deletable')::boolean and j -> 0 ->> 'title' = 'notes.pptx';
  -- 無權限的專案不可上傳
  begin
    insert into attachments (entity_type, entity_id, storage_path, file_name, kind, uploaded_by)
    values ('project', '20000000-0000-0000-0000-000000000002', 'project/20000000-0000-0000-0000-000000000002/x.pdf',
            'x.pdf', 'slides', current_member_id());
    raise exception '不應可上傳到無權限專案';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into attachments (entity_type, entity_id, storage_path, file_name, kind, uploaded_by)
    values ('project', '20000000-0000-0000-0000-000000000001', 'p/y.bin', 'y.bin', 'video', current_member_id());
    raise exception 'kind 應受限制';
  exception when check_violation then null;
  end;
end $$;

-- 其他成員看得到、但不可刪除
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000006';
do $$
declare n int;
begin
  assert not (list_attachments('project', '20000000-0000-0000-0000-000000000001') -> 0 ->> 'deletable')::boolean;
  delete from attachments where file_name = 'notes.pptx';
  get diagnostics n = row_count;
  assert n = 0, '非上傳者不可刪除';
end $$;
reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- 專案頁面內容：自動儲存、同時編輯偵測、活動紀錄合併
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';
do $$
declare
  v int;
  n_before int;
  long text := repeat('長', 500);
begin
  v := (get_project('20000000-0000-0000-0000-000000000001') ->> 'content_version')::int;
  assert (get_project('20000000-0000-0000-0000-000000000001') -> 'files') is not null, '詳細頁含檔案';
  select count(*) into n_before from t_activity() where entity_id = '20000000-0000-0000-0000-000000000001';
  v := save_project_content('20000000-0000-0000-0000-000000000001', '# 第一版', v);
  v := save_project_content('20000000-0000-0000-0000-000000000001', '# 第二版' || long, v);
  assert (select content from projects where id = '20000000-0000-0000-0000-000000000001') like '# 第二版%';
  assert (select count(*) from t_activity() where entity_id = '20000000-0000-0000-0000-000000000001') <= n_before + 1,
    '連續修改應合併為一筆';
  assert (select length(changes -> 'content' ->> 'new') from t_activity()
           where entity_id = '20000000-0000-0000-0000-000000000001' order by created_at desc limit 1) <= 301,
    '長文字應截短';
  -- 用舊版本號儲存 → 衝突
  begin
    perform save_project_content('20000000-0000-0000-0000-000000000001', 'stale', v - 1);
    raise exception '應偵測到衝突';
  exception when serialization_failure then null;
  end;
  -- 無權限
  begin
    perform save_project_content('20000000-0000-0000-0000-000000000002', 'x', 0);
    raise exception '無權限';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- 階段 5：成員與邀請碼管理
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';  -- 張家豪（member）
do $$
declare j jsonb;
begin
  j := list_members();
  assert (j -> 0 ->> 'position') = 'pi', '依職稱排序，PI 在最前';
  assert not (j -> -1 ->> 'is_alumni') = 'false', '校友排在最後';
  assert jsonb_array_length(list_members('{"alumni":true}')) = 3;
  assert jsonb_array_length(list_members('{"position":"phd","alumni":false}')) >= 1;
  assert jsonb_array_length(list_members('{"q":"影像"}')) >= 1, '依研究方向搜尋';
  j := get_member('10000000-0000-0000-0000-000000000005');
  assert (j ->> 'is_me')::boolean and (j ->> 'editable')::boolean;
  assert exists (select 1 from jsonb_array_elements(j -> 'projects') p where (p ->> 'is_owner')::boolean), '負責專案';
  assert jsonb_array_length(j -> 'publications') >= 2 and jsonb_array_length(j -> 'tasks') >= 1;
  assert not (get_member('10000000-0000-0000-0000-000000000003') ->> 'editable')::boolean, '不可編輯他人';

  -- 本人修改個人資料：職稱／權限被忽略
  perform save_member(jsonb_build_object('id', '10000000-0000-0000-0000-000000000005', 'name', '張家豪',
    'name_en', 'Chia-Hao Chang', 'research_interests', jsonb_build_array('自適應光學', ' 光學設計 ', ''),
    'links', jsonb_build_array(jsonb_build_object('label', 'GitHub', 'url', 'https://github.com/x'),
                               jsonb_build_object('label', 'bad', 'url', 'javascript:alert(1)')),
    'position', 'pi', 'app_role', 'admin', 'avatar_url', 'https://x/a.webp'));
  assert (select position from members where id = '10000000-0000-0000-0000-000000000005') = 'phd', '本人不可改職稱';
  assert (select app_role from members where id = '10000000-0000-0000-0000-000000000005') = 'member', '本人不可改權限';
  assert (select research_interests from members where id = '10000000-0000-0000-0000-000000000005') = array['光學設計', '自適應光學'];
  assert jsonb_array_length((select links from members where id = '10000000-0000-0000-0000-000000000005')) = 1, '過濾非 http 連結';
  assert (select avatar_url from members where id = '10000000-0000-0000-0000-000000000005') = 'https://x/a.webp';
  -- 不可改他人、不可新增、不可刪除、不可查帳號
  begin perform save_member('{"id":"10000000-0000-0000-0000-000000000003","name":"x"}'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  begin perform save_member('{"name":"新人"}'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  begin perform delete_member('10000000-0000-0000-0000-000000000003'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  begin perform member_user_id('10000000-0000-0000-0000-000000000005'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  assert jsonb_array_length(list_invite_codes()) = 0, '非 Admin 看不到邀請碼';
end $$;

-- Admin（PI）
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$
declare
  v uuid;
  j jsonb;
begin
  v := save_member('{"name":"新博士生","email":"New.PhD@Example.com","position":"phd","app_role":"member","join_year":"2026"}');
  assert (select email from members where id = v) = 'new.phd@example.com';
  begin perform save_member('{"name":"重複","email":"new.phd@example.com"}'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'emailTaken'; end;
  begin perform save_member('{"name":" "}'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'nameRequired'; end;
  -- 設為校友、改權限
  perform save_member(jsonb_build_object('id', v, 'name', '新博士生', 'email', 'new.phd@example.com',
                      'position', 'phd', 'app_role', 'viewer', 'is_alumni', true, 'left_year', '2027'));
  assert (select is_alumni and app_role = 'viewer' from members where id = v);
  assert member_user_id('10000000-0000-0000-0000-000000000005') = 'aaaaaaaa-0000-0000-0000-000000000005';
  -- 邀請碼列表與撤銷
  perform create_invite_code(p_member_id => v, p_note => '測試');
  j := list_invite_codes();
  assert exists (select 1 from jsonb_array_elements(j) x where x ->> 'note' = '測試' and x ->> 'status' = 'active'
                   and x -> 'member' ->> 'name' = '新博士生');
  perform revoke_invite_code((select (x ->> 'id')::uuid from jsonb_array_elements(j) x where x ->> 'note' = '測試'));
  assert exists (select 1 from jsonb_array_elements(list_invite_codes()) x where x ->> 'note' = '測試' and x ->> 'status' = 'revoked');
  -- 刪除
  assert delete_member(v) is null, '未綁定帳號回傳 null';
  begin perform delete_member('10000000-0000-0000-0000-000000000001'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'cannotDeleteSelf'; end;
end $$;
reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- 系統管理員（migration 11）：管理員的身分只有系統管理員能變更
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000002', 'yichun.chen@tllab.example');
-- 「至少保留一位 Admin」測試曾把陳怡君降為 member，先恢復
update members set app_role = 'admin' where id = '10000000-0000-0000-0000-000000000002';
do $$
begin
  assert (select is_system_admin from members where id = '10000000-0000-0000-0000-000000000001'), 'PI 為系統管理員';
  assert not (select is_system_admin from members where id = '10000000-0000-0000-0000-000000000002');
end $$;

-- 一般 Admin（陳怡君）
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
do $$
declare
  pi jsonb := get_member('10000000-0000-0000-0000-000000000001');
  me jsonb := get_member('10000000-0000-0000-0000-000000000002');
begin
  assert is_admin() and not is_system_admin();
  assert not (pi ->> 'manageable')::boolean, '一般 Admin 不能管理系統管理員';
  assert not (me ->> 'manageable')::boolean, '一般 Admin 不能變更自己的身分';
  assert (get_member('10000000-0000-0000-0000-000000000005') ->> 'manageable')::boolean, '可以管理一般成員';
  -- 不能降級、設為校友、改 Email／職稱
  begin perform save_member(pi || '{"app_role":"member"}'); raise exception 'x';
  exception when insufficient_privilege then assert sqlerrm = 'adminProtected', sqlerrm; end;
  begin perform save_member(pi || '{"is_alumni":true}'); raise exception 'x';
  exception when insufficient_privilege then assert sqlerrm = 'adminProtected'; end;
  begin perform save_member(me || '{"position":"phd"}'); raise exception 'x';
  exception when insufficient_privilege then assert sqlerrm = 'adminProtected'; end;
  begin update members set is_system_admin = true where id = '10000000-0000-0000-0000-000000000002'; raise exception 'x';
  exception when insufficient_privilege then assert sqlerrm = 'adminProtected'; end;
  -- 個人資料（簡介）仍可編輯
  perform save_member(pi || '{"bio":"由一般 Admin 更新"}');
  assert (select bio from members where id = '10000000-0000-0000-0000-000000000001') = '由一般 Admin 更新';
  -- 可以把一般成員升為 Admin，但之後就不能再降級或刪除
  perform save_member(get_member('10000000-0000-0000-0000-000000000003') || '{"app_role":"admin"}');
  assert (select app_role from members where id = '10000000-0000-0000-0000-000000000003') = 'admin';
  begin perform save_member(get_member('10000000-0000-0000-0000-000000000003') || '{"app_role":"member"}'); raise exception 'x';
  exception when insufficient_privilege then assert sqlerrm = 'adminProtected'; end;
  begin perform delete_member('10000000-0000-0000-0000-000000000003'); raise exception 'x';
  exception when insufficient_privilege then assert sqlerrm = 'adminProtected'; end;
  -- 不能重設其他管理員的密碼；自己的可以
  begin perform member_user_id('10000000-0000-0000-0000-000000000001'); raise exception 'x';
  exception when insufficient_privilege then assert sqlerrm = 'adminProtected'; end;
  assert member_user_id('10000000-0000-0000-0000-000000000002') = 'aaaaaaaa-0000-0000-0000-000000000002';
  assert member_user_id('10000000-0000-0000-0000-000000000005') = 'aaaaaaaa-0000-0000-0000-000000000005';
end $$;

-- 系統管理員（PI）
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$
begin
  assert is_system_admin();
  assert (get_member('10000000-0000-0000-0000-000000000002') ->> 'manageable')::boolean;
  assert member_user_id('10000000-0000-0000-0000-000000000002') = 'aaaaaaaa-0000-0000-0000-000000000002';
  -- 可以把管理員降級、設為校友
  perform save_member(get_member('10000000-0000-0000-0000-000000000003') || '{"app_role":"member"}');
  assert (select app_role from members where id = '10000000-0000-0000-0000-000000000003') = 'member';
  perform save_member(get_member('10000000-0000-0000-0000-000000000002') || '{"is_alumni":true,"left_year":"2026"}');
  assert (select is_alumni from members where id = '10000000-0000-0000-0000-000000000002');
  perform save_member(get_member('10000000-0000-0000-0000-000000000002') || '{"is_alumni":false,"left_year":""}');
  -- 不能移除最後一位系統管理員
  begin perform save_member(get_member('10000000-0000-0000-0000-000000000001') || '{"app_role":"member"}'); raise exception 'x';
  exception when insufficient_privilege then assert sqlerrm like '%系統管理員%', sqlerrm; end;
  assert (select app_role = 'admin' and is_system_admin from members where id = '10000000-0000-0000-0000-000000000001');
end $$;
reset role;
reset request.jwt.claim.sub;

-- SQL Editor：移交系統管理員；不再是 Admin 時自動取消
do $$
begin
  update members set is_system_admin = true where id = '10000000-0000-0000-0000-000000000002';
  update members set app_role = 'member' where id = '10000000-0000-0000-0000-000000000002';
  assert not (select is_system_admin from members where id = '10000000-0000-0000-0000-000000000002'), '降級時自動取消系統管理員';
  update members set app_role = 'admin' where id = '10000000-0000-0000-0000-000000000002';
  begin update members set is_system_admin = false where id = '10000000-0000-0000-0000-000000000001'; raise exception 'x';
  exception when insufficient_privilege then null; end;
end $$;

-- 以網頁（save_member）管理系統管理員（migration 12）
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';  -- 一般 Admin：送來的值被忽略
do $$
begin
  perform save_member(get_member('10000000-0000-0000-0000-000000000002') || '{"is_system_admin":true}');
  assert not (select is_system_admin from members where id = '10000000-0000-0000-0000-000000000002'), '一般 Admin 不能自封';
end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';  -- 系統管理員
do $$
begin
  perform save_member(get_member('10000000-0000-0000-0000-000000000002') || '{"is_system_admin":true}');
  assert (get_member('10000000-0000-0000-0000-000000000002') ->> 'is_system_admin')::boolean, '系統管理員可指定其他 Admin';
  -- 非 Admin 不能成為系統管理員：同時改成 member 時自動取消
  perform save_member(get_member('10000000-0000-0000-0000-000000000003') || '{"is_system_admin":true,"app_role":"member"}');
  assert not (select is_system_admin from members where id = '10000000-0000-0000-0000-000000000003');
  -- 取消其他人的系統管理員
  perform save_member(get_member('10000000-0000-0000-0000-000000000002') || '{"is_system_admin":false}');
  assert not (select is_system_admin from members where id = '10000000-0000-0000-0000-000000000002');
  -- 不能取消最後一位
  begin perform save_member(get_member('10000000-0000-0000-0000-000000000001') || '{"is_system_admin":false}'); raise exception 'x';
  exception when insufficient_privilege then assert sqlerrm like '%系統管理員%'; end;
end $$;
reset role;
reset request.jwt.claim.sub;

-- is_system_admin 只在 app_role = 'admin' 時有效
do $$
begin
  alter table members drop constraint members_system_admin_is_admin;
  alter table members disable trigger members_protect_admin;  -- 模擬旗標殘留
  update members set app_role = 'member' where id = '10000000-0000-0000-0000-000000000002';
  update members set is_system_admin = true where id = '10000000-0000-0000-0000-000000000002';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
  assert (select is_system_admin from members where id = '10000000-0000-0000-0000-000000000002');
  assert not is_system_admin(), 'app_role 不是 admin 時旗標無效';
  reset role;
  raise exception 'rollback' using errcode = 'P0001';
exception when raise_exception then
  if sqlerrm <> 'rollback' then raise; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 階段 6：Resources API（migration 13）
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';  -- 張家豪（member）
do $$
declare
  v_slug text;
  v_doc uuid;
  v_ver int;
  v_faq uuid;
  v_sw uuid;
  v_pl uuid;
  v_ai uuid;
  j jsonb;
begin
  -- Orientation
  assert jsonb_array_length(list_documents()) = 3;
  assert get_document('welcome') ->> 'content' like '# 歡迎加入%';
  v_slug := save_document('{"title":"Python Environment","parent_id":"60000000-0000-0000-0000-000000000001"}');
  assert v_slug = 'python-environment', v_slug;
  v_slug := save_document('{"title":"顯微鏡操作"}');
  assert v_slug ~ '^page-[0-9a-f]{6}$', '中文標題使用 page-xxxxxx';
  begin perform save_document('{"title":"x","slug":"welcome"}'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'slugTaken'; end;
  begin perform save_document('{"title":"x","slug":"Bad Slug"}'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'slugInvalid'; end;
  begin perform save_document(get_document('welcome') || '{"parent_id":"60000000-0000-0000-0000-000000000002"}'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'invalidParent'; end;
  v_doc := (get_document('python-environment') ->> 'id')::uuid;
  v_ver := save_document_content(v_doc, E'# Python\n\n用 conda。', 0);
  assert v_ver = 1;
  begin perform save_document_content(v_doc, 'stale', 0); raise exception 'x';
  exception when serialization_failure then assert sqlerrm = 'conflict'; end;
  assert (get_document('python-environment') -> 'updated_by' ->> 'name') = '張家豪';
  -- 只能刪自己建立的頁面
  begin perform delete_document('60000000-0000-0000-0000-000000000003'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  assert not (get_document('welcome') ->> 'deletable')::boolean and (get_document('welcome') ->> 'editable')::boolean;
  perform delete_document(v_doc);

  -- FAQ
  v_faq := save_faq('{"question":"印表機在哪？","answer":"R911 門口","category":"行政","tags":["設備"," 設備 "]}');
  assert jsonb_array_length(list_faqs('{"q":"印表機"}')) = 1;
  assert jsonb_array_length(list_faqs('{"q":"設備"}')) = 1, '可搜尋標籤';
  assert (select tags from faqs where id = v_faq) = array['設備'];
  assert exists (select 1 from jsonb_array_elements(faq_categories()) c where c ->> 'category' = '行政' and (c ->> 'count')::int = 2);
  begin perform save_faq('{"question":" "}'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'titleRequired'; end;
  -- 協作 wiki：可以編輯別人的 FAQ，但不能刪除
  perform save_faq('{"id":"70000000-0000-0000-0000-000000000001","question":"如何申請 NAS 帳號？","answer":"更新後的答案","category":"帳號與系統"}');
  begin perform delete_faq('70000000-0000-0000-0000-000000000001'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  perform delete_faq(v_faq);

  -- 軟體
  v_sw := save_software('{"name":"Python","category":"程式語言","url":"javascript:alert(1)","docs_url":"https://docs.python.org"}');
  j := get_software(v_sw);
  assert j ->> 'url' is null and j ->> 'docs_url' = 'https://docs.python.org', '只接受 http(s) 網址';
  assert jsonb_array_length(list_software('{"category":"程式語言"}')) = 2;

  -- Pipelines：維護者以外不能修改
  begin perform save_pipeline(get_pipeline('90000000-0000-0000-0000-000000000001') || '{"name":"改名"}'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  assert not (get_pipeline('90000000-0000-0000-0000-000000000001') ->> 'editable')::boolean;
  v_pl := save_pipeline('{"name":"AO 校正","tags":["AO"],"steps":[{"title":"量測","code":"python measure.py","code_language":"Python"},{"title":"校正"}]}');
  assert (get_pipeline(v_pl) -> 'steps' -> 0 ->> 'code_language') = 'python';
  perform save_pipeline(get_pipeline(v_pl) || '{"steps":[{"title":"校正"},{"title":"量測"},{"title":"驗證"}]}');
  assert (select string_agg(title, ',' order by step_order) from pipeline_steps where pipeline_id = v_pl) = '校正,量測,驗證';
  begin perform save_pipeline(get_pipeline(v_pl) || '{"steps":[{"title":""}]}'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'titleRequired'; end;
  assert jsonb_array_length(list_pipelines('{"tag":"AO"}')) = 1;
  perform delete_pipeline(v_pl);

  -- 會議：出席者可編輯
  j := get_meeting('40000000-0000-0000-0000-000000000001');
  assert (j ->> 'editable')::boolean and jsonb_array_length(j -> 'action_items') = 2;
  assert not (get_meeting('40000000-0000-0000-0000-000000000002') ->> 'editable')::boolean;
  v_ver := save_meeting_summary('40000000-0000-0000-0000-000000000001', E'## 新紀錄', (j ->> 'summary_version')::int);
  begin perform save_meeting_summary('40000000-0000-0000-0000-000000000001', 'stale', 0); raise exception 'x';
  exception when serialization_failure then null; end;
  begin perform save_meeting_summary('40000000-0000-0000-0000-000000000002', 'x', 0); raise exception 'x';
  exception when insufficient_privilege then null; end;
  begin perform save_meeting(get_meeting('40000000-0000-0000-0000-000000000002') || '{"title":"改"}'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  -- Action item：新增、勾選完成會同步已轉換的任務
  v_ai := save_action_item('{"meeting_id":"40000000-0000-0000-0000-000000000001","content":"整理校正數據","assignee_id":"10000000-0000-0000-0000-000000000005"}');
  assert (select position from action_items where id = v_ai) = 3;
  perform save_action_item(jsonb_build_object('id', (select id from action_items where task_id = '50000000-0000-0000-0000-000000000001'),
                                              'content', '完成 Nature Methods 審稿回覆初稿', 'is_done', true));
  assert (select status from tasks where id = '50000000-0000-0000-0000-000000000001') = 'done', '同步任務狀態';
  perform save_action_item(jsonb_build_object('id', (select id from action_items where task_id = '50000000-0000-0000-0000-000000000001'),
                                              'content', '完成 Nature Methods 審稿回覆初稿', 'is_done', false));
  assert (select status from tasks where id = '50000000-0000-0000-0000-000000000001') = 'todo';
  perform convert_action_item_to_task(v_ai);
  assert (get_meeting('40000000-0000-0000-0000-000000000001') -> 'action_items' -> 2 -> 'task' ->> 'title') = '整理校正數據';
  perform delete_action_item(v_ai);
  -- 新會議：建立者自動可編輯，出席者與專案
  v_doc := save_meeting(jsonb_build_object('title', '小組討論', 'type', 'one_on_one',
         'starts_at', '2026-11-03T06:00:00Z', 'ends_at', '2026-11-03T07:00:00Z',
         'attendees', '[{"member_id":"10000000-0000-0000-0000-000000000001","is_presenter":false},{"member_id":"10000000-0000-0000-0000-000000000005","is_presenter":true}]'::jsonb,
         'project_ids', '["20000000-0000-0000-0000-000000000001"]'::jsonb));
  j := get_meeting(v_doc);  -- stable 函式看不到同一個 statement 內新增的資料，分開呼叫
  assert jsonb_array_length(j -> 'attendees') = 2 and (j -> 'attendees' -> 0 ->> 'is_presenter')::boolean;
  assert (j -> 'projects' -> 0 ->> 'id') = '20000000-0000-0000-0000-000000000001';
  begin perform save_meeting('{"title":"x","starts_at":"2026-11-03T06:00:00Z","ends_at":"2026-11-03T05:00:00Z"}'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'dateOrder'; end;
  begin perform save_meeting('{"title":"x"}'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'dateRequired'; end;
  assert jsonb_array_length(list_meetings('{"type":"one_on_one","member_id":"10000000-0000-0000-0000-000000000005"}')) = 1;
  assert jsonb_array_length(list_meetings('{"q":"新紀錄"}')) = 1, '可搜尋會議紀錄內文';
  perform delete_meeting((j ->> 'id')::uuid);
end $$;

-- viewer：可讀不可寫
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000013';
do $$
begin
  assert jsonb_array_length(list_faqs()) >= 5;
  assert not (get_document('welcome') ->> 'editable')::boolean;
  begin perform save_faq('{"question":"x"}'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  begin perform save_document_content('60000000-0000-0000-0000-000000000001', 'x', 0); raise exception 'x';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
reset request.jwt.claim.sub;

-- 會議連結（migration 14）
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';  -- 張家豪（出席者）
do $$
declare
  j jsonb;
begin
  perform save_meeting((get_meeting('40000000-0000-0000-0000-000000000001') - 'attendees') || jsonb_build_object('links', jsonb_build_array(
    jsonb_build_object('label', ' 投影片 ', 'url', 'https://docs.google.com/presentation/d/abc'),
    jsonb_build_object('label', '', 'url', 'https://youtu.be/xyz'),
    jsonb_build_object('label', '壞連結', 'url', 'javascript:alert(1)'))));
  j := get_meeting('40000000-0000-0000-0000-000000000001') -> 'links';
  assert jsonb_array_length(j) = 2, j::text;
  assert j -> 0 ->> 'label' = '投影片' and j -> 1 ->> 'url' = 'https://youtu.be/xyz';
  -- 沒有送 links 時保留原本的連結
  perform save_meeting(get_meeting('40000000-0000-0000-0000-000000000001') - 'links' - 'attendees');
  assert jsonb_array_length(get_meeting('40000000-0000-0000-0000-000000000001') -> 'links') = 2;
  assert jsonb_array_length((list_meetings('{"q":"AO 系統進度"}') -> 0) -> 'links') = 2;
end $$;
reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- 階段 7：搜尋、活動紀錄、頁面設定（migration 15）
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';  -- 張家豪（member）
do $$
declare
  j jsonb;
  k jsonb;
  v_first bigint;
begin
  assert (select link_key from search_all('實驗室規範') where entity_type = 'document' limit 1) = 'lab-rules', '文件回傳網址代稱';
  assert exists (select 1 from search_all('96-well') where entity_type = 'meeting'), '可搜尋 Action items';
  assert exists (select 1 from search_all('R911') where entity_type = 'meeting'), '可搜尋會議地點';
  assert not exists (select 1 from search_all('   '));
  -- 活動紀錄：產生一筆再查詢
  perform save_faq('{"question":"活動紀錄測試題","category":"一般"}');
  j := t_list_activity('{"entity_type":"faq","limit":5}');
  assert j -> 0 ->> 'entity_title' = '活動紀錄測試題' and j -> 0 ->> 'action' = 'insert';
  assert j -> 0 -> 'actor' ->> 'name' = '張家豪';
  assert j -> 0 ->> 'link_key' = j -> 0 ->> 'entity_id', '仍存在的資料有連結';
  assert jsonb_array_length(t_list_activity('{"actor_id":"10000000-0000-0000-0000-000000000005","limit":2}')) = 2;
  -- 往前翻頁
  v_first := (t_list_activity('{"limit":1}') -> 0 ->> 'id')::bigint;
  k := t_list_activity(jsonb_build_object('before', v_first, 'limit', 3));
  assert (k -> 0 ->> 'id')::bigint <> v_first and (k -> 0 ->> 'created_at')::timestamptz <= (t_list_activity('{"limit":1}') -> 0 ->> 'created_at')::timestamptz, '往前翻頁';
  assert (k -> 0 ->> 'created_at')::timestamptz >= (k -> 1 ->> 'created_at')::timestamptz, '依時間排序';
  -- 只動到 user_id 的更新（帳號綁定）不列出
  assert not exists (select 1 from jsonb_array_elements(t_list_activity('{"entity_type":"member","limit":100}')) x
                      where x ->> 'action' = 'update' and (x -> 'changes') ?& array['user_id'] and (select count(*) from jsonb_object_keys(x -> 'changes')) = 1);
  perform delete_faq((j -> 0 ->> 'entity_id')::uuid);
  assert (t_list_activity('{"entity_type":"faq","limit":1}') -> 0 ->> 'action') = 'delete';
  assert (t_list_activity('{"entity_type":"faq","limit":1}') -> 0 ->> 'link_key') is null, '已刪除的資料沒有連結';
  -- 文件：以網址代稱連結
  perform save_document_content('60000000-0000-0000-0000-000000000002', E'# 實驗室規範\n\n更新', (get_document('lab-rules') ->> 'content_version')::int);
  assert (t_list_activity('{"entity_type":"document","limit":1}') -> 0 ->> 'link_key') = 'lab-rules';
  -- 頁面設定：一般成員不能修改
  assert jsonb_array_length(list_page_settings()) = 12;
  begin perform save_page_setting('faq', '🙋', 'Q&A', 'Q&A'); raise exception 'x';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';  -- Admin
do $$
begin
  perform save_page_setting('faq', '🙋', ' 問與答 ', 'Q&A');
  assert (select emoji || title || title_en from page_settings where key = 'faq') = '🙋問與答Q&A';
  begin perform save_page_setting('faq', '', '', 'x'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'titleRequired'; end;
  begin perform save_page_setting('nope', '', 'a', 'b'); raise exception 'x';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- 階段 8：Notion 匯入（migration 16）— 使用合成資料
-- ---------------------------------------------------------------------------
create temporary table _np (p jsonb);
insert into _np values ($json${
  "mode": "skip",
  "members": [
    {"key": "row:a", "notion_id": "aaaa0000000000000000000000000001", "name": "Notion 新人", "email": "Newbie@Notion.test", "position": "phd", "research_interests": ["單細胞"], "bio": "從 Notion 匯入", "project_notion_ids": ["bbbb0000000000000000000000000001"]},
    {"key": "member:pi", "existing_id": "10000000-0000-0000-0000-000000000001", "name": "Tsung-Lin Liu"},
    {"key": "person:helper", "notion_id": "person:helper", "name": "Helper"}
  ],
  "projects": [{"notion_id": "bbbb0000000000000000000000000001", "title": "Notion 專案", "status": "active", "progress": 67,
                "start_date": "2025-08-01", "due_date": "2025-07-01", "description": "摘要", "content": "# 內容\n\n[子頁](/notion/eeee0000000000000000000000000002)",
                "tags": ["農業部"], "owner_key": "member:pi", "member_keys": ["person:helper", "missing"]}],
  "tasks": [{"notion_id": "cccc0000000000000000000000000001", "title": "Notion 任務", "description": "", "status": "done", "priority": "high",
             "due_date": "2025-08-31", "project_notion_id": "bbbb0000000000000000000000000001", "assignee_keys": ["row:a"]}],
  "publications": [{"notion_id": "dddd0000000000000000000000000001", "title": "Notion 論文", "stage": "submitted", "venue": "Bioinformatics", "doi": "",
                    "submitted_at": "2025-09-01", "published_at": null, "notes": "", "project_notion_id": "bbbb0000000000000000000000000001",
                    "authors": [{"key": "row:a", "name": "Notion 新人", "is_first": true, "is_corresponding": false},
                                {"key": null, "name": "External Author", "is_first": false, "is_corresponding": true}]}],
  "software": [{"notion_id": "ffff0000000000000000000000000001", "name": "SLiM", "category": "", "purpose": "模擬", "access_info": "- **版本**：V4.3",
                "install_guide": "```bash\nmake\n```", "url": "https://messerlab.org/slim/", "docs_url": "ftp://bad", "contact_key": "row:a"}],
  "pipelines": [{"notion_id": "ffff0000000000000000000000000002", "name": "Variant calling", "description": "## 使用工具", "version": "",
                 "tags": ["GATK", "GATK"], "maintainer_key": "person:helper", "project_notion_id": "bbbb0000000000000000000000000001"}],
  "meetings": [{"notion_id": "ffff0000000000000000000000000003", "title": "Progress meeting", "type": "lab_meeting", "starts_at": "2025-09-05T00:00:00+08:00",
                "summary": "> 備註", "links": [{"label": "會議連結", "url": "https://teams.microsoft.com/x"}],
                "attendee_keys": ["row:a", "member:pi"], "project_notion_ids": ["bbbb0000000000000000000000000001"]}],
  "documents": [{"notion_id": "notion-import-root", "title": "Notion 匯入", "content": "", "parent_notion_id": null},
                {"notion_id": "eeee0000000000000000000000000002", "title": "Variant Calling Pipeline Guide", "content": "步驟", "parent_notion_id": "notion-import-root"}],
  "faqs": [{"notion_id": "eeee0000000000000000000000000003-1", "question": "Who do I ask?", "answer": "PI", "category": "Notion"}]
}$json$);
grant select on _np to authenticated;

-- 非 Admin 不能匯入
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';
do $$
begin
  begin perform import_notion((select p from _np)); raise exception 'x';
  exception when insufficient_privilege then assert sqlerrm = 'noPermission', sqlerrm; end;
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';  -- 系統管理員
do $$
declare
  s jsonb;
  v_member uuid;
  v_project uuid;
begin
  s := import_notion((select p from _np));
  assert (s -> 'members' ->> 'created')::int = 2 and (s -> 'members' ->> 'linked')::int = 1, s::text;
  assert (s -> 'projects' ->> 'created')::int = 1 and (s -> 'documents' ->> 'created')::int = 2, s::text;
  select id into v_member from members where notion_id = 'aaaa0000000000000000000000000001';
  select id into v_project from projects where notion_id = 'bbbb0000000000000000000000000001';
  assert (select email = 'newbie@notion.test' and position = 'phd' and app_role = 'member' from members where id = v_member);
  assert (select status = 'active' and progress = 67 and due_date is null and owner_id = '10000000-0000-0000-0000-000000000001'
            and content like '# 內容%' from projects where id = v_project), '截止日早於開始日時不填';
  assert (select count(*) from project_members where project_id = v_project) = 2, '專案成員（Helper + 目錄中的參與專案）';
  assert exists (select 1 from task_assignees ta join tasks t on t.id = ta.task_id
                  where t.notion_id = 'cccc0000000000000000000000000001' and ta.member_id = v_member and t.project_id = v_project);
  assert (select string_agg(coalesce(display_name, '#') || ':' || is_first_author || is_corresponding, ',' order by author_order)
            from publication_authors pa join publications pb on pb.id = pa.publication_id
           where pb.notion_id = 'dddd0000000000000000000000000001') = '#:truefalse,External Author:falsetrue';
  assert (select category = '其他' and docs_url is null and contact_id = v_member from software_tools where notion_id = 'ffff0000000000000000000000000001');
  assert (select tags = array['GATK'] and version = '1.0.0' and project_id = v_project from pipelines where notion_id = 'ffff0000000000000000000000000002');
  assert (select jsonb_array_length(links) = 1 from meetings where notion_id = 'ffff0000000000000000000000000003');
  assert (select count(*) from meeting_attendees ma join meetings m on m.id = ma.meeting_id where m.notion_id = 'ffff0000000000000000000000000003') = 2;
  assert (select p.notion_id from documents d join documents p on p.id = d.parent_id where d.notion_id = 'eeee0000000000000000000000000002') = 'notion-import-root';
  assert (select slug from documents where notion_id = 'eeee0000000000000000000000000002') = 'variant-calling-pipeline-guide';
  assert resolve_notion('eeee0000000000000000000000000002') ->> 'slug' = 'variant-calling-pipeline-guide';
  assert resolve_notion('bbbb0000000000000000000000000001') ->> 'id' = v_project::text;
  assert resolve_notion('nope') is null;
  -- 再匯入一次（略過已存在）：不重複
  s := import_notion((select p from _np));
  assert (s -> 'projects' ->> 'skipped')::int = 1 and (s -> 'projects' ->> 'created') is null, s::text;
  assert (select count(*) from members where notion_id in ('aaaa0000000000000000000000000001', 'person:helper')) = 2;
  assert (select count(*) from documents where notion_id like 'notion-import-root') = 1;
  -- 以 Notion 內容更新
  s := import_notion(jsonb_set(jsonb_set((select p from _np), '{mode}', '"update"'), '{projects,0,title}', '"Notion 專案（更新）"'));
  assert (s -> 'projects' ->> 'updated')::int = 1, s::text;
  assert (select title from projects where id = v_project) = 'Notion 專案（更新）';
  assert (select count(*) from publication_authors pa join publications pb on pb.id = pa.publication_id
           where pb.notion_id = 'dddd0000000000000000000000000001') = 2, '更新時作者不重複';
  begin perform import_notion('{"mode":"x"}'); raise exception 'x';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
reset request.jwt.claim.sub;

-- 網址代稱：截斷後不以連字號結尾
do $$
begin
  assert document_slug('Single-Sample Variant Calling HaplotypeCaller GVCF Interpretation Report Extra') !~ '-$';
  assert document_slug(repeat('ab-', 40)) ~ '^[a-z0-9]+(-[a-z0-9]+)*$';
end $$;

-- ---------------------------------------------------------------------------
-- 階段 9：行事曆、個人化 Dashboard（migration 17）
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';  -- 張家豪（member）
do $$
declare
  v_ev uuid;
  v_all uuid;
  j jsonb;
  d date := lab_today();
begin
  v_ev := save_calendar_event(jsonb_build_object('title', '顯微鏡預約', 'category', 'booking', 'location', 'R911',
            'starts_at', (d + 1 + time '09:00') at time zone 'Asia/Taipei', 'ends_at', (d + 1 + time '13:00') at time zone 'Asia/Taipei',
            'member_ids', jsonb_build_array('10000000-0000-0000-0000-000000000006'), 'project_id', '20000000-0000-0000-0000-000000000001'));
  v_all := save_calendar_event(jsonb_build_object('title', '研討會', 'all_day', true,
            'starts_at', (d + 2)::timestamp at time zone 'Asia/Taipei', 'ends_at', (d + 4)::timestamp at time zone 'Asia/Taipei'));
  j := list_calendar(d, d + 6, '{"kinds":["event"]}');
  assert jsonb_array_length(j) = 2, j::text;
  assert (j -> 0 ->> 'title') = '顯微鏡預約' and (j -> 0 ->> 'start_date')::date = d + 1 and (j -> 0 -> 'project' ->> 'title') is not null;
  assert (j -> 1 ->> 'end_date')::date = d + 4 and (j -> 1 ->> 'all_day')::boolean, '跨日全天活動';
  -- 跨日活動：範圍只涵蓋中間某天也會出現
  assert jsonb_array_length(list_calendar(d + 3, d + 3, '{"kinds":["event"]}')) = 1;
  -- 任務截止日、會議、論文截止日
  assert exists (select 1 from jsonb_array_elements(list_calendar(d - 30, d + 30, '{}')) x where x ->> 'kind' = 'task');
  assert exists (select 1 from jsonb_array_elements(list_calendar(d - 30, d + 30, '{}')) x where x ->> 'kind' = 'meeting');
  assert not exists (select 1 from jsonb_array_elements(list_calendar(d - 365, d + 365, '{"kinds":["task"]}')) x where x ->> 'status' = 'done');
  -- 只看自己的
  assert not exists (select 1 from jsonb_array_elements(list_calendar(d - 30, d + 30, '{"mine":true}')) x where not (x ->> 'mine')::boolean);
  -- 驗證
  begin perform save_calendar_event('{"title":" ","starts_at":"2026-11-01T00:00:00Z"}'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'titleRequired'; end;
  begin perform save_calendar_event('{"title":"x","starts_at":"2026-11-02T00:00:00Z","ends_at":"2026-11-01T00:00:00Z"}'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'dateOrder'; end;
  -- 活動紀錄與搜尋
  assert (t_list_activity('{"entity_type":"calendar_event","limit":1}') -> 0 ->> 'link_key') = to_char(d + 2, 'YYYY-MM-DD');
  assert (select link_key from search_all('顯微鏡預約') where entity_type = 'calendar_event') = to_char(d + 1, 'YYYY-MM-DD');
  -- Dashboard：未來 7 天、專案 mine 標示、個人設定
  j := get_dashboard(14);
  assert jsonb_array_length(j -> 'upcoming') >= 2;
  assert exists (select 1 from jsonb_array_elements(j -> 'projects') x where (x ->> 'mine')::boolean);
  assert exists (select 1 from jsonb_array_elements(j -> 'projects') x where not (x ->> 'mine')::boolean);
  assert j -> 'prefs' = '{}'::jsonb;
  j := save_dashboard_prefs('{"order":["calendar","nope","my_tasks"],"hidden":["kpis","kpis","x"],"hide_empty":false,"scope":{"projects":"mine","deadlines":"bad"}}');
  assert j -> 'order' = '["calendar","my_tasks"]' and j -> 'hidden' = '["kpis"]' and not (j ->> 'hide_empty')::boolean;
  assert j -> 'scope' ->> 'projects' = 'mine' and j -> 'scope' ->> 'deadlines' = 'auto';
  assert get_dashboard(14) -> 'prefs' -> 'scope' ->> 'projects' = 'mine';
  -- 自己建立的可以刪除
  perform delete_calendar_event(v_all);
end $$;

-- 共同編輯：其他成員可以修改、不能刪除；看不到別人的個人設定
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';  -- 陳怡君（admin）
do $$
begin
  assert (select count(*) from member_preferences) = 0, '只看得到自己的設定';
end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000013';  -- 楊子豪（viewer）
do $$
declare
  v uuid := (select id from calendar_events where title = '顯微鏡預約');
begin
  assert v is not null, 'viewer 可讀';
  begin perform save_calendar_event(jsonb_build_object('id', v, 'title', '改', 'starts_at', now())); raise exception 'x';
  exception when insufficient_privilege then null; end;
  begin perform save_calendar_event('{"title":"x","starts_at":"2026-11-01T00:00:00Z"}'); raise exception 'x';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
reset request.jwt.claim.sub;
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000006';  -- 黃柏翰（member，非建立者）
do $$
declare
  v uuid := (select id from calendar_events where title = '顯微鏡預約');
begin
  perform save_calendar_event(jsonb_build_object('id', v, 'title', '顯微鏡預約（延長）', 'starts_at', (select starts_at from calendar_events where id = v)));
  assert (select title from calendar_events where id = v) = '顯微鏡預約（延長）', '成員可共同編輯';
  begin perform delete_calendar_event(v); raise exception 'x';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
reset request.jwt.claim.sub;

-- =============================================================================
-- 階段 10：未登入唯讀（不含會議、未發表論文、行事曆、email、附件）；活動紀錄批量刪除
-- =============================================================================
set role anon;
do $$
declare
  j jsonb;
  n int;
begin
  assert (select count(*) from projects) > 0, 'anon 可讀專案';
  assert (select count(*) from tasks) > 0 and (select count(*) from task_assignees) > 0, 'anon 可讀任務';
  assert (select count(*) from documents) > 0 and (select count(*) from faqs) > 0, 'anon 可讀文件／FAQ';
  assert (select count(*) from software_tools) > 0 and (select count(*) from pipeline_steps) > 0, 'anon 可讀軟體／流程';
  assert (select count(*) from publications) > 0, 'anon 可讀已發表論文';
  assert not exists (select 1 from publications where stage <> 'published'), 'anon 不可讀未發表論文';
  assert not exists (select 1 from publication_authors pa where not exists (select 1 from publications p where p.id = pa.publication_id)),
    'anon 不可讀未發表論文作者';
  assert (select count(*) from meetings) = 0 and (select count(*) from meeting_attendees) = 0
     and (select count(*) from action_items) = 0, 'anon 不可讀會議';
  assert (select count(*) from calendar_events) = 0 and (select count(*) from calendar_event_members) = 0, 'anon 不可讀行事曆';
  assert (select count(*) from attachments) = 0, 'anon 不可讀附件';
  assert (select count(*) from invite_codes) = 0, 'anon 不可讀邀請碼';
  assert (select count(*) from member_preferences) = 0;
  begin perform 1 from activity_log; raise exception 'anon 不應可讀活動紀錄';
  exception when insufficient_privilege then null; end;
  begin perform user_id from members limit 1; raise exception 'x';
  exception when insufficient_privilege then null; end;
  begin perform app_role from members limit 1; raise exception 'x';
  exception when insufficient_privilege then null; end;
  -- 寫入一律拒絕
  begin insert into projects (title) values ('x'); raise exception 'anon 不應可新增';
  exception when insufficient_privilege then null; end;
  begin update faqs set question = 'x'; raise exception 'anon 不應可修改';
  exception when insufficient_privilege then null; end;
  begin delete from activity_log; raise exception 'anon 不應可刪除';
  exception when insufficient_privilege then null; end;
  begin perform save_task('{"title":"x"}'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  begin perform create_invite_code('member', 'phd', null, null, 1, 7, null); raise exception 'x';
  exception when insufficient_privilege then null; end;
  begin perform delete_activity('{"before":"2100-01-01"}'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  begin perform list_meetings('{}'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  -- 讀取函式
  j := list_members('{}');
  assert jsonb_array_length(j) > 0, 'anon list_members';
  assert not exists (select 1 from jsonb_array_elements(j) e where e ->> 'email' is not null or (e ->> 'has_account')::boolean
                       or (e ->> 'is_system_admin')::boolean), 'anon 看不到 email／帳號資訊';
  assert jsonb_array_length(list_members('{"q":"tllab.example"}')) = 0, 'anon 不能以 email 搜尋';
  j := get_member('10000000-0000-0000-0000-000000000001');
  assert j ->> 'name' = 'Tsung-Lin Liu' and j ->> 'email' is null, 'anon get_member';
  assert jsonb_array_length(list_projects('{}')) = (select count(*) from projects);
  j := get_project('20000000-0000-0000-0000-000000000001');
  assert j ->> 'title' is not null and not (j ->> 'editable')::boolean, 'anon get_project 不可編輯';
  assert jsonb_array_length(list_attachments('project', '20000000-0000-0000-0000-000000000001')) = 0;
  assert jsonb_array_length(list_tasks('{}')) > 0;
  assert not exists (select 1 from jsonb_array_elements(list_tasks('{}')) e where e -> 'meeting' <> 'null'::jsonb), '任務不帶出會議';
  assert not exists (select 1 from jsonb_array_elements(list_publications('{}')) e where e ->> 'stage' <> 'published');
  perform publication_year_stats();
  perform form_options();
  j := get_dashboard(14);
  assert (j -> 'kpis') is not null and jsonb_array_length(j -> 'upcoming') = 0, 'anon get_dashboard';
  assert jsonb_array_length(list_calendar(current_date - 60, current_date + 60, '{}')) = 0
      or not exists (select 1 from jsonb_array_elements(list_calendar(current_date - 60, current_date + 60, '{}')) e
                      where e ->> 'kind' in ('event', 'meeting')), 'anon 行事曆沒有活動／會議';
  assert jsonb_array_length(list_documents('orientation')) > 0;
  assert jsonb_array_length(list_faqs('{}')) > 0 and jsonb_array_length(list_software('{}')) > 0
     and jsonb_array_length(list_pipelines('{}')) > 0;
  perform faq_categories();
  perform list_page_settings();
  select count(*) into n from search_all('Lab meeting', 50) s where s.entity_type in ('meeting', 'calendar_event');
  assert n = 0, 'anon 搜尋不到會議';
  select count(*) into n from search_all('tllab.example', 50);
  assert n = 0, 'anon 不能以 email 搜尋成員';
  assert (select count(*) from search_all('斑馬魚', 50)) > 0, 'anon 可搜尋公開資料';
  begin perform list_activity('{}'); raise exception 'anon 不應可呼叫 list_activity';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 登入後仍看得到 email（member_card 沒有遮蔽）
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';
do $$
begin
  assert get_member('10000000-0000-0000-0000-000000000001') ->> 'email' is not null, '登入後可看到 email';
  assert exists (select 1 from meetings), '登入後可看到會議';
  assert (select count(*) from activity_log) = 0 and jsonb_array_length(list_activity('{}')) = 0, '一般成員看不到活動紀錄';
  begin perform delete_activity('{"before":"2100-01-01"}'); raise exception '一般成員不可批量刪除';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';  -- 陳怡君（admin，非系統管理員）
do $$
begin
  assert (select count(*) from activity_log) > 0, 'Admin 看得到活動紀錄';
  begin perform delete_activity('{"before":"2100-01-01"}'); raise exception '管理員不可批量刪除';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';  -- PI（系統管理員）
do $$
declare
  total int := (select count(*) from activity_log);
  v_ids bigint[] := (select array_agg(id) from (select id from activity_log order by created_at desc limit 2) x);
  v_old int := (select count(*) from activity_log where entity_type = 'faq' and created_at < (lab_today() - 1)::timestamp at time zone 'Asia/Taipei');
  n int;
begin
  begin perform delete_activity('{}'); raise exception 'x';
  exception when invalid_parameter_value then null; end;
  n := delete_activity(jsonb_build_object('ids', to_jsonb(v_ids)));
  assert n = 2 and (select count(*) from activity_log) = total - 2, '依 id 刪除';
  n := delete_activity(jsonb_build_object('before', lab_today() - 1, 'entity_type', 'faq'));
  assert n = v_old, '依日期與類型刪除';
  assert not exists (select 1 from activity_log where entity_type = 'faq' and created_at < (lab_today() - 1)::timestamp at time zone 'Asia/Taipei');
  n := delete_activity(jsonb_build_object('before', lab_today() + 1, 'actor_id', '10000000-0000-0000-0000-000000000001'));
  assert not exists (select 1 from activity_log where actor_id = '10000000-0000-0000-0000-000000000001');
  assert (select count(*) from activity_log) > 0, '其他成員的紀錄保留';
end $$;
reset role;
reset request.jwt.claim.sub;

drop function public.t_activity();
drop function public.t_list_activity(jsonb);
